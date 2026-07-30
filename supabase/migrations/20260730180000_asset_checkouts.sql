-- =====================================================================
-- [OFFICE] 반출대장 — 회사 물건이 나갔다가 돌아오는 사실을 남기는 원장
--
-- 기획: docs_planning/3_1_2_office_asset_checkout.md
--
-- 회의실 예약(20260728120000)과 골격은 같고 축이 다르다. 회의실은 종료 시각이 지나면
-- 저절로 비지만 물건은 누군가 돌려놓아야 비워지므로, '반납 예정일'과 '실제 반납일'이
-- 별개 값이고 반납은 상태 전이다. 점유 단위도 슬롯(분)이 아니라 날짜다.
--
-- 소유 워크스페이스: office / 데이터 등급: Internal
-- 접근 주체: 내부 임직원 전원(외부 스타트업·전문가·임시 게스트 차단)
-- Scope: global / 감사 로그: 미대상(사내 물품 대여 기록 — 개인정보 원본·다운로드·
--        Export·권한 변경 어디에도 해당하지 않는다. 반출자·반납 처리자는 행에 남는다)
--
-- 보안 게이트(docs/docs_dev/11_migration_security_gate.md):
--   - 새 테이블은 즉시 RLS 활성화, SELECT/INSERT/UPDATE 정책 분리, DELETE 정책 없음
--   - 권한 판정은 app.* 헬퍼만 경유(auth.jwt() 직접 파싱 없음)
--   - SECURITY DEFINER 함수는 search_path 고정 + 내부 권한 검사. 트리거 전용이라
--     authenticated에 EXECUTE를 부여하지 않는다
--   - 뷰(public.portable_assets)는 본문에 app.is_internal_user() 조건을 포함하고
--     authenticated에만 SELECT를 부여한다
-- =====================================================================

-- 0) 확장 --------------------------------------------------------------------
-- EXCLUDE 제약에서 uuid 동등(=)과 daterange 겹침(&&)을 함께 색인하려면 btree_gist가
-- 필요하다(회의실 예약이 이미 설치했으나 이 마이그레이션만 적용해도 서도록 둔다).
create extension if not exists btree_gist with schema extensions;

-- 1) 자산 쪽 기준값: 반출 시 승인 필요 여부 ----------------------------------
-- 노트북 거치대와 법인 차량을 같은 절차로 다룰 수는 없다. 통제가 필요한 물건만 켠다.
-- 품목(item_type)이 아니라 자산 단위인 이유는 품목이 원장 없는 자유입력 텍스트라
-- 정책을 매달 자리가 없기 때문이다('노트북'과 '랩탑'이 다른 정책을 갖게 된다).
-- 새 컬럼이므로 assets의 기존 management 워크스페이스 RLS를 그대로 승계한다.
alter table public.assets
  add column if not exists requires_approval boolean not null default false;

comment on column public.assets.requires_approval is
  '반출 시 승인 필요 여부. OFFICE 반출대장이 초기 상태(PENDING/RESERVED)를 정할 때 읽는다. is_portable이 켜져 있을 때만 의미를 갖는다.';

-- 2) 반출 상태 enum ----------------------------------------------------------
do $$
begin
  create type public.asset_checkout_status as enum (
    'PENDING',    -- 승인 대기(승인 필요 자산)
    'REJECTED',   -- 반려(종결)
    'RESERVED',   -- 예약 확정, 아직 나가지 않음
    'OUT',        -- 반출 중
    'RETURNED',   -- 반납 완료(종결)
    'CANCELLED'   -- 취소(종결)
  );
exception
  when duplicate_object then null;
end $$;

-- 3) 반출 원장 ---------------------------------------------------------------
create table if not exists public.asset_checkouts (
  id                uuid primary key default gen_random_uuid(),
  asset_id          uuid not null references public.assets(id),

  -- 자산 표기 스냅샷(INSERT 트리거가 채운다). 이유가 둘이다.
  -- (1) 사실: 대장은 "그때 그 물건을 들고 나갔다"는 기록이라 이후 자산명이 바뀌어도
  --     그 시점의 이름으로 읽혀야 한다.
  -- (2) 권한: assets 조회는 can_read_workspace('management')라, MANAGEMENT 권한이 없는
  --     임직원은 조인으로 자산명을 가져올 수 없다(회의실의 created_by_name과 같은 해법).
  asset_name        text not null,
  asset_item_type   text,
  asset_serial_no   text,
  branch_id         uuid references public.branches(id),

  status            public.asset_checkout_status not null default 'RESERVED',
  checkout_on       date not null,
  due_on            date not null,          -- 반납 예정일 = 기간 점유의 끝
  returned_on       date,                   -- 실제 반납일

  purpose           text not null,          -- 대장의 존재 이유라 필수
  destination       text,
  note              text,

  created_by        uuid not null references public.users(id),  -- 반출자(트리거 스탬프)
  created_by_name   text,                                       -- users RLS 우회 표시용
  decided_by        uuid references public.users(id),            -- 승인·반려자
  decided_at        timestamptz,
  decision_note     text,
  returned_by       uuid references public.users(id),
  returned_by_name  text,
  return_note       text,                                       -- 파손·분실 등 돌아온 상태

  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  deleted_at        timestamptz,

  constraint asset_checkouts_period check (due_on >= checkout_on),
  -- 반납일과 반납 상태는 함께 성립하거나 함께 없다.
  constraint asset_checkouts_returned_pair
    check ((status = 'RETURNED') = (returned_on is not null)),
  constraint asset_checkouts_returned_after
    check (returned_on is null or returned_on >= checkout_on)
);

