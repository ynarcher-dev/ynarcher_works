-- =====================================================================
-- [OFFICE] 반출대장 — 연체는 지금을 점유하고, 자동 반출 시작은 물건이 있을 때만 한다
--
-- 기획: docs_planning/3_1_2_office_asset_checkout.md
-- 선행: 20260730210000(재고 판정) · 20260730250000(자동 반출 시작)
--
-- 지금까지 원장은 알면서 거짓을 적을 수 있었다. 두 자리가 각각 반쪽만 보고 있었기 때문이다.
--
--   (1) 재고 판정(app.check_asset_stock)은 점유를 '선언한 기간'으로만 셌다. A가 18시까지
--       빌리고 돌려주지 않아도, 18시 이후 구간에서 A는 없는 것으로 계산됐다.
--   (2) 자동 반출 시작(public.start_due_checkouts)은 시각만 봤다. 물건이 실제로 있는지는
--       묻지 않고 예약을 반출 중으로 옮겼다.
--
-- 그래서 A가 반납하지 않은 채 B의 예약 시각이 되면, 한 개짜리 물건을 두 사람이 동시에 들고
-- 있는 원장이 만들어졌다. 대장이 사실보다 앞서가는 자리이며, 그 순간 잔여 수량도 거짓이 된다.
--
-- 고치는 원칙은 '현재에 대해서만 정직하다'이다.
--
--   * 연체 건(반납 없이 예정 시각이 지난 OUT)은 지금 이 순간에도 물건을 붙잡고 있다.
--     그러므로 '지금'을 포함하는 요청에서는 그 수량을 잔여에서 뺀다.
--   * 미래 구간은 그대로 열어 둔다. 언제 돌아올지 모른다는 이유로 모든 줄서기를 막으면
--     대장이 순서를 관리하는 일을 그만두게 된다 — 내일 예약은 지금처럼 통과한다.
--   * 시각이 지나도 물건이 없으면 예약은 예약으로 남는다. 이것은 거짓이 아니다.
--     "약속한 시각은 지났는데 아직 받지 못했다"가 사실이며, 화면은 이를 '시작 지연'으로 읽는다.
--
-- 검토했지만 택하지 않은 길: 연체가 나면 뒤 예약을 자동 취소하는 안(곧 돌아올 수도 있는데
-- 시스템이 남의 예약을 지운다), 연체 중에는 미래 예약까지 차단하는 안(한 사람의 지각이
-- 모두의 줄서기를 막는다).
--
-- 소유 워크스페이스: office / 데이터 등급: Internal
-- 접근 주체: 내부 임직원 / Scope: global / 감사 로그: 미대상
--
-- 보안 게이트(docs/docs_dev/11_migration_security_gate.md):
--   - 새 테이블·뷰·RLS 정책·Storage 정책 없음. 기존 함수 2종의 본문만 바꾼다.
--   - SECURITY DEFINER 2종 모두 `set search_path = app, public` 유지.
--   - public.start_due_checkouts()는 본문 첫 줄에서 app.is_internal_user()로 호출자 확인,
--     GRANT EXECUTE는 authenticated 한정(기존 부여 유지, public 권한 없음).
--   - 인자를 새로 받지 않는다 — 정의자 권한 함수에서 인자는 곧 "어느 행을 건드릴까"의
--     손잡이가 되므로, 대상 범위는 지금도 함수 안의 조건이 전부 정한다.
--   - app.check_asset_stock()은 트리거 전용이라 EXECUTE를 따로 부여하지 않는다.
--   - 판정이 넓어지는 방향이 아니라 좁아지는 방향의 변경이다(통과하던 요청이 막히는 쪽).
-- =====================================================================

