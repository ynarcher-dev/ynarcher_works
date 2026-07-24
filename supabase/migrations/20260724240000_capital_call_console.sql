-- =====================================================================
-- [Phase 8] FUND 캐피탈 콜 콘솔 — 출자자↔캐피탈 콜 연동(요청/납입 2축 + 파생)
--
-- 배경(사용자 확정, docs_planning/3_5_workspace_fund.md §1.3/§2.2)
--   캐피탈 콜은 N차 회차를 두고, 각 차수마다 LP별 "이번 차수 요청액"을 개별 입력한다
--   (LP마다 비율이 다를 수 있어 균등 안분을 강제하지 않는다). 각 행의 납입 체크박스를
--   켜는 순간 그 요청액이 실 납입액으로 반영되고, 집계 트리거가 아래 캐스케이드로 파생 갱신한다.
--
--     fund_lps.commitment_amount(약정·입력) → 지분율(파생)
--        → capital_call_payments.requested_amount(차수 요청·입력)
--        → is_paid(납입 체크) → fund_lps.paid_amount(실 납입·파생)
--        → funds.paid_in_amount(실출자금액·파생)
--
--   납입액은 화면에서 직접 쓰지 않는다 — sync_fund_drawn_amount 선례와 동일한 SECURITY INVOKER
--   집계 트리거가 소유한다. 배분·세전·출자잔액(outflow)은 본 마이그레이션 범위 밖(후속).
--
--   1) fund_lps.paid_amount                : LP 실 납입액(파생 컬럼)
--   2) capital_call_payments.requested_amount / fund_id : 차수 요청액 + RLS 표준화용 비정규화
--   3) capital_calls.deleted_at            : 회차 소프트 삭제
--   4) app.sync_capital_call_rollups()     : 요청액→차수총액, 납입→LP·펀드 실출자 집계 트리거
--   5) set_capital_call_payments()         : 차수×LP 그리드 원자 교체 RPC(SECURITY INVOKER)
--
-- 보안 게이트(docs/docs_dev/11_migration_security_gate.md):
--   · 소유 워크스페이스: fund. 데이터 등급: Restricted(금융). 접근 주체: 내부 FUND RW/R.
--   · capital_call_payments RLS를 워크스페이스 게이트에서 can_access_fund(fund_id)로 승격
--     (fund_id 비정규화 — investment_purposes 선례). SELECT/INSERT/UPDATE/DELETE 정책 분리.
--     그리드는 순수 배정성 데이터라 원자 교체 시 hard DELETE(fund_managers/fund_purposes 선례).
--   · 집계 트리거 app.sync_capital_call_rollups: SECURITY INVOKER — funds/fund_lps RLS를 그대로
--     준수(정책을 함수에 복제하지 않는다). sync_fund_drawn_amount와 동형.
--   · RPC set_capital_call_payments: SECURITY INVOKER — 접근 판정은 정책 헬퍼 호출, DML은 RLS 재강제.
--     search_path 고정, GRANT EXECUTE=authenticated 한정. SECURITY DEFINER/Storage/service_role 없음.
-- 근거: docs_planning/3_5_workspace_fund.md §1.3, §2.2
-- =====================================================================

-- 1) fund_lps 실 납입액(파생) --------------------------------------------
alter table public.fund_lps
  add column if not exists paid_amount numeric(18,2) not null default 0;

comment on column public.fund_lps.paid_amount is
  'LP 실 납입액(파생) = 캐피탈 콜에서 납입 체크된 요청액의 합. 직접 입력 금지, sync_capital_call_rollups 트리거가 갱신.';

-- 2) capital_call_payments 요청액 + fund_id 비정규화 ---------------------
alter table public.capital_call_payments
  add column if not exists requested_amount numeric(18,2) not null default 0,
  add column if not exists fund_id          uuid references public.funds(id) on delete cascade;

comment on column public.capital_call_payments.requested_amount is
  '이 차수에 이 LP가 납입해야 할 요청액(입력). amount는 실 납입액(is_paid일 때 requested_amount와 동일).';

-- 기존 행 백필: 소속 펀드(fund_id) 채우고, 요청액은 기록된 amount로 간주.
update public.capital_call_payments ccp
   set fund_id = cc.fund_id
  from public.capital_calls cc
 where ccp.capital_call_id = cc.id
   and ccp.fund_id is null;

update public.capital_call_payments
   set requested_amount = amount
 where requested_amount = 0 and amount > 0;

-- 차수당 LP 1행 강제(원자 교체 upsert 대상 유니크 키).
create unique index if not exists uq_capital_call_payments_call_lp
  on public.capital_call_payments (capital_call_id, lp_id);
create index if not exists idx_capital_call_payments_fund on public.capital_call_payments (fund_id);
create index if not exists idx_capital_call_payments_lp on public.capital_call_payments (lp_id);

-- 3) capital_calls 소프트 삭제 컬럼 --------------------------------------
alter table public.capital_calls
  add column if not exists deleted_at timestamptz;

