-- =====================================================================
-- [Phase 8] FUND 캐피탈 콜 — 상태를 차수에서 LP 행으로 내린다
--
-- 배경(사용자 확정)
--   지금까지 상태(예정/통지/납입완료/연체)는 차수(capital_calls.status)에만 있었고, LP 행은
--   is_paid 불리언 하나였다. 실제 운영에서는 같은 차수라도 LP마다 통지·납입·연체가 갈리므로
--   상태의 소유자를 LP 행(capital_call_payments)으로 내리고, 차수 상태는 그 분포에서 파생시킨다.
--
--     capital_call_payments.status(LP별 입력·SSOT)
--        → is_paid / amount / paid_at (파생, BEFORE 트리거)
--        → capital_calls.status       (파생, 롤업 트리거)
--        → fund_lps.paid_amount · funds.paid_in_amount (기존 파생 경로 그대로)
--
--   PARTIALLY_PAID(일부납입)는 "여럿 중 일부만 냈다"는 롤업 개념이라 LP 한 행에는 성립하지 않는다.
--   LP 행이 가질 수 있는 값은 SCHEDULED/NOTIFIED/PAID/OVERDUE 넷이고, BEFORE 트리거가 방어한다.
--
--   1) capital_call_payments.status         : LP별 상태(입력 SSOT)
--   2) app.sync_capital_call_payment_state() : status → is_paid/amount/paid_at 파생(BEFORE)
--   3) app.sync_capital_call_rollups()       : 차수 총액 + 차수 상태 파생(AFTER, 기존 함수 확장)
--   4) set_capital_call_payments()           : 그리드 원자 교체 RPC — is_paid 대신 status 수용
--
-- 보안 게이트(docs/docs_dev/11_migration_security_gate.md):
--   · 소유 워크스페이스: fund. 데이터 등급: Restricted(금융). 접근 주체: 내부 FUND RW/R.
--   · 새 테이블·새 정책·Storage·service_role 없음 — 기존 capital_call_payments 정책
--     (can_read/write_workspace('fund') + can_access_fund(fund_id))을 그대로 상속한다.
--   · 신규 트리거 함수·RPC 모두 SECURITY INVOKER + search_path 고정. SECURITY DEFINER 없음.
--   · RPC GRANT EXECUTE는 authenticated 한정(기존과 동일), public REVOKE 유지.
-- 근거: docs_planning/3_5_workspace_fund.md §1.3
-- =====================================================================

-- 1) LP별 상태 컬럼 ------------------------------------------------------
alter table public.capital_call_payments
  add column if not exists status public.capital_call_status not null default 'SCHEDULED';

comment on column public.capital_call_payments.status is
  'LP별 캐피탈 콜 상태(SCHEDULED/NOTIFIED/PAID/OVERDUE). 입력 SSOT — is_paid·amount·paid_at은 여기서 파생되며 트리거가 소유한다.';

comment on column public.capital_call_payments.is_paid is
  '납입 완료 여부(파생) = status가 PAID. 직접 입력 금지, sync_capital_call_payment_state 트리거가 갱신.';

comment on column public.capital_calls.status is
  '차수 상태(파생) = 소속 LP 행 상태의 분포에서 롤업. 직접 입력 금지, sync_capital_call_rollups 트리거가 갱신.';

-- 백필: 기존 납입 체크 행만 PAID로 승격(나머지는 기본값 SCHEDULED).
update public.capital_call_payments
   set status = 'PAID'
 where is_paid and status <> 'PAID';

-- 2) status → is_paid/amount/paid_at 파생(BEFORE) -------------------------
-- SECURITY INVOKER: 자기 행의 파생 컬럼을 정규화할 뿐이라 별도 권한 판정이 필요 없다
--   (행 접근 자체는 capital_call_payments RLS가 이미 막는다).
create or replace function app.sync_capital_call_payment_state()
returns trigger
language plpgsql
security invoker
set search_path = app, public
as $$
declare
  v_prev_paid_at timestamptz;
