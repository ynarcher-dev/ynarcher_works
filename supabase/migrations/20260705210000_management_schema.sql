-- =====================================================================
-- [Phase 12] MANAGEMENT 워크스페이스 스키마
-- 전자결재(approval_documents/approval_lines) · 인사(hr_profiles/hr_assignments/hr_trainings)
-- · 재무/KPI(dept_budgets/kpi_records) · 자산(assets)
-- 임직원 마스터 SSOT는 MANAGEMENT(users/departments 확장). ADMIN 권한 템플릿과 연동.
-- 근거: docs_planning/3_7_workspace_management.md
-- =====================================================================

-- 조직도 계층(본부→실→팀)을 위한 상위 부서 참조 추가(멱등)
alter table public.departments
  add column if not exists parent_id uuid references public.departments(id);

do $$ begin create type public.approval_status as enum
  ('DRAFT','PENDING','IN_REVIEW','APPROVED','REJECTED');
exception when duplicate_object then null; end $$;

do $$ begin create type public.approval_decision as enum
  ('PENDING','APPROVED','REJECTED');
exception when duplicate_object then null; end $$;

do $$ begin create type public.asset_status as enum
  ('ASSIGNED','AVAILABLE','MAINTENANCE','RETIRED');
exception when duplicate_object then null; end $$;

-- 전자결재 문서 -----------------------------------------------------------
create table if not exists public.approval_documents (
  id          uuid primary key default gen_random_uuid(),
  title       text not null,
  form_type   text not null default 'GENERAL',   -- 투자심의/예산집행/비용청구 등
  drafter_id  uuid references public.users(id),
  amount      numeric(18,2),                       -- 예산 집행/비용 청구액(실지출 집계 원천)
  body        text,
  status      public.approval_status not null default 'PENDING',
  department_id uuid references public.departments(id),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz
);
create index if not exists idx_approval_docs_drafter on public.approval_documents (drafter_id, status);

-- 결재선(순차 지정) -------------------------------------------------------
create table if not exists public.approval_lines (
  id          uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.approval_documents(id) on delete cascade,
  approver_id uuid references public.users(id),
  step_order  integer not null default 1,
  decision    public.approval_decision not null default 'PENDING',
  comment     text,
  decided_at  timestamptz
);
create index if not exists idx_approval_lines_doc on public.approval_lines (document_id, step_order);
create index if not exists idx_approval_lines_approver on public.approval_lines (approver_id, decision);

