-- =====================================================================
-- [Phase 9] M&A 사업 원장 — AC Program First 구조 이식
-- 배경: M&A 워크스페이스를 AC와 동일한 구조(대시보드/내 사업/전체 사업 + 리스트뷰 + 사업 상세 + 모듈 보드)로
--   재편한다. 원장은 AC와 물리적으로 분리하되 스키마 형태와 운영 규칙은 동일하게 유지하여
--   프론트 공용 모듈(features/program)이 테이블명 주입만으로 재사용되도록 한다.
--
-- 범위:
--   - 신규 8테이블: ma_programs / ma_program_modules / ma_program_module_assignees /
--     ma_program_managers / ma_program_departments / ma_program_participants /
--     ma_program_timeline_items / ma_custom_activities
--   - enum은 신규 생성하지 않고 AC가 쓰는 public enum을 그대로 재사용한다.
--   - 모듈 템플릿은 CUSTOM_ACTIVITY만 운용하므로 모집/평가/멘토링/매칭/데모데이/성과 하위 테이블은 만들지 않는다.
--   - 사업구분(category): SELL / BUY / PE_FUND / ETC (AC의 PUBLIC/PRIVATE/REVENUE와 다름)
--
-- 기존 ma_deals / ma_deal_stage_logs / ma_deal_documents / ma_match_candidates는
--   물리 삭제 금지 원칙에 따라 DROP하지 않는다(화면만 제거).
--
-- 보안 게이트(11_migration_security_gate.md) 답변:
--   - 소유 워크스페이스: mna
--   - 데이터 등급: Restricted (딜 정보. 게스트 전면 차단)
--   - 접근 주체: 내부 사용자만. 외부 스타트업/전문가/게스트 정책 미부여 → default deny
--   - Scope 기준: global 또는 program 단건(app.can_access_ws_program('mna', ...))
--   - 감사 로그: 본 마이그레이션은 개인정보 원본 조회·다운로드·Export·권한 변경 경로를 만들지 않음
--   - 운영 영향: 신규 테이블만 추가. 기존 AC 테이블/정책/RPC 무변경
-- 근거: 20260705150100_ac_core.sql, 20260705150400_ac_ops.sql, 20260705150500_ac_rls.sql,
--       20260715180000_program_departments.sql, 20260715190000_program_staffing_org_version.sql,
--       20260716160000_program_module_instances.sql, 20260716200000_program_code.sql
-- =====================================================================

-- (1) 원장 -----------------------------------------------------------------
create table if not exists public.ma_programs (
  id                   uuid primary key default gen_random_uuid(),
  code                 text,
  title                text not null,
  internal_title       text,
  slug                 text unique,
  status               public.program_status not null default 'DRAFT',
  category             text,
  proposal_start_date  date,
  proposal_end_date    date,
  start_date           date,
  end_date             date,
  host_organization    text,
  partner_organization text,
  description          text,
  created_by           uuid references public.users(id),
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  deleted_at           timestamptz,
  constraint ma_programs_category_check
    check (category is null or category in ('SELL', 'BUY', 'PE_FUND', 'ETC'))
);

create index if not exists idx_ma_programs_status on public.ma_programs (status);
create unique index if not exists idx_ma_programs_code on public.ma_programs (code);