begin
  -- 일부납입은 차수 롤업 전용 값이라 LP 행에는 두지 않는다.
  if new.status = 'PARTIALLY_PAID' then
    new.status := 'SCHEDULED';
  end if;

  -- OLD는 UPDATE에서만 존재한다(INSERT에서 참조하면 미할당 에러).
  if tg_op = 'UPDATE' then
    v_prev_paid_at := old.paid_at;
  end if;

  new.is_paid := (new.status = 'PAID');
  new.amount  := case when new.is_paid then new.requested_amount else 0 end;
  -- 최초 납입일은 보존한다 — 상태를 다시 저장해도 납입일이 오늘로 밀리지 않는다.
  new.paid_at := case when new.is_paid then coalesce(v_prev_paid_at, now()) else null end;
  return new;
end $$;

drop trigger if exists trg_capital_call_payments_state on public.capital_call_payments;
create trigger trg_capital_call_payments_state
  before insert or update on public.capital_call_payments
  for each row execute function app.sync_capital_call_payment_state();

-- 3) 롤업 트리거 확장 — 차수 총액 + 차수 상태 파생 -------------------------
-- 기존 함수(요청액→차수총액, 납입→LP·펀드 실출자)에 차수 상태 파생만 더한다.
create or replace function app.sync_capital_call_rollups()
returns trigger
language plpgsql
security invoker
set search_path = app, public
as $$
declare
  call_ids uuid[] := array[]::uuid[];
  lp_ids   uuid[] := array[]::uuid[];
  fund_ids uuid[] := array[]::uuid[];
  c uuid;
  l uuid;
  f uuid;
  v_total    integer;
  v_paid     integer;
  v_overdue  integer;
  v_notified integer;
begin
  -- 영향받은 차수·LP·펀드 키를 OLD/NEW 양쪽에서 수집(키 변경·삭제까지 커버).
  if tg_op in ('INSERT','UPDATE') then
    call_ids := call_ids || new.capital_call_id;
    if new.lp_id is not null then lp_ids := lp_ids || new.lp_id; end if;
    if new.fund_id is not null then fund_ids := fund_ids || new.fund_id; end if;
  end if;
  if tg_op in ('UPDATE','DELETE') then
    call_ids := call_ids || old.capital_call_id;
    if old.lp_id is not null then lp_ids := lp_ids || old.lp_id; end if;
    if old.fund_id is not null then fund_ids := fund_ids || old.fund_id; end if;
  end if;

  -- 차수 총 요청액 = 그 차수 요청액의 합(파생).
  -- 차수 상태 = LP 행 상태의 분포에서 롤업: 전원 납입=PAID, 일부 납입=PARTIALLY_PAID,
  --             아무도 안 냈으면 연체 > 통지 > 예정 순으로 가장 앞선 신호를 올린다.
  foreach c in array call_ids loop
    select count(*),
           count(*) filter (where p.status = 'PAID'),
           count(*) filter (where p.status = 'OVERDUE'),
           count(*) filter (where p.status = 'NOTIFIED')
      into v_total, v_paid, v_overdue, v_notified
      from public.capital_call_payments p
     where p.capital_call_id = c;

    update public.capital_calls cc
       set amount = coalesce((
             select sum(p.requested_amount) from public.capital_call_payments p
              where p.capital_call_id = c), 0),
           status = (case
                       when v_total = 0     then 'SCHEDULED'
                       when v_paid = v_total then 'PAID'
                       when v_paid > 0      then 'PARTIALLY_PAID'
                       when v_overdue > 0   then 'OVERDUE'
                       when v_notified > 0  then 'NOTIFIED'
                       else 'SCHEDULED'
                     end)::public.capital_call_status
     where cc.id = c;
  end loop;

  -- LP 실 납입액 = 그 LP의 납입완료 실 납입액 합(파생).
  foreach l in array lp_ids loop
    update public.fund_lps fl
       set paid_amount = coalesce((
             select sum(p.amount) from public.capital_call_payments p
              where p.lp_id = l and p.is_paid), 0)
     where fl.id = l;
  end loop;

  -- 펀드 실출자금액 = 그 펀드 납입완료 실 납입액 합(파생).
  foreach f in array fund_ids loop
    update public.funds fu
       set paid_in_amount = coalesce((
             select sum(p.amount) from public.capital_call_payments p
              where p.fund_id = f and p.is_paid), 0)
     where fu.id = f;
  end loop;

  return null;
