-- =====================================================================
-- [OFFICE/MANAGEMENT] 반출대장 — 재고 수량(보유·잔여)
--
-- 기획: docs_planning/3_1_2_office_asset_checkout.md
--
-- 지금까지 원장은 "1행 = 물건 하나"였고, 그래서 겹침을 EXCLUDE 제약 하나로 막을 수 있었다
-- (같은 물건을 같은 시간에 두 사람이 가질 수 없다). 케이블·의자·측정기처럼 같은 물건을
-- 여러 개 두는 자산이 실제로는 흔하므로, 보유 수량을 자산에 두고 반출도 수량을 받는다.
--
-- 수량이 생기면 겹침은 '되냐 안 되냐'가 아니라 '몇 개 남았냐'가 된다. EXCLUDE 제약으로는
-- 표현할 수 없으므로(제약은 두 행의 관계만 본다) 재고 판정을 트리거로 옮긴다.
--
-- 소유 워크스페이스: office(반출 수량)·management(보유 수량) / 데이터 등급: Internal
-- 접근 주체: 내부 임직원 / Scope: global / 감사 로그: 미대상
-- 보안 게이트: 새 테이블·RPC·Storage 정책 없음. SECURITY DEFINER 함수 1종 추가이며
--   search_path를 고정하고 트리거 전용이라 EXECUTE를 따로 부여하지 않는다.
-- =====================================================================

-- 1) 보유 수량(자산 원장) ----------------------------------------------------
-- 기본값 1 — 지금까지 등록된 모든 자산은 한 개짜리였다는 것이 사실이다.
alter table public.assets
  add column if not exists quantity integer not null default 1;

alter table public.assets drop constraint if exists assets_quantity_positive;
alter table public.assets
  add constraint assets_quantity_positive check (quantity >= 1);

comment on column public.assets.quantity is
  '보유 수량. 같은 물건을 여러 개 두는 자산(케이블·의자 등)에서 1보다 커진다. 반출 가능 여부와 무관하게 자산의 사실이다.';

-- 2) 반출 수량(반출 원장) ----------------------------------------------------
alter table public.asset_checkouts
  add column if not exists quantity integer not null default 1;

alter table public.asset_checkouts drop constraint if exists asset_checkouts_quantity_positive;
alter table public.asset_checkouts
  add constraint asset_checkouts_quantity_positive check (quantity >= 1);

comment on column public.asset_checkouts.quantity is
  '이번 반출로 들고 나가는 개수. 보유 수량에서 이 값만큼 잔여가 줄어든다.';

-- 3) 겹침 차단 → 재고 판정 ---------------------------------------------------
-- EXCLUDE는 "겹치면 무조건 거부"라, 다섯 개 중 한 개를 빌린 시간에 다른 한 개를 빌리는
-- 정당한 요청까지 막는다. 제약을 떼고 수량을 아는 판정으로 바꾼다.
alter table public.asset_checkouts
  drop constraint if exists asset_checkouts_no_overlap;

create or replace function app.check_asset_stock()
returns trigger
language plpgsql
security definer
set search_path = app, public
as $$
declare
  total integer;
  peak  integer;
begin
  -- 점유하지 않는 상태(반려·취소·반납 완료)와 비활성 행은 재고를 잡지 않는다.
  if NEW.deleted_at is not null
     or NEW.status not in ('PENDING', 'RESERVED', 'OUT') then
    return NEW;
  end if;

  -- 같은 자산에 동시에 들어오는 요청을 줄 세운다 — 두 사람이 같은 순간에 마지막 한 개를
  -- 집으면, 각자 상대의 행을 아직 보지 못해 둘 다 통과해 버린다.
  select a.quantity into total
    from public.assets a
   where a.id = NEW.asset_id and a.deleted_at is null
   for update;
  if total is null then
    raise exception '존재하지 않는 자산입니다.';
  end if;

  -- 요청 구간과 겹치는 점유들의 '동시 최대'를 센다. 단순 합이 아니다 — 오전에 한 개,
  -- 오후에 한 개가 나가 있다면 그 하루에 동시에 나가 있는 것은 두 개가 아니라 한 개다.
  -- 시각이 같을 때는 끝(-)을 시작(+)보다 먼저 세어, 반열림 구간('[)')과 뜻을 맞춘다.
  with ev as (
    select c.checkout_at as t, c.quantity as d
      from public.asset_checkouts c
     where c.asset_id = NEW.asset_id
       and c.id <> NEW.id
       and c.deleted_at is null
       and c.status in ('PENDING', 'RESERVED', 'OUT')
       and c.checkout_at < NEW.due_at
       and c.due_at > NEW.checkout_at
    union all
    select c.due_at, -c.quantity
      from public.asset_checkouts c
     where c.asset_id = NEW.asset_id
       and c.id <> NEW.id
       and c.deleted_at is null
       and c.status in ('PENDING', 'RESERVED', 'OUT')
       and c.checkout_at < NEW.due_at
       and c.due_at > NEW.checkout_at
  )
  select coalesce(max(running), 0) into peak
    from (select sum(d) over (order by t, d) as running from ev) s;

  if peak + NEW.quantity > total then
    raise exception '재고가 부족합니다. 이 기간에 % 개를 요청했지만 잔여는 % 개입니다(보유 % 개).',
      NEW.quantity, greatest(total - peak, 0), total;
  end if;

  return NEW;
end $$;

-- 이름이 z로 시작하는 것은 순서 때문이다 — 같은 시점의 트리거는 이름 순으로 돌고,
-- 재고 판정은 등록 트리거(자산 스냅샷·초기 상태 강제)와 전이 트리거(상태 확정)가 값을
-- 다 정한 뒤에 마지막으로 봐야 한다.
drop trigger if exists trg_asset_checkouts_zstock on public.asset_checkouts;
create trigger trg_asset_checkouts_zstock
  before insert or update on public.asset_checkouts
  for each row execute function app.check_asset_stock();

-- 4) 후보 자산 뷰에 보유 수량 --------------------------------------------------
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
    a.photo_paths,
    a.quantity
  from public.assets a
 where a.deleted_at is null
   and a.is_portable
   and a.status <> 'RETIRED'
   and app.is_internal_user();

revoke all on public.portable_assets from public;
grant select on public.portable_assets to authenticated;

comment on view public.portable_assets is
  'OFFICE 반출대장의 후보 자산(is_portable AND status<>RETIRED). 내부 임직원 전원 조회. 사진·비고·보유 수량은 물건을 알아보고 몇 개 남았는지 세기 위해 포함하고, 금액·할당 대상은 내보내지 않는다.';

comment on table public.asset_checkouts is
  'OFFICE 반출대장. 반출자=created_by, 기간 점유=[checkout_at, due_at) 반열림, 재고 판정은 app.check_asset_stock()이 동시 최대 점유로 한다. 연체는 저장하지 않고 status=OUT and due_at<now()로 파생한다.';