-- 1) 재고 판정 — 연체 수량을 '지금'에 대해서만 뺀다 -------------------------------
create or replace function app.check_asset_stock()
returns trigger
language plpgsql
security definer
set search_path = app, public
as $$
declare
  total       integer;
  peak        integer;
  overdue_qty integer := 0;
  holders     text;
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
  --
  -- 연체 건은 이 계산에서 뺀다. 아래에서 따로 세기 때문이며, 둘 다 세면 선언한 기간(과거)과
  -- 지금 붙잡고 있다는 사실이 같은 물건을 두 번 빼게 된다.
  with occ as (
    select c.checkout_at, c.due_at, c.quantity
      from public.asset_checkouts c
     where c.asset_id = NEW.asset_id
       and c.id <> NEW.id
       and c.deleted_at is null
       and c.status in ('PENDING', 'RESERVED', 'OUT')
       and not (c.status = 'OUT' and c.due_at <= now())
       and c.checkout_at < NEW.due_at
       and c.due_at > NEW.checkout_at
  ), ev as (
    select o.checkout_at as t,  o.quantity as d from occ o
    union all
    select o.due_at,           -o.quantity      from occ o
  )
  select coalesce(max(running), 0) into peak
    from (select sum(d) over (order by t, d) as running from ev) s;

  -- 연체 건은 예정 기간이 끝났어도 물건을 돌려놓지 않았다. '지금'을 덮는 요청에서만 뺀다 —
  -- 미래 구간까지 막으면 한 사람의 지각이 모두의 예약을 막는다.
  if NEW.checkout_at <= now() and NEW.due_at > now() then
    select coalesce(sum(c.quantity), 0),
           string_agg(distinct coalesce(c.created_by_name, '반출자'), ', ')
      into overdue_qty, holders
      from public.asset_checkouts c
     where c.asset_id = NEW.asset_id
       and c.id <> NEW.id
       and c.deleted_at is null
       and c.status = 'OUT'
       and c.due_at <= now();
  end if;

  if peak + overdue_qty + NEW.quantity > total then
    -- 연체가 원인이면 그 사실을 말한다. 진짜 문제는 이 요청이 아니라 앞사람의 반납 기록이
    -- 빠진 것이고, 화면이 지어낼 수 없는 이름은 여기서만 댈 수 있다.
    if overdue_qty > 0 then
      raise exception
        '재고가 부족합니다. 이 기간에 % 개를 요청했지만 잔여는 % 개입니다(보유 % 개). 반납 예정이 지난 반출이 % 개 있습니다 — % 님의 반납을 먼저 기록해 주세요.',
        NEW.quantity, greatest(total - peak - overdue_qty, 0), total, overdue_qty, holders;
    else
      raise exception '재고가 부족합니다. 이 기간에 % 개를 요청했지만 잔여는 % 개입니다(보유 % 개).',
        NEW.quantity, greatest(total - peak, 0), total;
    end if;
  end if;

  return NEW;
end $$;

-- 2) 자동 반출 시작 — 물건이 있을 때만 따라잡는다 ---------------------------------
-- 조건을 여기에 다시 적지 않고 재고 트리거에 맡긴다. 같은 규칙을 두 곳에 두면 반드시
-- 어긋나고, 어긋난 쪽이 곧 원장이 거짓을 적는 자리가 된다.
create or replace function public.start_due_checkouts()
returns integer
language plpgsql
security definer
set search_path = app, public
as $$
declare
  v_count integer := 0;
  v_id    uuid;
begin
  if not app.is_internal_user() then
    raise exception '반출대장에 접근할 권한이 없습니다.' using errcode = '42501';
  end if;

  -- 트랜잭션 한정 플래그(전이 트리거가 이 값을 보고 시스템 전이를 통과시킨다).
  perform set_config('app.checkout_auto_start', 'on', true);

  -- 먼저 잡은 예약이 먼저 시작한다. 한 건씩 옮기는 이유는 둘이다 —
  --   (1) 앞 건이 물건을 가져가면 뒤 건의 잔여가 달라지므로 한 번에 판정할 수 없고,
  --   (2) 한 건이 재고 판정에 걸려도 나머지는 따라잡아야 한다. 이 함수는 대장을 열 때마다
  --       불리므로, 한 건의 실패가 화면 진입 전체를 막아서는 안 된다.
  for v_id in
    select r.id
      from public.asset_checkouts r
     where r.deleted_at is null
       and r.status = 'RESERVED'
       and r.checkout_at <= now()
       and r.due_at > now()
     order by r.checkout_at
  loop
    begin
      update public.asset_checkouts
         set status = 'OUT'
       where id = v_id
         and status = 'RESERVED';
      if found then
        v_count := v_count + 1;
      end if;
    exception when others then
      -- 물건이 아직 돌아오지 않아 재고 판정에 걸린 건이다. 예약으로 남겨 둔다 —
      -- "시각은 지났지만 아직 받지 못했다"가 사실이며, 화면은 이를 '시작 지연'으로 읽는다.
      null;
    end;
  end loop;

  perform set_config('app.checkout_auto_start', 'off', true);
  return v_count;
end $$;

revoke all on function public.start_due_checkouts() from public;
grant execute on function public.start_due_checkouts() to authenticated;

comment on function public.start_due_checkouts() is
  'OFFICE 반출대장 진입 시 호출하는 보정. 반출 시각이 지났고 기간이 남은 예약(RESERVED) 중 그 순간 실제로 물건이 있는 건만 반출 중(OUT)으로 옮기고 옮긴 건수를 돌려준다. 재고 판정에 걸린 건은 예약으로 남는다(화면 표기: 시작 지연). 내부 임직원만 호출할 수 있으며, 전이 트리거는 트랜잭션 GUC app.checkout_auto_start로 이 경로를 식별한다.';

comment on table public.asset_checkouts is
  'OFFICE 반출대장. 반출자=created_by, 기간 점유=[checkout_at, due_at) 반열림, 재고 판정은 app.check_asset_stock()이 동시 최대 점유로 한다. 반납되지 않은 채 예정 시각이 지난 건(연체)은 지금을 덮는 요청에 한해 추가로 잔여를 잡는다. 연체는 저장하지 않고 status=OUT and due_at<now()로 파생한다.';