end;
$$;

-- 기존 차수 상태 백필(트리거 도입 시점 정합성).
update public.capital_calls cc
   set status = (
     select case
              when count(*) = 0                                  then 'SCHEDULED'
              when count(*) filter (where p.status='PAID') = count(*) then 'PAID'
              when count(*) filter (where p.status='PAID') > 0   then 'PARTIALLY_PAID'
              when count(*) filter (where p.status='OVERDUE') > 0 then 'OVERDUE'
              when count(*) filter (where p.status='NOTIFIED') > 0 then 'NOTIFIED'
              else 'SCHEDULED'
            end
       from public.capital_call_payments p
      where p.capital_call_id = cc.id
   )::public.capital_call_status;

-- 4) set_capital_call_payments — status 수용으로 교체 ---------------------
--    p_rows: jsonb 배열 [{lp_id, requested_amount, status}, ...]
--    is_paid/amount/paid_at은 BEFORE 트리거가 status에서 파생하므로 여기서 쓰지 않는다.
--    구버전 클라이언트 호환: status가 없으면 is_paid 불리언에서 환산한다.
create or replace function public.set_capital_call_payments(
  p_capital_call_id uuid,
  p_rows            jsonb default '[]'::jsonb
)
returns void
language plpgsql
security invoker
set search_path = app, public
as $$
declare
  v_uid  uuid := app.current_app_user_id();
  v_fund uuid;
begin
  if v_uid is null then
    raise exception 'unauthorized' using errcode = '42501';
  end if;
  -- 차수 소속 펀드 조회(capital_calls SELECT RLS가 접근 판정 → 권한 없으면 v_fund null).
  select fund_id into v_fund
    from public.capital_calls
   where id = p_capital_call_id and deleted_at is null;
  if v_fund is null then
    raise exception 'capital_call_not_found_or_forbidden' using errcode = '42501';
  end if;

  -- payload에서 빠진 LP 행 제거(그 차수에서 요청 취소).
  delete from public.capital_call_payments p
   where p.capital_call_id = p_capital_call_id
     and p.lp_id not in (
       select (e->>'lp_id')::uuid
         from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb)) e
        where nullif(e->>'lp_id','') is not null
     );

  -- upsert: 요청액 · LP별 상태만 쓴다(나머지는 파생).
  insert into public.capital_call_payments
        (capital_call_id, lp_id, fund_id, requested_amount, status)
  select p_capital_call_id,
         (e->>'lp_id')::uuid,
         v_fund,
         coalesce(nullif(e->>'requested_amount','')::numeric, 0),
         (coalesce(
            nullif(e->>'status',''),
            case when coalesce((e->>'is_paid')::boolean, false) then 'PAID' else 'SCHEDULED' end
          ))::public.capital_call_status
    from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb)) e
   where nullif(e->>'lp_id','') is not null
     -- 같은 펀드 소속 LP만 허용(교차 펀드 오염 차단).
     and exists (
       select 1 from public.fund_lps fl
        where fl.id = (e->>'lp_id')::uuid and fl.fund_id = v_fund and fl.deleted_at is null
     )
  on conflict (capital_call_id, lp_id) do update
     set requested_amount = excluded.requested_amount,
         status           = excluded.status,
         fund_id          = excluded.fund_id;
end $$;

revoke all on function public.set_capital_call_payments(uuid, jsonb) from public;
grant execute on function public.set_capital_call_payments(uuid, jsonb) to authenticated;

comment on function public.set_capital_call_payments(uuid, jsonb) is
  '캐피탈 콜 차수×LP 요청액·LP별 상태 그리드 원자 교체. SECURITY INVOKER — 권한은 capital_call_payments/fund_lps RLS가 판정. 근거: 3_5_workspace_fund.md §1.3';