-- (2) 모듈 인스턴스 ---------------------------------------------------------
create table if not exists public.ma_program_modules (
  id                 uuid primary key default gen_random_uuid(),
  program_id         uuid not null references public.ma_programs(id) on delete cascade,
  module_type        public.module_type not null,
  title              text,
  enabled            boolean not null default true,
  status             public.module_status not null default 'DRAFT',
  visibility         public.module_visibility not null default 'INTERNAL_ONLY',
  participation_mode public.participation_mode,
  settings           jsonb not null default '{}'::jsonb,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create index if not exists idx_ma_program_modules_program on public.ma_program_modules (program_id);
-- 모듈명은 사업 내에서 유일(공백·대소문자 정규화 비교).
create unique index if not exists uq_ma_program_modules_title
  on public.ma_program_modules (program_id, lower(btrim(title)))
  where title is not null;
-- 성과/KPI 모듈은 사업당 1개(현재 M&A는 CUSTOM_ACTIVITY만 노출하나 규칙은 AC와 동일하게 유지).
create unique index if not exists uq_ma_program_modules_outcomes_singleton
  on public.ma_program_modules (program_id)
  where module_type = 'OUTCOMES';

-- (3) 모듈 담당자 -----------------------------------------------------------
create table if not exists public.ma_program_module_assignees (
  id                uuid primary key default gen_random_uuid(),
  program_module_id uuid not null references public.ma_program_modules(id) on delete cascade,
  user_id           uuid not null references public.users(id),
  assigned_by       uuid references public.users(id),
  assigned_at       timestamptz not null default now(),
  unique (program_module_id, user_id)
);

create index if not exists idx_ma_module_assignees_module
  on public.ma_program_module_assignees (program_module_id);
create index if not exists idx_ma_module_assignees_user
  on public.ma_program_module_assignees (user_id);

-- (4) 부서 구성 / 담당자 배치 ------------------------------------------------
create table if not exists public.ma_program_departments (
  id                  uuid primary key default gen_random_uuid(),
  program_id          uuid not null references public.ma_programs(id) on delete cascade,
  department_id       uuid not null references public.departments(id),
  org_version_id      uuid not null references public.org_versions(id),
  kind                public.program_department_kind not null,
  collaboration_ratio smallint not null check (collaboration_ratio between 1 and 100),
  created_at          timestamptz not null default now(),
  constraint ma_program_departments_prog_ver_dept_key
    unique (program_id, org_version_id, department_id)
);

create index if not exists idx_ma_program_departments_program
  on public.ma_program_departments (program_id);
create index if not exists idx_ma_program_departments_prog_ver
  on public.ma_program_departments (program_id, org_version_id);

-- 동일 (program_id, user_id) 복수 행 허용 — 기간 세그먼트 모델(AC와 동일).
create table if not exists public.ma_program_managers (
  id              uuid primary key default gen_random_uuid(),
  program_id      uuid not null references public.ma_programs(id) on delete cascade,
  user_id         uuid not null references public.users(id),
  department_id   uuid references public.departments(id),
  org_version_id  uuid references public.org_versions(id),
  role            public.program_manager_role not null default 'MEMBER',
  allocation_rate smallint not null,
  start_date      date not null,
  end_date        date not null,
  assigned_by     uuid references public.users(id),
  assigned_at     timestamptz not null default now(),
  constraint ma_program_managers_alloc_chk  check (allocation_rate between 1 and 100),
  constraint ma_program_managers_period_chk check (end_date >= start_date)
);

create index if not exists idx_ma_program_managers_program on public.ma_program_managers (program_id);
create index if not exists idx_ma_program_managers_user    on public.ma_program_managers (user_id);

-- (5) 참가자 / 타임라인 / 커스텀 활동 ----------------------------------------
create table if not exists public.ma_program_participants (
  id         uuid primary key default gen_random_uuid(),
  program_id uuid not null references public.ma_programs(id) on delete cascade,
  user_id    uuid references public.users(id),
  master_id  uuid,
  role       public.program_participant_role not null,
  role_tags  text[] not null default '{}',
  status     text not null default 'ACTIVE',
  invited_at timestamptz,
  joined_at  timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (program_id, user_id, role)
);

create index if not exists idx_ma_program_participants_program
  on public.ma_program_participants (program_id);

create table if not exists public.ma_program_timeline_items (
  id                uuid primary key default gen_random_uuid(),
  program_id        uuid not null references public.ma_programs(id) on delete cascade,
  program_module_id uuid references public.ma_program_modules(id),
  source_table      text,
  source_id         uuid,
  item_type         text,
  title             text not null,
  starts_at         timestamptz,
  ends_at           timestamptz,
  visibility        text not null default 'INTERNAL_ONLY',
  created_at        timestamptz not null default now()
);

create index if not exists idx_ma_timeline_items_program
  on public.ma_program_timeline_items (program_id);

create table if not exists public.ma_custom_activities (
  id                uuid primary key default gen_random_uuid(),
  program_id        uuid not null references public.ma_programs(id) on delete cascade,
  program_module_id uuid references public.ma_program_modules(id),
  session_source_id uuid,
  activity_type     text,
  title             text not null,
  activity_date     date,
  visibility        public.activity_visibility not null default 'INTERNAL_ONLY',
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index if not exists idx_ma_custom_activities_program
  on public.ma_custom_activities (program_id);
create index if not exists idx_ma_custom_activities_module
  on public.ma_custom_activities (program_module_id);

-- (6) updated_at 트리거 -----------------------------------------------------
drop trigger if exists trg_ma_programs_updated_at on public.ma_programs;
create trigger trg_ma_programs_updated_at
  before update on public.ma_programs
  for each row execute function app.set_updated_at();

drop trigger if exists trg_ma_program_modules_updated_at on public.ma_program_modules;
create trigger trg_ma_program_modules_updated_at
  before update on public.ma_program_modules
  for each row execute function app.set_updated_at();

drop trigger if exists trg_ma_program_participants_updated_at on public.ma_program_participants;
create trigger trg_ma_program_participants_updated_at
  before update on public.ma_program_participants
  for each row execute function app.set_updated_at();

drop trigger if exists trg_ma_custom_activities_updated_at on public.ma_custom_activities;
create trigger trg_ma_custom_activities_updated_at
  before update on public.ma_custom_activities
  for each row execute function app.set_updated_at();

-- (7) 사업코드 자동 부여 — 6자리 영숫자 난수(public.gen_program_code() 재사용) ---
create or replace function public.ma_programs_assign_code()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  candidate text;
begin
  if new.code is not null and btrim(new.code) <> '' then
    return new;
  end if;
  loop
    candidate := public.gen_program_code();
    exit when not exists (select 1 from public.ma_programs where code = candidate);
  end loop;
  new.code := candidate;
  return new;
end;
$$;

drop trigger if exists trg_ma_programs_assign_code on public.ma_programs;
create trigger trg_ma_programs_assign_code
  before insert on public.ma_programs
  for each row execute function public.ma_programs_assign_code();

-- (8) 모듈 담당자 풀 소속 강제 트리거 ----------------------------------------
create or replace function public.enforce_ma_module_assignee_in_pool()
returns trigger
language plpgsql
security definer
set search_path = app, public
as $$
declare
  v_program_id uuid;
begin
  select program_id into v_program_id
  from public.ma_program_modules where id = new.program_module_id;

  if v_program_id is null then
    raise exception '모듈 인스턴스를 찾을 수 없습니다.' using errcode = '23503';
  end if;

  if not exists (
    select 1 from public.ma_program_managers pm
    where pm.program_id = v_program_id and pm.user_id = new.user_id
  ) then
    raise exception '담당자는 사업 담당자 풀에 있는 사용자만 지정할 수 있습니다.' using errcode = '23514';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_ma_module_assignee_pool on public.ma_program_module_assignees;
create trigger trg_ma_module_assignee_pool
  before insert or update on public.ma_program_module_assignees
  for each row execute function public.enforce_ma_module_assignee_in_pool();

-- (9) RLS — 즉시 활성화 + SELECT/INSERT/UPDATE 분리, DELETE 정책 없음(soft delete) --
alter table public.ma_programs                  enable row level security;
alter table public.ma_program_modules           enable row level security;
alter table public.ma_program_module_assignees  enable row level security;
alter table public.ma_program_departments       enable row level security;
alter table public.ma_program_managers          enable row level security;
alter table public.ma_program_participants      enable row level security;
alter table public.ma_program_timeline_items    enable row level security;
alter table public.ma_custom_activities         enable row level security;

-- 원장(스코프 컬럼 = id)
drop policy if exists ma_programs_select on public.ma_programs;
create policy ma_programs_select on public.ma_programs for select
  using (app.can_read_workspace('mna') and app.can_access_ws_program('mna', id));

drop policy if exists ma_programs_insert on public.ma_programs;
create policy ma_programs_insert on public.ma_programs for insert
  with check (app.can_write_workspace('mna') and app.can_access_ws_program('mna', id));

drop policy if exists ma_programs_update on public.ma_programs;
create policy ma_programs_update on public.ma_programs for update
  using (app.can_write_workspace('mna') and app.can_access_ws_program('mna', id))
  with check (app.can_write_workspace('mna') and app.can_access_ws_program('mna', id));

-- 하위 테이블(스코프 컬럼 = program_id)
do $$
declare
  t text;
begin
  foreach t in array array[
    'ma_program_modules',
    'ma_program_participants',
    'ma_program_timeline_items',
    'ma_custom_activities'
  ] loop
    execute format('drop policy if exists %I on public.%I', t || '_select', t);
    execute format(
      'create policy %I on public.%I for select using (app.can_read_workspace(''mna'') and app.can_access_ws_program(''mna'', program_id))',
      t || '_select', t);

    execute format('drop policy if exists %I on public.%I', t || '_insert', t);
    execute format(
      'create policy %I on public.%I for insert with check (app.can_write_workspace(''mna'') and app.can_access_ws_program(''mna'', program_id))',
      t || '_insert', t);

    execute format('drop policy if exists %I on public.%I', t || '_update', t);
    execute format(
      'create policy %I on public.%I for update using (app.can_write_workspace(''mna'') and app.can_access_ws_program(''mna'', program_id)) with check (app.can_write_workspace(''mna'') and app.can_access_ws_program(''mna'', program_id))',
      t || '_update', t);
  end loop;
end;
$$;

-- 부서/담당자 배치는 조회만 정책으로 열고 쓰기는 RPC 전용(AC와 동일 규칙).
drop policy if exists ma_program_departments_select on public.ma_program_departments;
create policy ma_program_departments_select on public.ma_program_departments for select
  using (app.can_read_workspace('mna') and app.can_access_ws_program('mna', program_id));

drop policy if exists ma_program_managers_select on public.ma_program_managers;
create policy ma_program_managers_select on public.ma_program_managers for select
  using (app.can_read_workspace('mna') and app.can_access_ws_program('mna', program_id));

-- 모듈 담당자는 상위 모듈 경유 판정.
drop policy if exists ma_program_module_assignees_select on public.ma_program_module_assignees;
create policy ma_program_module_assignees_select on public.ma_program_module_assignees for select
  using (app.can_read_workspace('mna') and exists (
    select 1 from public.ma_program_modules pm
    where pm.id = program_module_id and app.can_access_ws_program('mna', pm.program_id)));

drop policy if exists ma_program_module_assignees_insert on public.ma_program_module_assignees;
create policy ma_program_module_assignees_insert on public.ma_program_module_assignees for insert
  with check (app.can_write_workspace('mna') and exists (
    select 1 from public.ma_program_modules pm
    where pm.id = program_module_id and app.can_access_ws_program('mna', pm.program_id)));

drop policy if exists ma_program_module_assignees_update on public.ma_program_module_assignees;
create policy ma_program_module_assignees_update on public.ma_program_module_assignees for update
  using (app.can_write_workspace('mna') and exists (
    select 1 from public.ma_program_modules pm
    where pm.id = program_module_id and app.can_access_ws_program('mna', pm.program_id)))
  with check (app.can_write_workspace('mna') and exists (
    select 1 from public.ma_program_modules pm
    where pm.id = program_module_id and app.can_access_ws_program('mna', pm.program_id)));

-- (10) 배치 저장 RPC — 단계(org 버전)별 독립 검증 + 원자 전량 교체 -------------
-- p_departments: [{ org_version_id, department_id, kind, collaboration_ratio }, ...]
-- p_managers:    [{ user_id, org_version_id, department_id, role, allocation_rate, start_date, end_date }, ...]
create or replace function public.set_ma_program_staffing(
  p_program_id  uuid,
  p_departments jsonb,
  p_managers    jsonb
)
returns void
language plpgsql
security definer
set search_path = app, public
as $$
declare
  v_dep_count  int;
  v_mgr_count  int;
  v_pm         int;
  v_prog_start date;
  v_prog_end   date;
  v_env_start  date;
  v_env_end    date;
  v_bad        int;
begin
  -- 인가
  if not (
    app.is_admin()
    or (app.can_write_workspace('mna') and app.can_access_ws_program('mna', p_program_id))
  ) then
    raise exception '사업 담당자를 변경할 권한이 없습니다.' using errcode = '42501';
  end if;

  select count(*) into v_dep_count
  from jsonb_to_recordset(coalesce(p_departments, '[]'::jsonb))
    as d(org_version_id uuid, department_id uuid, kind text, collaboration_ratio int);
  select count(*), count(*) filter (where role = 'PM') into v_mgr_count, v_pm
  from jsonb_to_recordset(coalesce(p_managers, '[]'::jsonb))
    as m(user_id uuid, org_version_id uuid, department_id uuid, role text, allocation_rate int, start_date date, end_date date);

  if v_dep_count = 0 and v_mgr_count = 0 then
    delete from public.ma_program_managers    where program_id = p_program_id;
    delete from public.ma_program_departments where program_id = p_program_id;
    return;
  end if;
  if v_dep_count = 0 then
    raise exception '부서 구성을 먼저 설정해야 합니다.';
  end if;

  if exists (
    select 1 from jsonb_to_recordset(p_departments) as d(org_version_id uuid, kind text, collaboration_ratio int)
    where d.org_version_id is null or d.kind not in ('MAIN', 'COLLAB')
       or d.collaboration_ratio is null or d.collaboration_ratio < 1 or d.collaboration_ratio > 100
  ) then
    raise exception '부서 종류(MAIN/COLLAB)·협업비율(1~100)·org 버전을 올바르게 입력하세요.';
  end if;
  if exists (
    select 1 from jsonb_to_recordset(p_departments) as d(org_version_id uuid, department_id uuid)
    left join public.departments dd on dd.id = d.department_id
    where dd.id is null or dd.version_id <> d.org_version_id
  ) then
    raise exception '부서가 지정한 조직 버전에 속하지 않습니다.';
  end if;
  if exists (
    select 1 from jsonb_to_recordset(p_departments) as d(org_version_id uuid, department_id uuid, kind text, collaboration_ratio int)
    group by d.org_version_id
    having count(*) filter (where d.kind = 'MAIN') <> 1
        or sum(d.collaboration_ratio) <> 100
        or count(*) <> count(distinct d.department_id)
  ) then
    raise exception '각 조직 버전(단계)에서 메인 1개 + 협업비율 합 100%%를 지켜야 합니다.';
  end if;

  if v_mgr_count = 0 then raise exception '담당자를 1명 이상 배정해야 합니다.'; end if;
  if v_pm < 1 then raise exception 'PM을 최소 1명(구간) 지정해야 합니다.'; end if;
  if exists (
    select 1 from jsonb_to_recordset(p_managers) as m(role text, allocation_rate int, start_date date, end_date date, org_version_id uuid, department_id uuid)
    where m.role is null or m.role not in ('PM', 'MEMBER')
       or m.allocation_rate is null or m.allocation_rate < 1 or m.allocation_rate > 100
       or m.start_date is null or m.end_date is null or m.start_date > m.end_date
       or m.org_version_id is null or m.department_id is null
  ) then
    raise exception '담당자 구간의 부서·역할·투입률(1~100)·수행 기간을 올바르게 입력하세요.';
  end if;
  if exists (
    select 1 from jsonb_to_recordset(p_managers) as m(org_version_id uuid, department_id uuid)
    where not exists (
      select 1 from jsonb_to_recordset(p_departments) as d(org_version_id uuid, department_id uuid)
      where d.org_version_id = m.org_version_id and d.department_id = m.department_id)
  ) then
    raise exception '담당자의 부서는 해당 단계에 지정된 부서 중 하나여야 합니다.';
  end if;
  if exists (
    select 1 from jsonb_to_recordset(p_managers) as m(org_version_id uuid, start_date date, end_date date)
    join public.org_versions ov on ov.id = m.org_version_id
    where m.start_date < ov.effective_from or (ov.effective_to is not null and m.end_date >= ov.effective_to)
  ) then
    raise exception '담당자 구간이 소속 조직 버전의 유효기간을 벗어났습니다.';
  end if;

  select start_date, end_date into v_prog_start, v_prog_end from public.ma_programs where id = p_program_id;
  if v_prog_start is not null and v_prog_end is not null then
    if exists (
      select 1 from jsonb_to_recordset(p_managers) as m(start_date date, end_date date)
      where m.start_date < v_prog_start or m.end_date > v_prog_end
    ) then
      raise exception '담당자 수행 기간은 사업 기간(% ~ %) 내여야 합니다.', v_prog_start, v_prog_end;
    end if;
  end if;

  select coalesce(v_prog_start, min(start_date)), coalesce(v_prog_end, max(end_date))
    into v_env_start, v_env_end
  from jsonb_to_recordset(p_managers) as m(start_date date, end_date date);

  with days as (select g.d::date d from generate_series(v_env_start, v_env_end, interval '1 day') g(d)),
  cfg_ver as (
    select distinct d.org_version_id, ov.effective_from, ov.effective_to
    from jsonb_to_recordset(p_departments) as d(org_version_id uuid, department_id uuid, kind text, collaboration_ratio int)
    join public.org_versions ov on ov.id = d.org_version_id
  ),
  day_ver as (
    select days.d, cv.org_version_id
    from days join cfg_ver cv
      on days.d >= cv.effective_from and (cv.effective_to is null or days.d < cv.effective_to)
  )
  select count(*) into v_bad
  from day_ver dv
  join jsonb_to_recordset(p_departments) as dep(org_version_id uuid, department_id uuid, kind text, collaboration_ratio int)
    on dep.org_version_id = dv.org_version_id
  where dep.collaboration_ratio <> (
    select coalesce(sum(m.allocation_rate), 0)
    from jsonb_to_recordset(p_managers)
      as m(org_version_id uuid, department_id uuid, allocation_rate int, start_date date, end_date date)
    where m.org_version_id = dep.org_version_id and m.department_id = dep.department_id
      and m.start_date <= dv.d and m.end_date >= dv.d
  );
  if v_bad > 0 then
    raise exception '단계별로 각 부서를 전 구간에서 협업비율만큼 채워야 합니다. (미충족 %건)', v_bad;
  end if;

  delete from public.ma_program_managers    where program_id = p_program_id;
  delete from public.ma_program_departments where program_id = p_program_id;
  insert into public.ma_program_departments (program_id, org_version_id, department_id, kind, collaboration_ratio)
  select p_program_id, d.org_version_id, d.department_id, d.kind::public.program_department_kind, d.collaboration_ratio
  from jsonb_to_recordset(p_departments) as d(org_version_id uuid, department_id uuid, kind text, collaboration_ratio int);
  insert into public.ma_program_managers
    (program_id, org_version_id, user_id, department_id, role, allocation_rate, start_date, end_date, assigned_by)
  select
    p_program_id, m.org_version_id, m.user_id, m.department_id, m.role::public.program_manager_role,
    m.allocation_rate, m.start_date, m.end_date, app.current_app_user_id()
  from jsonb_to_recordset(p_managers)
    as m(user_id uuid, org_version_id uuid, department_id uuid, role text, allocation_rate int, start_date date, end_date date);
end;
$$;

grant execute on function public.set_ma_program_staffing(uuid, jsonb, jsonb) to authenticated;

comment on function public.set_ma_program_staffing(uuid, jsonb, jsonb) is
  'M&A 사업 부서+담당자 배치 org 버전(단계)별 독립 검증·원자 교체. set_program_staffing(AC)의 mna 원장 대응.';

-- (11) 모듈 인스턴스 생성/수정 RPC -------------------------------------------
create or replace function public.set_ma_program_module(
  p_program_id         uuid,
  p_module_id          uuid,
  p_module_type        text,
  p_title              text,
  p_status             text,
  p_visibility         text,
  p_participation_mode text,
  p_settings           jsonb,
  p_assignee_user_ids  uuid[]
)
returns uuid
language plpgsql
security definer
set search_path = app, public
as $$
declare
  v_id         uuid := p_module_id;
  v_title      text := nullif(btrim(p_title), '');
  v_mode       text;
  v_ps         date := (p_settings->>'start_date')::date;
  v_pe         date := (p_settings->>'end_date')::date;
  v_prop_start date;
  v_prop_end   date;
  v_op_start   date;
  v_op_end     date;
  v_uid        uuid;
begin
  if not (
    app.is_admin()
    or (app.can_write_workspace('mna') and app.can_access_ws_program('mna', p_program_id))
  ) then
    raise exception '운영 모듈을 변경할 권한이 없습니다.' using errcode = '42501';
  end if;

  if v_id is not null and not exists (
    select 1 from public.ma_program_modules where id = v_id and program_id = p_program_id
  ) then
    raise exception '수정할 모듈 인스턴스를 찾을 수 없습니다.';
  end if;

  v_mode := coalesce(p_participation_mode, case p_module_type
    when 'RECRUITMENT'       then 'OPEN_APPLICATION'
    when 'DOC_REVIEW'        then 'REVIEWER_ASSIGNMENT'
    when 'ONSITE_EVAL'       then 'REVIEWER_ASSIGNMENT'
    when 'DEMO_DAY'          then 'REVIEWER_ASSIGNMENT'
    when 'ORIENTATION'       then 'ADMIN_ONLY'
    when 'OUTCOMES'          then 'ADMIN_ONLY'
    when 'CUSTOM_ACTIVITY'   then 'ADMIN_ONLY'
    when 'MENTORING'         then 'MANUAL_ALLOCATION'
    when 'BUSINESS_MATCHING' then 'STARTUP_FCFS'
  end);

  if v_title is not null and exists (
    select 1 from public.ma_program_modules pm
    where pm.program_id = p_program_id
      and lower(btrim(pm.title)) = lower(v_title)
      and (v_id is null or pm.id <> v_id)
  ) then
    raise exception '이미 같은 이름의 모듈이 있습니다: %', v_title;
  end if;

  if p_module_type = 'OUTCOMES' and v_id is null and exists (
    select 1 from public.ma_program_modules where program_id = p_program_id and module_type = 'OUTCOMES'
  ) then
    raise exception '성과/KPI 모듈은 사업당 1개만 배치할 수 있습니다.';
  end if;

  if v_ps is not null and v_pe is not null then
    if v_ps > v_pe then
      raise exception '종료일은 시작일 이후여야 합니다.';
    end if;
    select proposal_start_date, proposal_end_date, start_date, end_date
      into v_prop_start, v_prop_end, v_op_start, v_op_end
    from public.ma_programs where id = p_program_id;
    if (v_prop_start is not null and v_prop_end is not null)
       or (v_op_start is not null and v_op_end is not null) then
      if not (
        (v_prop_start is not null and v_prop_end is not null and v_ps >= v_prop_start and v_pe <= v_prop_end)
        or (v_op_start is not null and v_op_end is not null and v_ps >= v_op_start and v_pe <= v_op_end)
      ) then
        raise exception '모듈 기간은 제안 기간 또는 운영 기간 내에서만 설정할 수 있습니다.';
      end if;
    end if;
  end if;

  if p_assignee_user_ids is not null then
    foreach v_uid in array p_assignee_user_ids loop
      if not exists (
        select 1 from public.ma_program_managers pm
        where pm.program_id = p_program_id and pm.user_id = v_uid
      ) then
        raise exception '담당자는 사업 담당자 풀에 있는 사용자만 지정할 수 있습니다.' using errcode = '42501';
      end if;
    end loop;
  end if;

  if v_id is null then
    insert into public.ma_program_modules
      (program_id, module_type, title, enabled, status, participation_mode, visibility, settings)
    values (
      p_program_id, p_module_type::public.module_type, v_title, true,
      p_status::public.module_status, v_mode::public.participation_mode,
      p_visibility::public.module_visibility, coalesce(p_settings, '{}'::jsonb)
    )
    returning id into v_id;
  else
    update public.ma_program_modules set
      title              = v_title,
      status             = p_status::public.module_status,
      participation_mode = v_mode::public.participation_mode,
      visibility         = p_visibility::public.module_visibility,
      settings           = coalesce(p_settings, '{}'::jsonb),
      updated_at         = now()
    where id = v_id;
  end if;

  delete from public.ma_program_module_assignees where program_module_id = v_id;
  if p_assignee_user_ids is not null then
    insert into public.ma_program_module_assignees (program_module_id, user_id, assigned_by)
    select v_id, u, app.current_app_user_id()
    from unnest(p_assignee_user_ids) as u
    on conflict (program_module_id, user_id) do nothing;
  end if;

  return v_id;
end;
$$;

grant execute on function public.set_ma_program_module(uuid, uuid, text, text, text, text, text, jsonb, uuid[]) to authenticated;

comment on function public.set_ma_program_module(uuid, uuid, text, text, text, text, text, jsonb, uuid[]) is
  'M&A 운영 모듈 인스턴스 생성/수정 + 담당자 전량 교체(원자). set_program_module(AC)의 mna 원장 대응.';
