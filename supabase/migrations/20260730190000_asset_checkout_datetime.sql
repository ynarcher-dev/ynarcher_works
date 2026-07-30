-- =====================================================================
-- [OFFICE] 반출대장 2차 — 날짜를 일시로, 화면의 주인공을 물품으로
--
-- 기획: docs_planning/3_1_2_office_asset_checkout.md
--
-- 처음에는 점유 단위를 '날짜'로 잡았다(하루를 통째로). 실제로는 오전에 나갔다가 오후에
-- 돌아오는 물건이 흔해서, 하루를 통째로 잡으면 같은 날 다음 사람이 쓸 수 없다. 시각까지
-- 받으면 그 문제가 사라지고, 겹침 판정도 회의실과 같은 반열림 구간('[)')으로 정리된다 —
-- 10시 반납과 10시 반출은 겹치지 않는다.
--
-- 사진은 반출 화면이 물건을 알아보는 유일한 단서라 함께 연다. asset-photos 버킷의
-- 조회 권한을 management에서 내부 임직원으로 넓힌다(공개로 바꾸는 것이 아니다 —
-- 버킷은 그대로 비공개이며 표시에는 단기 Signed URL을 쓴다).
--
-- 소유 워크스페이스: office / 데이터 등급: Internal
-- 접근 주체: 내부 임직원(외부 게스트 차단) / Scope: global / 감사 로그: 미대상
-- =====================================================================

-- 1) 기간 컬럼: date → timestamptz -------------------------------------------
-- 제약이 컬럼을 잡고 있으므로 먼저 떼어낸다.
alter table public.asset_checkouts
  drop constraint if exists asset_checkouts_no_overlap,
  drop constraint if exists asset_checkouts_period,
  drop constraint if exists asset_checkouts_returned_pair,
  drop constraint if exists asset_checkouts_returned_after;

drop index if exists public.idx_asset_checkouts_status_due;
drop index if exists public.idx_asset_checkouts_mine;
drop index if exists public.idx_asset_checkouts_asset;

do $$
begin
  if exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'asset_checkouts'
       and column_name = 'checkout_on'
  ) then
    alter table public.asset_checkouts rename column checkout_on to checkout_at;
    alter table public.asset_checkouts rename column due_on to due_at;
    alter table public.asset_checkouts rename column returned_on to returned_at;
  end if;
end $$;

alter table public.asset_checkouts
  alter column checkout_at type timestamptz using checkout_at::timestamptz,
  alter column due_at      type timestamptz using due_at::timestamptz,
  alter column returned_at type timestamptz using returned_at::timestamptz;

-- 2) 제약 복원 ---------------------------------------------------------------
alter table public.asset_checkouts
  -- 길이가 0인 반출은 뜻이 없다(시각을 받는 순간 같은 시각 반출·반납은 기록이 아니다).
  add constraint asset_checkouts_period check (due_at > checkout_at),
  add constraint asset_checkouts_returned_pair
    check ((status = 'RETURNED') = (returned_at is not null)),
  add constraint asset_checkouts_returned_after
    check (returned_at is null or returned_at >= checkout_at);

-- 반열림 구간 '[)': 10시 반납과 10시 반출은 겹치지 않는다(회의실 예약과 같은 규칙).
-- 승인 대기도 기간을 잡는다 — 잡지 않으면 승인이 떨어지는 순간 겹침으로 실패하고,
-- 그 실패는 승인권자의 잘못이 아닌데 승인권자 앞에서 일어난다.
alter table public.asset_checkouts
  add constraint asset_checkouts_no_overlap
  exclude using gist (
    asset_id with =,
    tstzrange(checkout_at, due_at, '[)') with &&
  ) where (deleted_at is null and status in ('PENDING', 'RESERVED', 'OUT'));

create index if not exists idx_asset_checkouts_status_due
  on public.asset_checkouts (status, due_at)
  where deleted_at is null;
create index if not exists idx_asset_checkouts_mine
  on public.asset_checkouts (created_by, checkout_at desc)
  where deleted_at is null;
create index if not exists idx_asset_checkouts_asset
  on public.asset_checkouts (asset_id, checkout_at desc)
  where deleted_at is null;

comment on column public.asset_checkouts.due_at is
  '반납 예정 일시. 기간 점유의 끝이라 필수다(끝이 없으면 겹침을 판정할 수 없다).';
comment on column public.asset_checkouts.returned_at is
  '실제 반납 일시. 상태 RETURNED와 짝을 이룬다(check 제약).';
comment on table public.asset_checkouts is
  'OFFICE 반출대장. 반출자=created_by, 기간 점유=[checkout_at, due_at) 반열림, 겹침은 EXCLUDE로 차단(PENDING·RESERVED·OUT). 연체는 저장하지 않고 status=OUT and due_at<now()로 파생한다.';

-- 3) 트리거: 반납 시각 스탬프를 일시로 --------------------------------------
create or replace function app.validate_asset_checkout_transition()
returns trigger
language plpgsql
security definer
set search_path = app, public
as $$
declare
  v_me      uuid    := app.current_app_user_id();
  v_manager boolean := app.is_admin() or app.can_write_workspace('management');
  v_owner   boolean := (OLD.created_by = app.current_app_user_id());