-- 같은 자산의 기간이 겹치는 유효 반출을 원자적으로 차단한다.
-- 양끝을 포함하는 '[]'을 쓴다 — 회의실의 '[)'와 다른 이유는, 시간은 연속이지만 날짜는
-- 하루가 통째이고 같은 날 오전 반납/오후 반출을 허용하려면 시각을 받아야 하기 때문이다
-- (그러면 회의실과 같은 화면이 된다). 하루를 통째로 잡는 쪽이 현장에서 안전하다.
-- 승인 대기도 기간을 잡는다 — 잡지 않으면 승인이 떨어지는 순간 겹침으로 실패하고,
-- 그 실패는 승인권자의 잘못이 아닌데 승인권자 앞에서 일어난다.
alter table public.asset_checkouts
  drop constraint if exists asset_checkouts_no_overlap;
alter table public.asset_checkouts
  add constraint asset_checkouts_no_overlap
  exclude using gist (
    asset_id with =,
    daterange(checkout_on, due_on, '[]') with &&
  ) where (deleted_at is null and status in ('PENDING', 'RESERVED', 'OUT'));

create index if not exists idx_asset_checkouts_status_due
  on public.asset_checkouts (status, due_on)
  where deleted_at is null;
create index if not exists idx_asset_checkouts_mine
  on public.asset_checkouts (created_by, checkout_on desc)
  where deleted_at is null;
create index if not exists idx_asset_checkouts_asset
  on public.asset_checkouts (asset_id, checkout_on desc)
  where deleted_at is null;

-- 4) RLS ---------------------------------------------------------------------
alter table public.asset_checkouts enable row level security;

-- 조회: 내부 임직원 전원. "누가 무엇을 갖고 있나"는 전사가 공유해야 하는 사실이다.
drop policy if exists asset_checkouts_select on public.asset_checkouts;
create policy asset_checkouts_select on public.asset_checkouts for select
  using (app.is_internal_user());

-- 등록: 본인 명의만. 남의 이름으로 반출 건을 만들 수 없다.
drop policy if exists asset_checkouts_insert on public.asset_checkouts;
create policy asset_checkouts_insert on public.asset_checkouts for insert
  with check (
    app.is_internal_user()
    and created_by = app.current_app_user_id()
  );

-- 수정: 반출자 본인 · management 쓰기 권한자 · 관리자.
-- 무엇으로 바꿀 수 있는가(전이 허용 여부와 주체)는 아래 트리거가 판정한다 —
-- 상태 전이 규칙은 이전 상태와 새 상태의 조합이라 정책 식으로는 정확히 적을 수 없다.
drop policy if exists asset_checkouts_update on public.asset_checkouts;
create policy asset_checkouts_update on public.asset_checkouts for update
  using (
    app.is_admin()
    or created_by = app.current_app_user_id()
    or app.can_write_workspace('management')
  )
  with check (
    app.is_admin()
    or created_by = app.current_app_user_id()
    or app.can_write_workspace('management')
  );

-- DELETE 정책 없음(soft delete: deleted_at).

-- 5) 트리거 ------------------------------------------------------------------
drop trigger if exists trg_asset_checkouts_updated_at on public.asset_checkouts;
create trigger trg_asset_checkouts_updated_at
  before update on public.asset_checkouts
  for each row execute function app.set_updated_at();

-- 등록: 반출자 스탬프 + 자산 후보 자격 검증 + 표기 스냅샷 + 초기 상태 강제.
-- assets를 읽어야 하는데 반출자에게는 그 원장의 조회 권한이 없으므로 security definer다.
-- 자산의 어떤 값도 호출자에게 반환하지 않고, 행에 스탬프하거나 예외를 발생시키는 데만 쓴다.
create or replace function app.stamp_validate_asset_checkout()
returns trigger
language plpgsql
security definer
set search_path = app, public
as $$
declare
  a public.assets%rowtype;
