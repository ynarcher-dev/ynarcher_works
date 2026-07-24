-- =====================================================================
-- [Phase 8] FUND 기간·금액 컬럼 + 운용/관리 인력 원장 (2차 확장)
--   1) funds: 결성일·존속기간·운용(투자)기간·실출자금액 컬럼(전부 nullable)
--   2) fund_managers: 운용/관리 인력 junction(대표펀드매니저=is_lead)
--
-- 보안 게이트(11_migration_security_gate.md):
--   · 소유 워크스페이스: fund. 데이터 등급: Restricted(금융). 접근 주체: 내부 FUND RW/R.
--   · funds 컬럼 추가: 기존 funds RLS가 컬럼 무관이라 그대로 커버(정책 변경 불필요).
--   · fund_managers(신규 테이블): RLS 즉시 활성화, SELECT/INSERT/UPDATE/DELETE 정책 분리,
--     판정은 app.can_read/write_workspace('fund') + app.can_access_fund() 헬퍼 경유.
--     순수 배정 junction이므로 startup_managers 선례를 따라 배정 해제는 hard DELETE로 처리
--     (감사 필요 시 후속 audit 트리거로 확장). SECURITY DEFINER/Storage/service_role 없음.
--   · 외부 게스트는 fund 워크스페이스 읽기 권한이 없어 fund_managers 접근 불가.
-- 근거: docs_planning/3_5_workspace_fund.md §2.1
-- =====================================================================

-- 1) funds 기간·금액 컬럼 -------------------------------------------------
alter table public.funds
  add column if not exists formed_on        date,           -- 결성일
  add column if not exists term_start       date,           -- 존속기간 시작
  add column if not exists term_end         date,           -- 존속기간 종료
  add column if not exists operation_start  date,           -- 운용(투자)기간 시작
  add column if not exists operation_end    date,           -- 운용(투자)기간 종료
  add column if not exists paid_in_amount   numeric(18,2);  -- 실출자금액(납입총액)

comment on column public.funds.formed_on is '결성일.';
comment on column public.funds.term_start is '존속기간 시작일.';
comment on column public.funds.term_end is '존속기간 종료일.';
comment on column public.funds.operation_start is '운용(투자)기간 시작일.';
comment on column public.funds.operation_end is '운용(투자)기간 종료일. 관리보수 3년 미만 판정 근거.';
comment on column public.funds.paid_in_amount is '실출자금액(납입총액).';

-- 2) fund_managers junction ---------------------------------------------
create table if not exists public.fund_managers (
  fund_id     uuid not null references public.funds(id) on delete cascade,
  user_id     uuid not null references public.users(id),
  role        text not null default 'OPERATION',  -- OPERATION(운용)/ADMIN(관리)
  is_lead     boolean not null default false,      -- 대표펀드매니저 여부
  assigned_by uuid references public.users(id),
  assigned_at timestamptz not null default now(),
  primary key (fund_id, user_id)
);
create index if not exists idx_fund_managers_user on public.fund_managers (user_id);
-- 펀드당 대표펀드매니저(is_lead) 1명 강제.
create unique index if not exists uq_fund_managers_one_lead
  on public.fund_managers (fund_id) where is_lead;

alter table public.fund_managers enable row level security;

drop policy if exists fund_managers_select on public.fund_managers;
create policy fund_managers_select on public.fund_managers for select
  using (app.can_read_workspace('fund') and app.can_access_fund(fund_id));

drop policy if exists fund_managers_insert on public.fund_managers;
create policy fund_managers_insert on public.fund_managers for insert
  with check (app.can_write_workspace('fund') and app.can_access_fund(fund_id));

drop policy if exists fund_managers_update on public.fund_managers;
create policy fund_managers_update on public.fund_managers for update
  using (app.can_write_workspace('fund') and app.can_access_fund(fund_id))
  with check (app.can_write_workspace('fund') and app.can_access_fund(fund_id));

drop policy if exists fund_managers_delete on public.fund_managers;
create policy fund_managers_delete on public.fund_managers for delete
  using (app.can_write_workspace('fund') and app.can_access_fund(fund_id));

comment on table public.fund_managers is
  '펀드 운용/관리 인력 junction(OPERATION=운용, ADMIN=관리). 대표펀드매니저는 is_lead=true. 근거: 3_5_workspace_fund.md §2.1';
