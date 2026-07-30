-- =====================================================================
-- [OFFICE] 반출대장 — 시각이 지난 예약을 반출 중으로 따라잡는다
--
-- 기획: docs_planning/3_1_2_office_asset_checkout.md
--
-- 예약은 "이 시각부터 가져가겠다"는 약속이고, 그 시각이 지나면 물건은 실제로 나가 있다.
-- 지금까지는 누군가 '반출 시작'을 눌러야 상태가 바뀌었으므로, 아무도 누르지 않으면 표는
-- 어제 나간 물건을 여전히 '예약'으로 적었다 — 대장이 사실보다 뒤처지는 자리다.
--
-- 시각이 지난 예약을 반출 중으로 옮기는 함수를 두고, 반출대장을 열 때 한 번 호출한다.
-- 스케줄러(pg_cron)를 켜지 않는 이유는 확장 설치가 운영 DB의 별도 결정이기 때문이며,
-- 화면 진입 보정만으로도 대장을 읽는 모든 순간에는 사실과 맞는다(아무도 보지 않는 동안
-- 원장이 늦게 따라오는 것이 유일한 차이다).
--
-- 종료 시각(due_at)이 이미 지난 예약은 건드리지 않는다. 아무도 가져가지 않은 채 기간이
-- 통째로 지난 건을 반출 중으로 만들면 돌아오지 않는 연체가 새로 생기고, 그것을 지우려면
-- 나간 적 없는 물건을 누군가 '반납'해야 한다.
--
-- 소유 워크스페이스: office / 데이터 등급: Internal
-- 접근 주체: 내부 임직원 / Scope: global / 감사 로그: 미대상
--
-- 보안 게이트(docs/docs_dev/11_migration_security_gate.md):
--   - 새 테이블·Storage 정책 없음. SECURITY DEFINER 함수 1종(RPC) + 트리거 함수 재정의
--   - RPC는 search_path 고정 + 본문 첫 줄에서 app.is_internal_user()로 호출자 확인
--   - GRANT EXECUTE는 authenticated 한정(anon 제외), public 권한은 revoke
--   - 정의자 권한으로 RLS를 건너뛰지만 바꾸는 값은 status 한 컬럼이고, 조건(예약·시각
--     경과·기간 내)에 맞는 행만 대상이라 호출자가 고를 수 있는 여지가 없다
-- =====================================================================

-- 1) 전이 트리거: 시스템 전이 경로 하나를 연다 --------------------------------
-- 20260730190000판을 그대로 두고 '자동 반출 시작' 분기만 더한다. 이 전이는 사람의 처리가
-- 아니라 사실을 따라잡는 조치라 수행 주체(본인·자산 담당자)를 묻지 않는다. 대신 트랜잭션
-- GUC로 아래 RPC를 거쳐 온 UPDATE임을 확인하고, 상태 두 값과 시각 조건이 맞으며 다른
-- 필드가 함께 바뀌지 않았을 때에만 통과시킨다 — 조건을 좁히지 않으면 이 분기가 곧 전이
-- 규칙 전체를 우회하는 문이 된다.
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

  -- 자동 반출 시작(app.start_due_checkouts) — 예약 시각이 지난 건만, 상태 외에는 아무것도
  -- 바꾸지 않은 채로 통과한다.
  if coalesce(current_setting('app.checkout_auto_start', true), '') = 'on'
     and OLD.status = 'RESERVED'
     and NEW.status = 'OUT'
     and NEW.checkout_at <= now()
     and NEW.checkout_at is not distinct from OLD.checkout_at
     and NEW.due_at    is not distinct from OLD.due_at
     and NEW.quantity  is not distinct from OLD.quantity then
    return NEW;
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

-- 2) 보정 RPC ----------------------------------------------------------------
-- 반환값은 옮긴 건수다 — 화면은 0이 아닐 때에만 목록을 다시 읽으면 된다.
-- 대상 범위를 호출자에게 받지 않는다(지사·자산 인자 없음): 인자가 있으면 그것이 곧
-- "어느 행을 건드릴까"를 고르는 손잡이가 되고, 정의자 권한 함수에서 그 손잡이는 위험하다.
create or replace function public.start_due_checkouts()
returns integer
language plpgsql
security definer
set search_path = app, public
as $$
declare
  v_count integer;
begin
  if not app.is_internal_user() then
    raise exception '반출대장에 접근할 권한이 없습니다.' using errcode = '42501';
  end if;

  -- 트랜잭션 한정 플래그(전이 트리거가 이 값을 보고 시스템 전이를 통과시킨다).
  perform set_config('app.checkout_auto_start', 'on', true);

  update public.asset_checkouts
     set status = 'OUT'
   where deleted_at is null
     and status = 'RESERVED'
     and checkout_at <= now()
     and due_at > now();

  get diagnostics v_count = row_count;

  perform set_config('app.checkout_auto_start', 'off', true);
  return v_count;
end $$;

revoke all on function public.start_due_checkouts() from public;
grant execute on function public.start_due_checkouts() to authenticated;

comment on function public.start_due_checkouts() is
  'OFFICE 반출대장 진입 시 호출하는 보정. 반출 시각이 지났고 아직 기간이 남은 예약(RESERVED)을 반출 중(OUT)으로 옮기고 옮긴 건수를 돌려준다. 내부 임직원만 호출할 수 있으며, 전이 트리거는 트랜잭션 GUC app.checkout_auto_start로 이 경로를 식별한다.';