-- 4) capital_call_payments RLS 승격(워크스페이스 게이트 → can_access_fund) --
-- 기존 fund_schema 정책(워크스페이스 게이트, DELETE 없음) 제거 후 fund_id 기반으로 재생성.
drop policy if exists capital_call_payments_fund_select on public.capital_call_payments;
drop policy if exists capital_call_payments_fund_insert on public.capital_call_payments;
drop policy if exists capital_call_payments_fund_update on public.capital_call_payments;

drop policy if exists capital_call_payments_select on public.capital_call_payments;
create policy capital_call_payments_select on public.capital_call_payments for select
  using (app.can_read_workspace('fund') and app.can_access_fund(fund_id));

drop policy if exists capital_call_payments_insert on public.capital_call_payments;
create policy capital_call_payments_insert on public.capital_call_payments for insert
  with check (app.can_write_workspace('fund') and app.can_access_fund(fund_id));

drop policy if exists capital_call_payments_update on public.capital_call_payments;
create policy capital_call_payments_update on public.capital_call_payments for update
  using (app.can_write_workspace('fund') and app.can_access_fund(fund_id))
  with check (app.can_write_workspace('fund') and app.can_access_fund(fund_id));

drop policy if exists capital_call_payments_delete on public.capital_call_payments;
create policy capital_call_payments_delete on public.capital_call_payments for delete
  using (app.can_write_workspace('fund') and app.can_access_fund(fund_id));

-- 5) 집계 트리거 — 요청액→차수총액, 납입→LP·펀드 실출자 -------------------
-- SECURITY INVOKER: 트리거를 유발한 FUND 쓰기 권한자가 자기 펀드의 파생 컬럼을 갱신하는
-- 것이므로 capital_calls/fund_lps/funds RLS를 그대로 준수한다(정책을 함수에 복제하지 않는다).
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
  foreach c in array call_ids loop
    update public.capital_calls cc
       set amount = coalesce((
             select sum(p.requested_amount) from public.capital_call_payments p
              where p.capital_call_id = c), 0)
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

drop trigger if exists trg_capital_call_payments_rollups on public.capital_call_payments;
create trigger trg_capital_call_payments_rollups
  after insert or update or delete on public.capital_call_payments
  for each row execute function app.sync_capital_call_rollups();

-- 기존 데이터 백필(트리거 도입 시점 정합성).
update public.capital_calls cc
   set amount = coalesce((
         select sum(p.requested_amount) from public.capital_call_payments p
          where p.capital_call_id = cc.id), 0);
update public.fund_lps fl
   set paid_amount = coalesce((
         select sum(p.amount) from public.capital_call_payments p
          where p.lp_id = fl.id and p.is_paid), 0);
update public.funds fu
   set paid_in_amount = coalesce((
         select sum(p.amount) from public.capital_call_payments p
          where p.fund_id = fu.id and p.is_paid), 0)
 where exists (select 1 from public.capital_call_payments p where p.fund_id = fu.id);

-- 6) set_capital_call_payments — 차수×LP 그리드 원자 교체 -----------------
--    p_rows: jsonb 배열 [{lp_id, requested_amount, is_paid}, ...]
--    is_paid면 amount=requested_amount·paid_at 스탬프(기존 납입일 보존), 아니면 amount=0·paid_at=null.
--    payload에 없는 LP 행은 삭제(그 차수에서 제외). fund_id는 차수에서 파생해 채운다.
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

  -- upsert: 요청액·납입여부 반영. amount(실 납입)는 is_paid일 때만 요청액과 동일.
  insert into public.capital_call_payments
        (capital_call_id, lp_id, fund_id, requested_amount, amount, is_paid, paid_at)
  select p_capital_call_id,
         (e->>'lp_id')::uuid,
         v_fund,
         coalesce(nullif(e->>'requested_amount','')::numeric, 0),
         case when (e->>'is_paid')::boolean
              then coalesce(nullif(e->>'requested_amount','')::numeric, 0) else 0 end,
         coalesce((e->>'is_paid')::boolean, false),
         case when (e->>'is_paid')::boolean then now() else null end
    from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb)) e
   where nullif(e->>'lp_id','') is not null
     -- 같은 펀드 소속 LP만 허용(교차 펀드 오염 차단).
     and exists (
       select 1 from public.fund_lps fl
        where fl.id = (e->>'lp_id')::uuid and fl.fund_id = v_fund and fl.deleted_at is null
     )
  on conflict (capital_call_id, lp_id) do update
     set requested_amount = excluded.requested_amount,
         is_paid          = excluded.is_paid,
         amount           = excluded.amount,
         -- 이미 납입 처리된 행은 최초 납입일을 보존, 새로 켜지면 now(), 꺼지면 null.
         paid_at          = case
                              when excluded.is_paid
                                then coalesce(capital_call_payments.paid_at, now())
                              else null end,
         fund_id          = excluded.fund_id;
end $$;

revoke all on function public.set_capital_call_payments(uuid, jsonb) from public;
grant execute on function public.set_capital_call_payments(uuid, jsonb) to authenticated;

comment on function public.set_capital_call_payments(uuid, jsonb) is
  '캐피탈 콜 차수×LP 요청·납입 그리드 원자 교체. SECURITY INVOKER — 권한은 capital_call_payments/fund_lps RLS가 판정. 근거: 3_5_workspace_fund.md §1.3';