-- 인사 기본 정보(HRM) -----------------------------------------------------
create table if not exists public.hr_profiles (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references public.users(id) on delete cascade unique,
  grade              text,                          -- 직급
  hire_date          date,
  annual_leave_total numeric(4,1) not null default 15,
  annual_leave_used  numeric(4,1) not null default 0,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

-- 발령 이력(부서 이동) ----------------------------------------------------
create table if not exists public.hr_assignments (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references public.users(id) on delete cascade,
  department_id  uuid references public.departments(id),
  title          text,
  effective_date date not null default current_date,
  created_at     timestamptz not null default now()
);
create index if not exists idx_hr_assignments_user on public.hr_assignments (user_id, effective_date desc);

-- 교육/역량 이력(HRD) -----------------------------------------------------
create table if not exists public.hr_trainings (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.users(id) on delete cascade,
  name         text not null,
  category     text,                                -- 직무교육/자격증/세미나
  completed_at date,
  cert_no      text,
  created_at   timestamptz not null default now()
);
create index if not exists idx_hr_trainings_user on public.hr_trainings (user_id);

-- 부서별 예산(재무) -------------------------------------------------------
create table if not exists public.dept_budgets (
  id            uuid primary key default gen_random_uuid(),
  department_id uuid references public.departments(id),
  fiscal_year   integer not null,
  budget_amount numeric(18,2) not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (department_id, fiscal_year)
);

-- 부서별 KPI --------------------------------------------------------------
create table if not exists public.kpi_records (
  id           uuid primary key default gen_random_uuid(),
  workspace_key public.workspace_key,
  metric_name  text not null,
  target_value numeric(18,2),
  actual_value numeric(18,2),
  period       text,                                -- 예: 2026-Q3
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- 자산/비품 --------------------------------------------------------------
create table if not exists public.assets (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  category    text,                                 -- 노트북/차량/라이선스 등
  status      public.asset_status not null default 'AVAILABLE',
  assigned_to uuid references public.users(id),
  return_due  date,
  note        text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz
);
create index if not exists idx_assets_status on public.assets (status);

-- updated_at 트리거 --------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array[
    'approval_documents','hr_profiles','dept_budgets','kpi_records','assets'
  ] loop
    execute format('drop trigger if exists trg_%s_updated_at on public.%I', t, t);
    execute format(
      'create trigger trg_%s_updated_at before update on public.%I for each row execute function app.set_updated_at()',
      t, t
    );
  end loop;
end $$;

-- RLS: MANAGEMENT 워크스페이스 게이트 ------------------------------------
-- 임직원 개인은 본인 결재 대기/기안 문서를 조회해야 하므로 결재 관련 테이블은
-- 워크스페이스 게이트 + 본인 관련(기안자/결재자) 조회를 함께 허용.
do $$
declare
  t          text;
  sel_expr   text;
  wr_expr    text;
  mgmt_tables text[] := array[
    'hr_profiles','hr_assignments','hr_trainings','dept_budgets','kpi_records','assets'
  ];
begin
  sel_expr := 'app.can_read_workspace(''management'')';
  wr_expr  := 'app.can_write_workspace(''management'')';
  foreach t in array mgmt_tables loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t||'_mgmt_select', t);
    execute format('create policy %I on public.%I for select using (%s)', t||'_mgmt_select', t, sel_expr);
    execute format('drop policy if exists %I on public.%I', t||'_mgmt_insert', t);
    execute format('create policy %I on public.%I for insert with check (%s)', t||'_mgmt_insert', t, wr_expr);
    execute format('drop policy if exists %I on public.%I', t||'_mgmt_update', t);
    execute format('create policy %I on public.%I for update using (%s) with check (%s)', t||'_mgmt_update', t, wr_expr, wr_expr);
  end loop;
end $$;

-- 전자결재: 워크스페이스 게이트 또는 본인(기안자/결재자) 관련 문서 --------
alter table public.approval_documents enable row level security;
drop policy if exists approval_docs_select on public.approval_documents;
create policy approval_docs_select on public.approval_documents for select
  using (
    app.can_read_workspace('management')
    or drafter_id = app.current_app_user_id()
    or exists (
      select 1 from public.approval_lines l
       where l.document_id = approval_documents.id
         and l.approver_id = app.current_app_user_id()
    )
  );
drop policy if exists approval_docs_insert on public.approval_documents;
create policy approval_docs_insert on public.approval_documents for insert
  with check (
    app.can_write_workspace('management')
    or drafter_id = app.current_app_user_id()
  );
drop policy if exists approval_docs_update on public.approval_documents;
create policy approval_docs_update on public.approval_documents for update
  using (app.can_write_workspace('management') or drafter_id = app.current_app_user_id())
  with check (app.can_write_workspace('management') or drafter_id = app.current_app_user_id());

alter table public.approval_lines enable row level security;
drop policy if exists approval_lines_select on public.approval_lines;
create policy approval_lines_select on public.approval_lines for select
  using (
    app.can_read_workspace('management')
    or approver_id = app.current_app_user_id()
    or exists (
      select 1 from public.approval_documents d
       where d.id = approval_lines.document_id
         and d.drafter_id = app.current_app_user_id()
    )
  );
drop policy if exists approval_lines_insert on public.approval_lines;
create policy approval_lines_insert on public.approval_lines for insert
  with check (
    app.can_write_workspace('management')
    or exists (
      select 1 from public.approval_documents d
       where d.id = approval_lines.document_id
         and d.drafter_id = app.current_app_user_id()
    )
  );
-- 결재 처리(승인/반려)는 본인 결재선 행만 갱신 가능
drop policy if exists approval_lines_update on public.approval_lines;
create policy approval_lines_update on public.approval_lines for update
  using (app.can_write_workspace('management') or approver_id = app.current_app_user_id())
  with check (app.can_write_workspace('management') or approver_id = app.current_app_user_id());