begin
  -- 대상 자산을 바꿔치기할 수 있으면 승인받은 물건과 실제로 나간 물건이 달라질 수 있고,
  -- 그 순간 대장 전체가 거짓이 된다.
  if NEW.asset_id is distinct from OLD.asset_id then
    raise exception '반출 건의 대상 자산은 변경할 수 없습니다.';
  end if;
  if NEW.created_by is distinct from OLD.created_by then
    raise exception '반출자는 변경할 수 없습니다.';
  end if;
  -- 스냅샷은 등록 시점의 사실이므로 이후에 고치지 않는다.
  NEW.asset_name      := OLD.asset_name;
  NEW.asset_item_type := OLD.asset_item_type;
  NEW.asset_serial_no := OLD.asset_serial_no;
  NEW.branch_id       := OLD.branch_id;

  -- 비활성화(soft delete)는 상태 전이와 다른 축이다 — 잘못 등록된 행을 걷어내는 조치이며
  -- 관리자만 한다.
  if NEW.deleted_at is distinct from OLD.deleted_at then
    if not app.is_admin() then
      raise exception '반출 건 비활성화는 관리자만 할 수 있습니다.';
    end if;
    return NEW;
  end if;

  if OLD.status in ('RETURNED', 'REJECTED', 'CANCELLED') then
    raise exception '종결된 반출 건은 수정할 수 없습니다.';
  end if;

  if not (v_owner or v_manager) then
    raise exception '이 반출 건을 수정할 권한이 없습니다.';
  end if;

  -- 상태가 그대로면 값 수정이다(기간·목적·행선지·비고).
  if NEW.status = OLD.status then
    if OLD.status = 'OUT' and NEW.checkout_at is distinct from OLD.checkout_at then
      raise exception '이미 반출된 건의 반출 일시는 변경할 수 없습니다.';
    end if;
    return NEW;
  end if;

  -- 상태 전이. 아래에 없는 전이는 모두 거부한다.
  if OLD.status = 'PENDING' and NEW.status in ('RESERVED', 'REJECTED') then
    if not v_manager then
      raise exception '반출 승인·반려는 자산 담당자만 할 수 있습니다.';
    end if;
    NEW.decided_by := v_me;
    NEW.decided_at := now();

  elsif OLD.status in ('PENDING', 'RESERVED') and NEW.status = 'CANCELLED' then
    null;  -- 본인·관리자(위에서 이미 확인)

  elsif OLD.status = 'RESERVED' and NEW.status = 'OUT' then
    null;

  elsif OLD.status = 'OUT' and NEW.status = 'RETURNED' then
    -- 반납 시각은 화면이 지금을 채워 보내지만, 없으면 서버가 지금으로 본다.
    if NEW.returned_at is null then
      NEW.returned_at := now();
    end if;
    -- 반납 처리자는 클라이언트 값을 쓰지 않는다(대리 반납이 누구였는지가 기록의 핵심이다).
    NEW.returned_by := v_me;
    select u.name into NEW.returned_by_name from public.users u where u.id = v_me;

  else
    raise exception '허용되지 않은 상태 전이입니다(% → %).', OLD.status, NEW.status;
  end if;

  return NEW;
end $$;

-- 4) 후보 자산 뷰: 사진·설명 포함 --------------------------------------------
-- 화면의 주인공이 반출 기록에서 물품으로 바뀌었다. 목록에 물건이 늘어서고 그 물건을 열면
-- 사진과 설명이 나오므로, 뷰가 그 둘을 함께 내보낸다.
-- 여전히 내보내지 않는 것: 금액·결제 주기·할당 대상(빌리는 데 필요한 정보가 아니고,
-- 각각 비용 정보와 인사 정보다).
drop view if exists public.portable_assets;

create view public.portable_assets as
  select
    a.id,
    a.name,
    a.item_type,
    a.serial_no,
    a.branch_id,
    a.requires_approval,
    a.note,
    a.photo_paths
  from public.assets a
 where a.deleted_at is null
   and a.is_portable
   and a.status <> 'RETIRED'
   and app.is_internal_user();

revoke all on public.portable_assets from public;
grant select on public.portable_assets to authenticated;

comment on view public.portable_assets is
  'OFFICE 반출대장의 후보 자산(is_portable AND status<>RETIRED). 내부 임직원 전원 조회. 사진·비고는 물건을 알아보기 위해 포함하고, 금액·할당 대상은 내보내지 않는다.';

-- 5) 자산 사진 조회 권한을 내부 임직원으로 ----------------------------------
-- 버킷은 그대로 비공개다(공개 URL 없음, 표시는 단기 Signed URL). 다만 반출 화면에서
-- 사진이 물건을 알아보는 단서이므로, 조회 주체를 management에서 내부 임직원으로 넓힌다.
-- 업로드·수정은 그대로 management 쓰기 권한자만 한다(원장의 주인이 사진의 주인이다).
drop policy if exists asset_photo_objects_select on storage.objects;
create policy asset_photo_objects_select on storage.objects for select
  using (bucket_id = 'asset-photos' and app.is_internal_user());
