-- =====================================================================
-- [Phase 8] FUND 워크스페이스 스키마
-- funds → fund_lps / capital_calls(→payments) / investments(→portfolio_financials)
-- 극히 민감한 금융 정보: FUND RW/R 외 접근 기본 차단(RLS + can_access_fund).
-- 근거: docs/docs_dev/3_database_rls_policy_matrix.md §4.3, docs_planning/3_5_workspace_fund.md
-- =====================================================================

do $$ begin create type public.fund_status as enum ('RAISING','OPERATING','LIQUIDATING','CLOSED');
exception when duplicate_object then null; end $$;

do $$ begin create type public.capital_call_status as enum
  ('SCHEDULED','NOTIFIED','PARTIALLY_PAID','PAID','OVERDUE');
exception when duplicate_object then null; end $$;

create table if not exists public.funds (
  id               uuid primary key default gen_random_uuid(),
  name             text not null,
  vintage_year     integer,
  total_commitment numeric(18,2) not null default 0,  -- 결성액
  drawn_amount     numeric(18,2) not null default 0,  -- 집행액
  status           public.fund_status not null default 'RAISING',
  manager_id       uuid references public.users(id),
  created_by       uuid references public.users(id),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  deleted_at       timestamptz
);

create table if not exists public.fund_lps (
  id                uuid primary key default gen_random_uuid(),
  fund_id           uuid not null references public.funds(id) on delete cascade,
  name              text not null,
  commitment_amount numeric(18,2) not null default 0,
  ownership_pct     numeric(5,2),
  contact           jsonb not null default '{}'::jsonb,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  deleted_at        timestamptz
);
create index if not exists idx_fund_lps_fund on public.fund_lps (fund_id);

create table if not exists public.capital_calls (
  id         uuid primary key default gen_random_uuid(),
  fund_id    uuid not null references public.funds(id) on delete cascade,
  call_no    integer not null default 1,
  amount     numeric(18,2) not null default 0,
  due_date   date,
  status     public.capital_call_status not null default 'SCHEDULED',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_capital_calls_fund on public.capital_calls (fund_id);

create table if not exists public.capital_call_payments (
  id              uuid primary key default gen_random_uuid(),
  capital_call_id uuid not null references public.capital_calls(id) on delete cascade,
  lp_id           uuid references public.fund_lps(id),
  amount          numeric(18,2) not null default 0,
  paid_at         timestamptz,
  is_paid         boolean not null default false
);

create table if not exists public.investments (
  id                uuid primary key default gen_random_uuid(),
  fund_id           uuid not null references public.funds(id) on delete cascade,
  startup_id        uuid references public.startups(id),  -- 피투자사(NETWORKS 연동)
  amount            numeric(18,2) not null default 0,
  invested_at       date,
  stage             text,
  is_own_investment boolean not null default true,  -- 자사 투자 배지
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  deleted_at        timestamptz
);
create index if not exists idx_investments_fund on public.investments (fund_id);
create index if not exists idx_investments_startup on public.investments (startup_id);

create table if not exists public.portfolio_financials (
  id            uuid primary key default gen_random_uuid(),
  investment_id uuid not null references public.investments(id) on delete cascade,
  period        date,
  revenue       numeric(18,2),
  valuation     numeric(18,2),
  note          text,
  created_at    timestamptz not null default now()
);

do $$
declare t text;
begin
  foreach t in array array['funds','fund_lps','capital_calls','investments'] loop
    execute format('drop trigger if exists trg_%s_updated_at on public.%I', t, t);
    execute format(
      'create trigger trg_%s_updated_at before update on public.%I for each row execute function app.set_updated_at()',
      t, t
    );
  end loop;
end $$;

-- RLS: FUND 스코프 (can_read/write_workspace('fund') + can_access_fund)
do $$
declare
  t text;
  scope_col text;
  sel_expr text;
  wr_expr text;
  fund_tables text[] := array[
    'funds','fund_lps','capital_calls','capital_call_payments','investments','portfolio_financials'
  ];
begin
  foreach t in array fund_tables loop
    execute format('alter table public.%I enable row level security', t);
    if t = 'funds' then
      scope_col := 'id';
    elsif exists (
      select 1 from information_schema.columns
       where table_schema='public' and table_name=t and column_name='fund_id'
    ) then
      scope_col := 'fund_id';
    else
      scope_col := null;  -- 손자 테이블(capital_call_payments, portfolio_financials)은 워크스페이스 게이트
    end if;

    if scope_col is not null then
      sel_expr := format('app.can_read_workspace(''fund'') and app.can_access_fund(%I)', scope_col);
      wr_expr  := format('app.can_write_workspace(''fund'') and app.can_access_fund(%I)', scope_col);
    else
      sel_expr := 'app.can_read_workspace(''fund'')';
      wr_expr  := 'app.can_write_workspace(''fund'')';
    end if;

    execute format('drop policy if exists %I on public.%I', t||'_fund_select', t);
    execute format('create policy %I on public.%I for select using (%s)', t||'_fund_select', t, sel_expr);
    execute format('drop policy if exists %I on public.%I', t||'_fund_insert', t);
    execute format('create policy %I on public.%I for insert with check (%s)', t||'_fund_insert', t, wr_expr);
    execute format('drop policy if exists %I on public.%I', t||'_fund_update', t);
    execute format('create policy %I on public.%I for update using (%s) with check (%s)', t||'_fund_update', t, wr_expr, wr_expr);
  end loop;
end $$;