begin
  if NEW.created_by is null then
    NEW.created_by := app.current_app_user_id();
  end if;
  if NEW.created_by_name is null and NEW.created_by is not null then
    select u.name into NEW.created_by_name from public.users u where u.id = NEW.created_by;
  end if;

  select * into a from public.assets
   where id = NEW.asset_id and deleted_at is null;
  if not found then
    raise exception '존재하지 않는 자산입니다.';
  end if;
  if not a.is_portable then
    raise exception '반출 가능으로 설정되지 않은 자산입니다.';
  end if;
  if a.status = 'RETIRED' then
    raise exception '폐기된 자산은 반출할 수 없습니다.';
  end if;

  -- 표기는 등록 시점의 사실로 굳힌다(이후 자산명이 바뀌어도 대장은 그때 그 이름).
  NEW.asset_name      := a.name;
  NEW.asset_item_type := a.item_type;
  NEW.asset_serial_no := a.serial_no;
  NEW.branch_id       := a.branch_id;

  -- 초기 상태는 클라이언트가 정하지 않는다 — 화면에서 승인 단계를 감추는 것만으로는
  -- 승인을 건너뛰는 요청을 막을 수 없다.
  NEW.status := case when a.requires_approval then 'PENDING' else 'RESERVED' end
                ::public.asset_checkout_status;

  -- 처리 흔적은 등록 시점에 있을 수 없다.
  NEW.returned_on := null;
  NEW.returned_by := null;
  NEW.returned_by_name := null;
  NEW.decided_by := null;
  NEW.decided_at := null;

  return NEW;
end $$;

drop trigger if exists trg_asset_checkouts_stamp on public.asset_checkouts;
create trigger trg_asset_checkouts_stamp
  before insert on public.asset_checkouts
  for each row execute function app.stamp_validate_asset_checkout();

-- 수정: 허용된 상태 전이와 그 수행 주체를 판정한다.
-- 승인권자는 자산 원장의 주인이다(management 쓰기 또는 관리자) — 자산의 반출 가능 여부를
-- 정하는 사람과 그 반출을 승인하는 사람이 같아야 기준이 하나로 유지된다.
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
    if OLD.status = 'OUT' and NEW.checkout_on is distinct from OLD.checkout_on then
      raise exception '이미 반출된 건의 반출일은 변경할 수 없습니다.';
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
    -- 반납일은 화면이 오늘을 채워 보내지만, 없으면 서버가 오늘로 본다.
    if NEW.returned_on is null then
      NEW.returned_on := current_date;
    end if;
    -- 반납 처리자는 클라이언트 값을 쓰지 않는다(대리 반납이 누구였는지가 기록의 핵심이다).
    NEW.returned_by := v_me;
    select u.name into NEW.returned_by_name from public.users u where u.id = v_me;

  else
    raise exception '허용되지 않은 상태 전이입니다(% → %).', OLD.status, NEW.status;
  end if;

  return NEW;
end $$;

drop trigger if exists trg_asset_checkouts_transition on public.asset_checkouts;
create trigger trg_asset_checkouts_transition
  before update on public.asset_checkouts
  for each row execute function app.validate_asset_checkout_transition();

-- 6) 반출 후보 자산 뷰 -------------------------------------------------------
-- 반출대장이 실제로 쓰이려면 MANAGEMENT 권한이 없는 임직원도 후보 자산을 볼 수 있어야
-- 하는데, assets의 RLS는 그것을 허용하지 않는다. 원장의 정책을 푸는 대신 필요한 만큼만
-- 보여 주는 뷰를 둔다 — 금액·결제 주기·할당 대상·비고는 내보내지 않는다(물건을 빌리는 데
-- 필요한 정보가 아니고, 각각 비용 정보와 인사 정보다).
-- 뷰는 정의자 권한으로 실행되어 원장 RLS를 통과하므로, 본문 조건이 접근 판정을 대신한다.
create or replace view public.portable_assets as
  select
    a.id,
    a.name,
    a.item_type,
    a.serial_no,
    a.branch_id,
    a.requires_approval,
    (a.photo_paths)[1] as photo_path
  from public.assets a
 where a.deleted_at is null
   and a.is_portable
   and a.status <> 'RETIRED'
   and app.is_internal_user();

revoke all on public.portable_assets from public;
grant select on public.portable_assets to authenticated;

-- 7) 코멘트 ------------------------------------------------------------------
comment on table public.asset_checkouts is
  'OFFICE 반출대장. 반출자=created_by, 기간 점유=[checkout_on, due_on] 양끝 포함, 겹침은 EXCLUDE로 차단(PENDING·RESERVED·OUT). 연체는 저장하지 않고 status=OUT and due_on<오늘로 파생한다.';
comment on column public.asset_checkouts.asset_name is
  '등록 시점 자산명 스냅샷. 대장은 그때의 사실이며, 임직원 전원이 assets를 읽을 수는 없다.';
comment on column public.asset_checkouts.due_on is
  '반납 예정일. 기간 점유의 끝이라 필수다(끝이 없으면 겹침을 판정할 수 없다).';
comment on column public.asset_checkouts.returned_on is
  '실제 반납일. 상태 RETURNED와 짝을 이룬다(check 제약).';
comment on view public.portable_assets is
  'OFFICE 반출대장의 후보 자산(is_portable AND status<>RETIRED). 내부 임직원 전원 조회. 금액·할당 대상은 내보내지 않는다.';
