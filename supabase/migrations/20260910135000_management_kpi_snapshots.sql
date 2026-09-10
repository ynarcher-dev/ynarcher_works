-- =====================================================================
-- [MANAGEMENT] 조직 버전 결합 KPI 스냅샷
--
-- 소유 워크스페이스: management
-- 데이터 등급: Personal(개인 평가) + Internal(부서 성과)
-- 접근 주체: 내부 임직원(본인/실제 소속 부서 조회), management 관리자(설계/할당/입력)
-- Scope: self + department + global(management 관리자)
-- 감사 대상: 조직/KPI 동시 발행
--
-- 보안 게이트:
-- · public 신규 테이블 전부 RLS 즉시 활성화, anon 권한 없음
-- · SELECT/INSERT/UPDATE 정책 분리, DELETE 정책/권한 없음
-- · 일반 쓰기는 SECURITY INVOKER + 기존 RLS를 통과
-- · RLS 순환 해소용 조회 헬퍼와 동시 발행 코어만 비노출 app 스키마의
--   SECURITY DEFINER로 두고 search_path='' + 호출자 검사를 강제
-- · public RPC는 SECURITY INVOKER 래퍼이며 authenticated만 실행
-- · 발행은 audit_logs에 기록, 파일/Export/service_role 경로 없음
-- =====================================================================

create extension if not exists btree_gist with schema extensions;

-- 같은 조직 버전 안의 중도 부서이동을 기간으로 보존한다. -------------------
alter table public.dept_members
  add column if not exists effective_from date,
  add column if not exists effective_to date;

with version_bounds as (
  select v.id,
         v.effective_from,
         lead(v.effective_from) over (order by v.effective_from, v.created_at) as next_from
    from public.org_versions v
)
update public.dept_members dm
   set effective_from = coalesce(dm.effective_from, vb.effective_from),
       effective_to = coalesce(dm.effective_to, vb.next_from)
  from version_bounds vb
 where vb.id = dm.version_id
   and dm.effective_from is null;

-- 삭제된 과거 버전까지 참조 무결성을 유지한다. 비정상 고아행은 생성일을
-- 최소 경계로 삼아 NOT NULL 전환이 전체 마이그레이션을 막지 않게 한다.
update public.dept_members
   set effective_from = coalesce(effective_from, created_at::date, current_date)
 where effective_from is null;

update public.dept_members
   set effective_to = null
 where effective_to is not null and effective_to <= effective_from;

alter table public.dept_members
  alter column effective_from set not null;

do $$ begin
  alter table public.dept_members
    add constraint dept_members_period_chk
    check (effective_to is null or effective_to > effective_from);
exception when duplicate_object then null; end $$;

drop index if exists public.uq_dept_members_version_user;

do $$ begin
  alter table public.dept_members
    add constraint dept_members_user_period_no_overlap
    exclude using gist (
      version_id with =,
      user_id with =,
      daterange(effective_from, effective_to, '[)') with &&
    ) where (deleted_at is null);
exception when duplicate_object then null; end $$;

create index if not exists idx_dept_members_version_period
  on public.dept_members (version_id, effective_from, effective_to)
  where deleted_at is null;

-- KPI 스냅샷 --------------------------------------------------------------
create table if not exists public.kpi_versions (
  id                uuid primary key default gen_random_uuid(),
  org_version_id    uuid not null unique references public.org_versions(id),
  source_version_id uuid references public.kpi_versions(id),
  label             text not null,
  status            text not null default 'DRAFT',
  published_at      timestamptz,
  published_by      uuid references public.users(id),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  deleted_at        timestamptz,
  constraint kpi_versions_status_chk check (status in ('DRAFT','PUBLISHED','CLOSED'))
);

-- 재사용 가능한 '구성만'의 원형. 발행 스냅샷을 직접 지배하지 않는다. -------
create table if not exists public.kpi_blueprints (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  scope_type  text not null,
  description text,
  is_active   boolean not null default true,
  created_by  uuid references public.users(id),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz,
  constraint kpi_blueprints_scope_chk check (scope_type in ('DEPARTMENT','PERSON'))
);

create table if not exists public.kpi_blueprint_items (
  id            uuid primary key default gen_random_uuid(),
  blueprint_id  uuid not null references public.kpi_blueprints(id),
  section_key   text not null,
  slot_key      text not null,
  input_type    text not null default 'NUMBER',
  target_mode   text not null default 'ABSOLUTE',
  rule_type     text not null default 'BAND',
  sort_order    integer not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz,
  constraint kpi_blueprint_items_input_chk check (input_type in ('NUMBER','GRADE','MULTI_COUNT')),
  constraint kpi_blueprint_items_target_chk check (target_mode in ('TARGET_RATE','ABSOLUTE','NONE')),
  constraint kpi_blueprint_items_rule_chk check (rule_type in ('BAND','PER_UNIT_CAP','GRADE_MAP'))
);

-- 버전별로 실제 내용을 채운 KPI 템플릿. -----------------------------------
create table if not exists public.kpi_templates (
  id                  uuid primary key default gen_random_uuid(),
  kpi_version_id      uuid not null references public.kpi_versions(id),
  source_template_id  uuid references public.kpi_templates(id),
  source_blueprint_id uuid references public.kpi_blueprints(id),
  name                text not null,
  scope_type          text not null,
  role_hint           text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  deleted_at          timestamptz,
  constraint kpi_templates_scope_chk check (scope_type in ('DEPARTMENT','PERSON'))
);
create index if not exists idx_kpi_templates_version
  on public.kpi_templates (kpi_version_id) where deleted_at is null;

create table if not exists public.kpi_template_items (
  id                uuid primary key default gen_random_uuid(),
  template_id       uuid not null references public.kpi_templates(id),
  source_item_id    uuid references public.kpi_template_items(id),
  section_label     text not null default '기본',
  metric_code       text not null,
  metric_name       text not null,
  description       text,
  criteria_text     text,
  unit              text,
  input_type        text not null default 'NUMBER',
  target_mode       text not null default 'ABSOLUTE',
  rule_type         text not null default 'BAND',
  rule_params       jsonb not null default '{"bands":[]}'::jsonb,
  default_target    numeric,
  max_score         numeric,
  evidence_required boolean not null default true,
  sort_order        integer not null default 0,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  deleted_at        timestamptz,
  constraint kpi_template_items_input_chk check (input_type in ('NUMBER','GRADE','MULTI_COUNT')),
  constraint kpi_template_items_target_chk check (target_mode in ('TARGET_RATE','ABSOLUTE','NONE')),
  constraint kpi_template_items_rule_chk check (rule_type in ('BAND','PER_UNIT_CAP','GRADE_MAP')),
  constraint kpi_template_items_target_value_chk check (
    target_mode <> 'TARGET_RATE' or (default_target is not null and default_target > 0)
  ),
  unique (template_id, metric_code)
);
create index if not exists idx_kpi_template_items_template
  on public.kpi_template_items (template_id, sort_order) where deleted_at is null;

-- 대상 할당. 부서는 시점 department_id, 개인은 user_id에 직접 귀속한다. -----
create table if not exists public.kpi_assignments (
  id                uuid primary key default gen_random_uuid(),
  kpi_version_id    uuid not null references public.kpi_versions(id),
  template_id       uuid not null references public.kpi_templates(id),
  subject_type      text not null,
  department_id     uuid references public.departments(id),
  user_id           uuid references public.users(id),
  assignment_kind   text not null default 'PRIMARY',
  target_overrides  jsonb not null default '{}'::jsonb,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  deleted_at        timestamptz,
  constraint kpi_assignments_subject_chk check (
    (subject_type = 'DEPARTMENT' and department_id is not null and user_id is null)
    or (subject_type = 'PERSON' and user_id is not null and department_id is null)
  ),
  constraint kpi_assignments_kind_chk check (assignment_kind in ('PRIMARY','SUPPLEMENTAL'))
);
create unique index if not exists uq_kpi_assignment_department_primary
  on public.kpi_assignments (kpi_version_id, department_id)
  where deleted_at is null and subject_type = 'DEPARTMENT' and assignment_kind = 'PRIMARY';
create unique index if not exists uq_kpi_assignment_person_primary
  on public.kpi_assignments (kpi_version_id, user_id)
  where deleted_at is null and subject_type = 'PERSON' and assignment_kind = 'PRIMARY';
create index if not exists idx_kpi_assignments_template
  on public.kpi_assignments (template_id) where deleted_at is null;

-- 실적은 개정행만 추가한다. ------------------------------------------------
create table if not exists public.kpi_actual_revisions (
  id                uuid primary key default gen_random_uuid(),
  assignment_id     uuid not null references public.kpi_assignments(id),
  template_item_id  uuid not null references public.kpi_template_items(id),
  actual_value      numeric,
  qualitative_value text,
  actual_payload    jsonb,
  evidence_ref      text,
  revision_no       integer not null,
  computed_score    numeric,
  entered_by        uuid not null references public.users(id),
  entered_at        timestamptz not null default now(),
  constraint kpi_actual_value_chk check (
    actual_value is not null or qualitative_value is not null or actual_payload is not null
  ),
  unique (assignment_id, template_item_id, revision_no)
);
create index if not exists idx_kpi_actual_latest
  on public.kpi_actual_revisions (assignment_id, template_item_id, revision_no desc);

create table if not exists public.kpi_results (
  id                    uuid primary key default gen_random_uuid(),
  assignment_id         uuid not null unique references public.kpi_assignments(id),
  calculated_score      numeric not null default 0,
  completed_items       integer not null default 0,
  total_items           integer not null default 0,
  rank                  integer,
  grade                 text,
  payout_rate           numeric,
  calculation_snapshot  jsonb not null default '[]'::jsonb,
  calculated_at         timestamptz not null default now(),
  locked_at             timestamptz,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  deleted_at            timestamptz
);

-- 현재 설치 시점에 이미 존재하는 조직 버전에도 편집 가능한 KPI 초안을 붙인다.
insert into public.kpi_versions (org_version_id, label, status)
select v.id, v.label || ' KPI', 'DRAFT'
  from public.org_versions v
 where v.deleted_at is null
   and not exists (select 1 from public.kpi_versions kv where kv.org_version_id = v.id)
on conflict (org_version_id) do nothing;

-- 점수 엔진 ----------------------------------------------------------------
create or replace function app.kpi_score(
  p_rule_type text,
  p_rule_params jsonb,
  p_target_mode text,
  p_target numeric,
  p_actual numeric,
  p_qualitative text,
  p_payload jsonb
)
returns numeric
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_input numeric;
  v_score numeric;
  v_band jsonb;
  v_unit jsonb;
  v_min numeric;
  v_max numeric;
  v_count numeric;
  v_cap numeric;
  v_clamp_min numeric;
  v_clamp_max numeric;
  v_open jsonb;
begin
  if p_rule_type = 'GRADE_MAP' then
    if p_qualitative is null then return null; end if;
    select (g->>'score')::numeric into v_score
      from jsonb_array_elements(coalesce(p_rule_params->'grades', '[]'::jsonb)) g
     where upper(g->>'grade') = upper(p_qualitative)
     limit 1;
  elsif p_rule_type = 'PER_UNIT_CAP' then
    if p_payload is null then return null; end if;
    v_score := 0;
    for v_unit in
      select value from jsonb_array_elements(coalesce(p_rule_params->'per_unit', '[]'::jsonb))
    loop
      v_count := coalesce(nullif(p_payload->>(v_unit->>'key'), '')::numeric, 0);
      v_score := v_score + v_count * coalesce((v_unit->>'score')::numeric, 0);
    end loop;
    v_cap := nullif(p_rule_params->>'cap', '')::numeric;
    if v_cap is not null then v_score := least(v_score, v_cap); end if;
  else
    if p_actual is null then return null; end if;
    if p_target_mode = 'TARGET_RATE' then
      if p_target is null or p_target = 0 then return null; end if;
      v_input := p_actual / p_target * 100;
    else
      v_input := p_actual;
    end if;

    for v_band in
      select value from jsonb_array_elements(coalesce(p_rule_params->'bands', '[]'::jsonb))
    loop
      v_min := nullif(v_band->>'min', '')::numeric;
      v_max := nullif(v_band->>'max', '')::numeric;
      if (v_min is null or v_input >= v_min)
         and (v_max is null or v_input < v_max) then
        v_score := (v_band->>'score')::numeric;
        exit;
      end if;
    end loop;

    v_open := p_rule_params->'open_top';
    if v_open is not null
       and v_input >= coalesce(nullif(v_open->>'from', '')::numeric, 0)
       and coalesce(nullif(v_open->>'step', '')::numeric, 0) > 0 then
      v_score := coalesce(nullif(v_open->>'base_score', '')::numeric, v_score, 0)
        + floor((v_input - (v_open->>'from')::numeric) / (v_open->>'step')::numeric)
          * coalesce(nullif(v_open->>'score', '')::numeric, 0);
    end if;
  end if;

  if v_score is null then return null; end if;
  v_clamp_min := nullif(p_rule_params->'clamp'->>'min', '')::numeric;
  v_clamp_max := nullif(p_rule_params->'clamp'->>'max', '')::numeric;
  if v_clamp_min is not null then v_score := greatest(v_score, v_clamp_min); end if;
  if v_clamp_max is not null then v_score := least(v_score, v_clamp_max); end if;
  return v_score;
end $$;

-- RLS 정책이 서로를 재귀 조회하지 않도록 비노출 app 스키마에서 가시성을 판정한다.
create or replace function app.can_read_kpi_assignment(p_assignment_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    app.can_read_workspace('management')
    or exists (
      select 1
        from public.kpi_assignments a
       where a.id = p_assignment_id
         and a.deleted_at is null
         and (
           (a.subject_type = 'PERSON' and a.user_id = app.current_app_user_id())
           or (
             a.subject_type = 'DEPARTMENT'
             and exists (
               select 1
                 from public.dept_members dm
                where dm.version_id = (
                        select kv.org_version_id from public.kpi_versions kv
                         where kv.id = a.kpi_version_id and kv.deleted_at is null
                      )
                  and dm.department_id = a.department_id
                  and dm.user_id = app.current_app_user_id()
                  and dm.deleted_at is null
                  and dm.effective_from <= current_date
                  and (dm.effective_to is null or current_date < dm.effective_to)
             )
           )
         )
    )
$$;

create or replace function app.can_read_kpi_template(p_template_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    app.can_read_workspace('management')
    or exists (
      select 1
        from public.kpi_assignments a
       where a.template_id = p_template_id
         and a.deleted_at is null
         and app.can_read_kpi_assignment(a.id)
    )
$$;

revoke all on function app.can_read_kpi_assignment(uuid) from public, anon;
revoke all on function app.can_read_kpi_template(uuid) from public, anon;
grant execute on function app.can_read_kpi_assignment(uuid) to authenticated;
grant execute on function app.can_read_kpi_template(uuid) to authenticated;

-- 변경 감사 ----------------------------------------------------------------
create or replace function app.audit_kpi_definition_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.audit_logs
    (actor_user_id, action, changed_workspace, before_data, after_data, reason)
  values (
    app.current_app_user_id(), 'KPI_' || tg_op, 'management',
    case when tg_op = 'UPDATE' then to_jsonb(old) end,
    to_jsonb(new), tg_table_name
  );
  return new;
end $$;

do $$
declare v_table text;
begin
  foreach v_table in array array['kpi_templates','kpi_template_items','kpi_assignments'] loop
    execute format('drop trigger if exists trg_%s_audit on public.%I', v_table, v_table);
    execute format(
      'create trigger trg_%s_audit after insert or update on public.%I for each row execute function app.audit_kpi_definition_change()',
      v_table, v_table
    );
  end loop;
end $$;

-- RLS와 Data API 명시적 권한 ----------------------------------------------
do $$
declare v_table text;
begin
  foreach v_table in array array[
    'kpi_versions','kpi_blueprints','kpi_blueprint_items','kpi_templates',
    'kpi_template_items','kpi_assignments','kpi_actual_revisions','kpi_results'
  ] loop
    execute format('alter table public.%I enable row level security', v_table);
    execute format('revoke all on table public.%I from anon, authenticated', v_table);
  end loop;
end $$;

grant select, insert, update on table
  public.kpi_versions,
  public.kpi_blueprints,
  public.kpi_blueprint_items,
  public.kpi_templates,
  public.kpi_template_items,
  public.kpi_assignments
to authenticated;
grant select, insert on table public.kpi_actual_revisions to authenticated;
grant select on table public.kpi_results to authenticated;

drop policy if exists kpi_versions_select on public.kpi_versions;
create policy kpi_versions_select on public.kpi_versions for select to authenticated
using (
  app.can_read_workspace('management')
  or (
    app.current_app_user_id() is not null
    and app.current_app_role() not in ('external_startup','external_expert','temporary_guest')
    and status in ('PUBLISHED','CLOSED')
  )
);
drop policy if exists kpi_versions_insert on public.kpi_versions;
create policy kpi_versions_insert on public.kpi_versions for insert to authenticated
with check (app.is_admin() or app.can_write_workspace('management'));
drop policy if exists kpi_versions_update on public.kpi_versions;
create policy kpi_versions_update on public.kpi_versions for update to authenticated
using (app.is_admin() or app.can_write_workspace('management'))
with check (app.is_admin() or app.can_write_workspace('management'));

drop policy if exists kpi_blueprints_select on public.kpi_blueprints;
create policy kpi_blueprints_select on public.kpi_blueprints for select to authenticated
using (app.can_read_workspace('management'));
drop policy if exists kpi_blueprints_insert on public.kpi_blueprints;
create policy kpi_blueprints_insert on public.kpi_blueprints for insert to authenticated
with check (app.is_admin() or app.can_write_workspace('management'));
drop policy if exists kpi_blueprints_update on public.kpi_blueprints;
create policy kpi_blueprints_update on public.kpi_blueprints for update to authenticated
using (app.is_admin() or app.can_write_workspace('management'))
with check (app.is_admin() or app.can_write_workspace('management'));

drop policy if exists kpi_blueprint_items_select on public.kpi_blueprint_items;
create policy kpi_blueprint_items_select on public.kpi_blueprint_items for select to authenticated
using (app.can_read_workspace('management'));
drop policy if exists kpi_blueprint_items_insert on public.kpi_blueprint_items;
create policy kpi_blueprint_items_insert on public.kpi_blueprint_items for insert to authenticated
with check (app.is_admin() or app.can_write_workspace('management'));
drop policy if exists kpi_blueprint_items_update on public.kpi_blueprint_items;
create policy kpi_blueprint_items_update on public.kpi_blueprint_items for update to authenticated
using (app.is_admin() or app.can_write_workspace('management'))
with check (app.is_admin() or app.can_write_workspace('management'));

drop policy if exists kpi_templates_select on public.kpi_templates;
create policy kpi_templates_select on public.kpi_templates for select to authenticated
using (app.can_read_kpi_template(id));
drop policy if exists kpi_templates_insert on public.kpi_templates;
create policy kpi_templates_insert on public.kpi_templates for insert to authenticated
with check (app.is_admin() or app.can_write_workspace('management'));
drop policy if exists kpi_templates_update on public.kpi_templates;
create policy kpi_templates_update on public.kpi_templates for update to authenticated
using (app.is_admin() or app.can_write_workspace('management'))
with check (app.is_admin() or app.can_write_workspace('management'));

drop policy if exists kpi_template_items_select on public.kpi_template_items;
create policy kpi_template_items_select on public.kpi_template_items for select to authenticated
using (app.can_read_kpi_template(template_id));
drop policy if exists kpi_template_items_insert on public.kpi_template_items;
create policy kpi_template_items_insert on public.kpi_template_items for insert to authenticated
with check (app.is_admin() or app.can_write_workspace('management'));
drop policy if exists kpi_template_items_update on public.kpi_template_items;
create policy kpi_template_items_update on public.kpi_template_items for update to authenticated
using (app.is_admin() or app.can_write_workspace('management'))
with check (app.is_admin() or app.can_write_workspace('management'));

drop policy if exists kpi_assignments_select on public.kpi_assignments;
create policy kpi_assignments_select on public.kpi_assignments for select to authenticated
using (app.can_read_kpi_assignment(id));
drop policy if exists kpi_assignments_insert on public.kpi_assignments;
create policy kpi_assignments_insert on public.kpi_assignments for insert to authenticated
with check (app.is_admin() or app.can_write_workspace('management'));
drop policy if exists kpi_assignments_update on public.kpi_assignments;
create policy kpi_assignments_update on public.kpi_assignments for update to authenticated
using (app.is_admin() or app.can_write_workspace('management'))
with check (app.is_admin() or app.can_write_workspace('management'));

drop policy if exists kpi_actual_revisions_select on public.kpi_actual_revisions;
create policy kpi_actual_revisions_select on public.kpi_actual_revisions for select to authenticated
using (app.can_read_kpi_assignment(assignment_id));
drop policy if exists kpi_actual_revisions_insert on public.kpi_actual_revisions;
create policy kpi_actual_revisions_insert on public.kpi_actual_revisions for insert to authenticated
with check (app.is_admin() or app.can_write_workspace('management'));

drop policy if exists kpi_results_select on public.kpi_results;
create policy kpi_results_select on public.kpi_results for select to authenticated
using (app.can_read_kpi_assignment(assignment_id));

-- OFFICE 대시보드: 호출자 본인과 기준일 소속 부서의 KPI만 반환한다. ---------
create or replace function public.my_kpi_dashboard(p_as_of date default current_date)
returns table (
  scope_type text,
  assignment_id uuid,
  template_name text,
  subject_name text,
  item_id uuid,
  metric_code text,
  metric_name text,
  description text,
  criteria_text text,
  unit text,
  target_mode text,
  rule_type text,
  rule_params jsonb,
  target_value numeric,
  actual_value numeric,
  qualitative_value text,
  actual_payload jsonb,
  computed_score numeric,
  evidence_ref text,
  max_score numeric,
  total_score numeric,
  completed_items integer,
  total_items integer,
  rank integer,
  grade text,
  payout_rate numeric,
  kpi_version_label text,
  org_version_label text,
  effective_from date,
  effective_to date,
  membership_from date
)
language sql
stable
security invoker
set search_path = ''
as $$
  with selected_org as (
    select ov.* from public.org_versions ov
     where ov.status = 'PUBLISHED' and ov.deleted_at is null and ov.effective_from <= p_as_of
     order by ov.effective_from desc, ov.created_at desc limit 1
  ), selected_version as (
    select kv.*, ov.label as org_label, ov.effective_from as org_from, ov.effective_to as org_to
      from public.kpi_versions kv join selected_org ov on ov.id = kv.org_version_id
     where kv.status in ('PUBLISHED','CLOSED') and kv.deleted_at is null
  ), membership as (
    select dm.department_id, dm.effective_from
      from public.dept_members dm join selected_version sv on sv.org_version_id = dm.version_id
     where dm.user_id = app.current_app_user_id() and dm.deleted_at is null
       and dm.effective_from <= p_as_of and (dm.effective_to is null or p_as_of < dm.effective_to)
     order by dm.effective_from desc limit 1
  )
  select a.subject_type, a.id, t.name,
         case when a.subject_type = 'PERSON' then u.name else d.name end,
         i.id, i.metric_code, i.metric_name, i.description, i.criteria_text, i.unit,
         i.target_mode, i.rule_type, i.rule_params,
         coalesce(nullif(a.target_overrides->>i.metric_code, '')::numeric, i.default_target),
         latest.actual_value, latest.qualitative_value, latest.actual_payload,
         latest.computed_score, latest.evidence_ref, i.max_score,
         r.calculated_score, r.completed_items, r.total_items, r.rank, r.grade, r.payout_rate,
         sv.label, sv.org_label, sv.org_from, sv.org_to, m.effective_from
    from selected_version sv
    left join membership m on true
    join public.kpi_assignments a on a.kpi_version_id = sv.id and a.deleted_at is null
      and (
        (a.subject_type = 'PERSON' and a.user_id = app.current_app_user_id())
        or (a.subject_type = 'DEPARTMENT' and a.department_id = m.department_id)
      )
    join public.kpi_templates t on t.id = a.template_id and t.deleted_at is null
    join public.kpi_template_items i on i.template_id = t.id and i.deleted_at is null
    left join public.users u on u.id = a.user_id
    left join public.departments d on d.id = a.department_id
    left join lateral (
      select ar.* from public.kpi_actual_revisions ar
       where ar.assignment_id = a.id and ar.template_item_id = i.id
       order by ar.revision_no desc limit 1
    ) latest on true
    left join public.kpi_results r on r.assignment_id = a.id and r.deleted_at is null
   order by case when a.subject_type = 'PERSON' then 0 else 1 end, t.name, i.sort_order
$$;

revoke all on function public.my_kpi_dashboard(date) from public, anon;
grant execute on function public.my_kpi_dashboard(date) to authenticated;

-- 기간형 인력 배치 변경 ----------------------------------------------------
create or replace function public.set_department_membership(
  p_version_id uuid,
  p_user_id uuid,
  p_department_id uuid,
  p_effective_from date default null
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_from date;
  v_version public.org_versions%rowtype;
  v_member_id uuid;
begin
  if not (app.is_admin() or app.can_write_workspace('management')) then
    raise exception '인력 배치를 변경할 권한이 없습니다.' using errcode = '42501';
  end if;
  select * into v_version from public.org_versions
   where id = p_version_id and deleted_at is null;
  if v_version.id is null then raise exception '조직 버전을 찾을 수 없습니다.' using errcode = 'P0002'; end if;
  if p_department_id is not null and not exists (
    select 1 from public.departments d
     where d.id = p_department_id and d.version_id = p_version_id and d.deleted_at is null
  ) then
    raise exception '선택한 조직 버전의 부서가 아닙니다.' using errcode = '23514';
  end if;

  v_from := coalesce(
    p_effective_from,
    case when v_version.status = 'DRAFT' or v_version.effective_from > current_date
      then v_version.effective_from else current_date end
  );
  if v_from < v_version.effective_from then
    raise exception '배치 시작일은 조직 버전 시작일보다 빠를 수 없습니다.' using errcode = '22007';
  end if;

  -- 같은 날 시작한 배치는 닫을 구간이 없으므로 soft delete하고, 이전부터 이어진 배치만 닫는다.
  update public.dept_members
     set deleted_at = now()
   where version_id = p_version_id and user_id = p_user_id and deleted_at is null
     and effective_from = v_from
     and (effective_to is null or effective_to > v_from);
  update public.dept_members
     set effective_to = v_from
   where version_id = p_version_id and user_id = p_user_id and deleted_at is null
     and effective_from < v_from
     and (effective_to is null or effective_to > v_from);

  if p_department_id is not null then
    insert into public.dept_members
      (version_id, department_id, user_id, effective_from, effective_to)
    values
      (p_version_id, p_department_id, p_user_id, v_from, v_version.effective_to)
    returning id into v_member_id;
  end if;

  if p_version_id = public.current_org_version_id() then
    update public.users set department_id = p_department_id where id = p_user_id;
  end if;
  return v_member_id;
end $$;

revoke all on function public.set_department_membership(uuid, uuid, uuid, date) from public, anon;
grant execute on function public.set_department_membership(uuid, uuid, uuid, date) to authenticated;

-- KPI 편집 RPC ------------------------------------------------------------
create or replace function public.set_kpi_primary_assignment(
  p_kpi_version_id uuid,
  p_template_id uuid,
  p_subject_type text,
  p_subject_id uuid,
  p_target_overrides jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if not (app.is_admin() or app.can_write_workspace('management')) then
    raise exception 'KPI를 할당할 권한이 없습니다.' using errcode = '42501';
  end if;
  if p_subject_type not in ('DEPARTMENT','PERSON') then
    raise exception '올바르지 않은 KPI 대상 종류입니다.' using errcode = '22023';
  end if;

  update public.kpi_assignments
     set deleted_at = now()
   where kpi_version_id = p_kpi_version_id
     and subject_type = p_subject_type
     and assignment_kind = 'PRIMARY'
     and deleted_at is null
     and ((p_subject_type = 'DEPARTMENT' and department_id = p_subject_id)
       or (p_subject_type = 'PERSON' and user_id = p_subject_id));

  if p_template_id is null then return null; end if;
  insert into public.kpi_assignments
    (kpi_version_id, template_id, subject_type, department_id, user_id, assignment_kind, target_overrides)
  values (
    p_kpi_version_id, p_template_id, p_subject_type,
    case when p_subject_type = 'DEPARTMENT' then p_subject_id end,
    case when p_subject_type = 'PERSON' then p_subject_id end,
    'PRIMARY', coalesce(p_target_overrides, '{}'::jsonb)
  ) returning id into v_id;
  return v_id;
end $$;

revoke all on function public.set_kpi_primary_assignment(uuid, uuid, text, uuid, jsonb) from public, anon;
grant execute on function public.set_kpi_primary_assignment(uuid, uuid, text, uuid, jsonb) to authenticated;

create or replace function public.save_kpi_actual(
  p_assignment_id uuid,
  p_template_item_id uuid,
  p_actual_value numeric default null,
  p_qualitative_value text default null,
  p_actual_payload jsonb default null,
  p_evidence_ref text default null
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare v_id uuid;
begin
  insert into public.kpi_actual_revisions
    (assignment_id, template_item_id, actual_value, qualitative_value, actual_payload,
     evidence_ref, revision_no, entered_by)
  values
    (p_assignment_id, p_template_item_id, p_actual_value, nullif(btrim(p_qualitative_value), ''),
     p_actual_payload, nullif(btrim(p_evidence_ref), ''), 0, app.current_app_user_id())
  returning id into v_id;
  return v_id;
end $$;

revoke all on function public.save_kpi_actual(uuid, uuid, numeric, text, jsonb, text) from public, anon;
grant execute on function public.save_kpi_actual(uuid, uuid, numeric, text, jsonb, text) to authenticated;

-- 조직 초안 복제와 함께 KPI 초안도 독립 복제한다. --------------------------
create or replace function app.clone_org_version_with_kpi(
  p_src_version uuid,
  p_label text,
  p_from date,
  p_to date
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_new uuid;
  v_src_kpi uuid;
  v_new_kpi uuid;
begin
  if not (app.is_admin() or app.can_write_workspace('management')) then
    raise exception '조직 버전을 생성할 권한이 없습니다.' using errcode = '42501';
  end if;
  if btrim(coalesce(p_label, '')) = '' or p_from is null then
    raise exception '버전 이름과 시작일을 입력하세요.' using errcode = '22023';
  end if;
  if p_to is not null and p_to <= p_from then
    raise exception '종료일은 시작일보다 뒤여야 합니다.' using errcode = '22007';
  end if;

  insert into public.org_versions (label, effective_from, effective_to, status)
  values (btrim(p_label), p_from, p_to, 'DRAFT') returning id into v_new;

  insert into public.org_levels (name, sort_order, version_id, lineage_id)
  select l.name, l.sort_order, v_new, l.lineage_id
    from public.org_levels l
   where l.version_id = p_src_version and l.deleted_at is null;

  insert into public.departments
    (name, parent_id, level_id, sort_order, version_id, lineage_id, hr_hidden)
  select s.name, null, nl.id, s.sort_order, v_new, s.lineage_id, s.hr_hidden
    from public.departments s
    left join public.org_levels sl on sl.id = s.level_id
    left join public.org_levels nl
      on nl.version_id = v_new and nl.lineage_id = sl.lineage_id and nl.deleted_at is null
   where s.version_id = p_src_version and s.deleted_at is null;

  update public.departments c
     set parent_id = np.id
    from public.departments s_child
    join public.departments s_parent on s_parent.id = s_child.parent_id
    join public.departments np on np.version_id = v_new and np.lineage_id = s_parent.lineage_id
   where c.version_id = v_new and c.lineage_id = s_child.lineage_id
     and s_child.version_id = p_src_version;

  insert into public.dept_members
    (version_id, department_id, user_id, effective_from, effective_to)
  select v_new, np.id, latest.user_id, p_from, p_to
    from (
      select distinct on (m.user_id) m.user_id, m.department_id
        from public.dept_members m
       where m.version_id = p_src_version and m.deleted_at is null
       order by m.user_id, m.effective_from desc
    ) latest
    join public.departments sd on sd.id = latest.department_id
    join public.departments np on np.version_id = v_new and np.lineage_id = sd.lineage_id;

  select kv.id into v_src_kpi from public.kpi_versions kv
   where kv.org_version_id = p_src_version and kv.deleted_at is null limit 1;
  insert into public.kpi_versions (org_version_id, source_version_id, label, status)
  values (v_new, v_src_kpi, btrim(p_label) || ' KPI', 'DRAFT') returning id into v_new_kpi;

  if v_src_kpi is not null then
    insert into public.kpi_templates
      (kpi_version_id, source_template_id, source_blueprint_id, name, scope_type, role_hint)
    select v_new_kpi, t.id, t.source_blueprint_id, t.name, t.scope_type, t.role_hint
      from public.kpi_templates t
     where t.kpi_version_id = v_src_kpi and t.deleted_at is null;

    insert into public.kpi_template_items
      (template_id, source_item_id, section_label, metric_code, metric_name, description,
       criteria_text, unit, input_type, target_mode, rule_type, rule_params,
       default_target, max_score, evidence_required, sort_order)
    select nt.id, i.id, i.section_label, i.metric_code, i.metric_name, i.description,
           i.criteria_text, i.unit, i.input_type, i.target_mode, i.rule_type, i.rule_params,
           i.default_target, i.max_score, i.evidence_required, i.sort_order
      from public.kpi_template_items i
      join public.kpi_templates nt
        on nt.kpi_version_id = v_new_kpi and nt.source_template_id = i.template_id
     where i.deleted_at is null;

    insert into public.kpi_assignments
      (kpi_version_id, template_id, subject_type, department_id, user_id,
       assignment_kind, target_overrides)
    select v_new_kpi, nt.id, a.subject_type,
           case when a.subject_type = 'DEPARTMENT' then np.id end,
           case when a.subject_type = 'PERSON' then a.user_id end,
           a.assignment_kind, a.target_overrides
      from public.kpi_assignments a
      join public.kpi_templates nt
        on nt.kpi_version_id = v_new_kpi and nt.source_template_id = a.template_id
      left join public.departments sd on sd.id = a.department_id
      left join public.departments np
        on np.version_id = v_new and np.lineage_id = sd.lineage_id and np.deleted_at is null
     where a.kpi_version_id = v_src_kpi and a.deleted_at is null
       and (a.subject_type = 'PERSON' or np.id is not null);
  end if;
  return v_new;
end $$;

revoke all on function app.clone_org_version_with_kpi(uuid, text, date, date) from public, anon;
grant execute on function app.clone_org_version_with_kpi(uuid, text, date, date) to authenticated;

create or replace function public.clone_org_version(
  p_src_version uuid,
  p_label text,
  p_from date,
  p_to date
)
returns uuid
language sql
security invoker
set search_path = ''
as $$
  select app.clone_org_version_with_kpi(p_src_version, p_label, p_from, p_to)
$$;
revoke all on function public.clone_org_version(uuid, text, date, date) from public, anon;
grant execute on function public.clone_org_version(uuid, text, date, date) to authenticated;

-- 조직/KPI 동시 발행. 기존 조직의 최초 KPI 도입만 bootstrap 예외로 허용한다. --
create or replace function app.publish_org_and_kpi_version(p_org_version_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org public.org_versions%rowtype;
  v_kpi public.kpi_versions%rowtype;
  v_missing_departments integer;
  v_missing_people integer;
  v_empty_templates integer;
  v_published_count integer;
begin
  if not (app.is_admin() or app.can_write_workspace('management')) then
    raise exception '조직과 KPI를 발행할 권한이 없습니다.' using errcode = '42501';
  end if;
  select * into v_org from public.org_versions
   where id = p_org_version_id and deleted_at is null for update;
  select * into v_kpi from public.kpi_versions
   where org_version_id = p_org_version_id and deleted_at is null for update;
  if v_org.id is null or v_kpi.id is null then
    raise exception '조직 또는 KPI 초안을 찾을 수 없습니다.' using errcode = 'P0002';
  end if;
  if v_kpi.status <> 'DRAFT' then
    raise exception 'KPI 초안만 발행할 수 있습니다.' using errcode = '55000';
  end if;

  select count(*) into v_empty_templates
    from public.kpi_templates t
   where t.kpi_version_id = v_kpi.id and t.deleted_at is null
     and not exists (
       select 1 from public.kpi_template_items i
        where i.template_id = t.id and i.deleted_at is null
     );
  if v_empty_templates > 0 then
    raise exception '항목이 없는 KPI 템플릿이 %개 있습니다.', v_empty_templates using errcode = '23514';
  end if;

  if not exists (
    select 1 from public.kpi_templates t
     where t.kpi_version_id = v_kpi.id and t.scope_type = 'DEPARTMENT' and t.deleted_at is null
  ) or not exists (
    select 1 from public.kpi_templates t
     where t.kpi_version_id = v_kpi.id and t.scope_type = 'PERSON' and t.deleted_at is null
  ) then
    raise exception '부서용과 개인용 KPI 템플릿을 각각 하나 이상 만들어야 합니다.' using errcode = '23514';
  end if;

  select count(*) into v_missing_departments
    from public.departments d
   where d.version_id = p_org_version_id and d.deleted_at is null
     and exists (
       select 1 from public.dept_members dm
        where dm.version_id = p_org_version_id and dm.department_id = d.id and dm.deleted_at is null
     )
     and not exists (
       select 1 from public.kpi_assignments a
        where a.kpi_version_id = v_kpi.id and a.subject_type = 'DEPARTMENT'
          and a.department_id = d.id and a.assignment_kind = 'PRIMARY' and a.deleted_at is null
     );

  select count(*) into v_missing_people
    from (
      select distinct dm.user_id from public.dept_members dm
       where dm.version_id = p_org_version_id and dm.deleted_at is null
    ) people
   where not exists (
     select 1 from public.kpi_assignments a
      where a.kpi_version_id = v_kpi.id and a.subject_type = 'PERSON'
        and a.user_id = people.user_id and a.assignment_kind = 'PRIMARY' and a.deleted_at is null
   );

  if v_missing_departments > 0 or v_missing_people > 0 then
    raise exception 'KPI 미할당 대상이 있습니다. 부서 %개, 임직원 %명',
      v_missing_departments, v_missing_people using errcode = '23514';
  end if;

  select count(*) into v_published_count from public.kpi_versions
   where status in ('PUBLISHED','CLOSED') and deleted_at is null;
  if v_org.status = 'PUBLISHED' and v_published_count > 0 then
    raise exception '이미 발행된 조직에는 새 조직개편을 통해서만 KPI를 교체할 수 있습니다.' using errcode = '55000';
  elsif v_org.status not in ('DRAFT','PUBLISHED') then
    raise exception '발행할 수 없는 조직 상태입니다.' using errcode = '55000';
  end if;

  perform set_config('app.kpi_publish_context', 'true', true);
  if v_org.status = 'DRAFT' then
    update public.org_versions
       set effective_to = v_org.effective_from
     where id = (
       select prior.id from public.org_versions prior
        where prior.status = 'PUBLISHED' and prior.deleted_at is null
          and prior.effective_from < v_org.effective_from
        order by prior.effective_from desc, prior.created_at desc limit 1
     );
    update public.org_versions set status = 'PUBLISHED' where id = v_org.id;
  end if;
  update public.kpi_versions
     set status = 'PUBLISHED', published_at = now(), published_by = app.current_app_user_id()
   where id = v_kpi.id;

  insert into public.audit_logs
    (actor_user_id, action, changed_workspace, after_data, reason)
  values (
    app.current_app_user_id(), 'KPI_VERSION_PUBLISH', 'management',
    jsonb_build_object('org_version_id', v_org.id, 'kpi_version_id', v_kpi.id,
                       'effective_from', v_org.effective_from),
    '조직·KPI 스냅샷 동시 발행'
  );
  return v_kpi.id;
end $$;

revoke all on function app.publish_org_and_kpi_version(uuid) from public, anon;
grant execute on function app.publish_org_and_kpi_version(uuid) to authenticated;

create or replace function public.publish_org_and_kpi_version(p_org_version_id uuid)
returns uuid
language sql
security invoker
set search_path = ''
as $$ select app.publish_org_and_kpi_version(p_org_version_id) $$;
revoke all on function public.publish_org_and_kpi_version(uuid) from public, anon;
grant execute on function public.publish_org_and_kpi_version(uuid) to authenticated;

-- 발행된 정의를 직접 고치거나 서로 다른 버전/스코프를 엮지 못하게 한다. ----
create or replace function app.guard_kpi_definition()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_version uuid;
  v_status text;
  v_scope text;
  v_template_version uuid;
  v_department_version uuid;
begin
  if tg_table_name = 'kpi_templates' then
    v_version := new.kpi_version_id;
  elsif tg_table_name = 'kpi_template_items' then
    select t.kpi_version_id into v_version
      from public.kpi_templates t where t.id = new.template_id;
  elsif tg_table_name = 'kpi_assignments' then
    v_version := new.kpi_version_id;
    select t.kpi_version_id, t.scope_type
      into v_template_version, v_scope
      from public.kpi_templates t
     where t.id = new.template_id and t.deleted_at is null;
    if v_template_version is distinct from v_version or v_scope is distinct from new.subject_type then
      raise exception 'KPI 템플릿과 할당 대상의 버전 또는 종류가 일치하지 않습니다.' using errcode = '23514';
    end if;
    if new.subject_type = 'DEPARTMENT' then
      select d.version_id into v_department_version
        from public.departments d where d.id = new.department_id and d.deleted_at is null;
      if v_department_version is distinct from (
        select kv.org_version_id from public.kpi_versions kv where kv.id = v_version
      ) then
        raise exception '선택한 조직 버전에 속한 부서만 KPI를 할당할 수 있습니다.' using errcode = '23514';
      end if;
    end if;
  end if;

  select kv.status into v_status
    from public.kpi_versions kv where kv.id = v_version and kv.deleted_at is null;
  if v_status is distinct from 'DRAFT' then
    raise exception '발행된 KPI 정의와 할당은 수정할 수 없습니다.' using errcode = '55000';
  end if;
  return new;
end $$;

drop trigger if exists trg_kpi_templates_guard on public.kpi_templates;
create trigger trg_kpi_templates_guard before insert or update on public.kpi_templates
for each row execute function app.guard_kpi_definition();
drop trigger if exists trg_kpi_template_items_guard on public.kpi_template_items;
create trigger trg_kpi_template_items_guard before insert or update on public.kpi_template_items
for each row execute function app.guard_kpi_definition();
drop trigger if exists trg_kpi_assignments_guard on public.kpi_assignments;
create trigger trg_kpi_assignments_guard before insert or update on public.kpi_assignments
for each row execute function app.guard_kpi_definition();

create or replace function app.guard_kpi_version_publish()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.status = 'DRAFT' and new.status = 'PUBLISHED'
     and coalesce(current_setting('app.kpi_publish_context', true), '') <> 'true' then
    raise exception '조직과 KPI 동시 발행 RPC를 사용하세요.' using errcode = '55000';
  end if;
  return new;
end $$;
drop trigger if exists trg_kpi_versions_publish_guard on public.kpi_versions;
create trigger trg_kpi_versions_publish_guard before update on public.kpi_versions
for each row execute function app.guard_kpi_version_publish();

create or replace function app.guard_org_kpi_publish()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.status = 'DRAFT' and new.status = 'PUBLISHED'
     and coalesce(current_setting('app.kpi_publish_context', true), '') <> 'true' then
    raise exception '조직과 KPI 동시 발행 RPC를 사용하세요.' using errcode = '55000';
  end if;
  return new;
end $$;
drop trigger if exists trg_org_versions_kpi_publish_guard on public.org_versions;
create trigger trg_org_versions_kpi_publish_guard before update on public.org_versions
for each row execute function app.guard_org_kpi_publish();

-- 실적 입력 시 점수와 개정번호를 서버가 확정한다. ---------------------------
create or replace function app.prepare_kpi_actual_revision()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_item public.kpi_template_items%rowtype;
  v_assignment public.kpi_assignments%rowtype;
  v_status text;
  v_target numeric;
begin
  if not (app.is_admin() or app.can_write_workspace('management')) then
    raise exception 'KPI 실적을 입력할 권한이 없습니다.' using errcode = '42501';
  end if;

  select * into v_assignment from public.kpi_assignments
   where id = new.assignment_id and deleted_at is null;
  select * into v_item from public.kpi_template_items
   where id = new.template_item_id and deleted_at is null;
  if v_assignment.id is null or v_item.id is null or v_item.template_id <> v_assignment.template_id then
    raise exception '할당과 KPI 항목이 일치하지 않습니다.' using errcode = '23514';
  end if;
  select status into v_status from public.kpi_versions where id = v_assignment.kpi_version_id;
  if v_status = 'CLOSED' then
    raise exception '종료된 KPI에는 실적을 입력할 수 없습니다.' using errcode = '55000';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(new.assignment_id::text || ':' || new.template_item_id::text, 0));
  select coalesce(max(r.revision_no), 0) + 1 into new.revision_no
    from public.kpi_actual_revisions r
   where r.assignment_id = new.assignment_id and r.template_item_id = new.template_item_id;

  v_target := coalesce(
    nullif(v_assignment.target_overrides->>v_item.metric_code, '')::numeric,
    v_item.default_target
  );
  new.entered_by := app.current_app_user_id();
  new.computed_score := app.kpi_score(
    v_item.rule_type, v_item.rule_params, v_item.target_mode, v_target,
    new.actual_value, new.qualitative_value, new.actual_payload
  );
  return new;
end $$;

drop trigger if exists trg_kpi_actual_prepare on public.kpi_actual_revisions;
create trigger trg_kpi_actual_prepare before insert on public.kpi_actual_revisions
for each row execute function app.prepare_kpi_actual_revision();

create or replace function app.refresh_kpi_result(p_assignment_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_score numeric;
  v_completed integer;
  v_total integer;
  v_snapshot jsonb;
begin
  with items as (
    select i.* from public.kpi_assignments a
    join public.kpi_template_items i on i.template_id = a.template_id and i.deleted_at is null
    where a.id = p_assignment_id and a.deleted_at is null
  ), latest as (
    select distinct on (r.template_item_id)
           r.template_item_id, r.computed_score, r.actual_value, r.qualitative_value, r.entered_at
      from public.kpi_actual_revisions r
     where r.assignment_id = p_assignment_id
     order by r.template_item_id, r.revision_no desc
  )
  select coalesce(sum(l.computed_score), 0),
         count(l.template_item_id)::integer,
         count(i.id)::integer,
         coalesce(jsonb_agg(jsonb_build_object(
           'item_id', i.id, 'metric_code', i.metric_code, 'score', l.computed_score,
           'actual', l.actual_value, 'qualitative', l.qualitative_value, 'entered_at', l.entered_at
         ) order by i.sort_order), '[]'::jsonb)
    into v_score, v_completed, v_total, v_snapshot
    from items i left join latest l on l.template_item_id = i.id;

  insert into public.kpi_results
    (assignment_id, calculated_score, completed_items, total_items, calculation_snapshot, calculated_at)
  values
    (p_assignment_id, v_score, v_completed, v_total, v_snapshot, now())
  on conflict (assignment_id) do update set
    calculated_score = excluded.calculated_score,
    completed_items = excluded.completed_items,
    total_items = excluded.total_items,
    calculation_snapshot = excluded.calculation_snapshot,
    calculated_at = excluded.calculated_at,
    updated_at = now();
end $$;

revoke all on function app.refresh_kpi_result(uuid) from public, anon, authenticated;

create or replace function app.after_kpi_actual_revision()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  perform app.refresh_kpi_result(new.assignment_id);
  return new;
end $$;
drop trigger if exists trg_kpi_actual_refresh_result on public.kpi_actual_revisions;
create trigger trg_kpi_actual_refresh_result after insert on public.kpi_actual_revisions
for each row execute function app.after_kpi_actual_revision();

-- 공용 updated_at 트리거 ---------------------------------------------------
do $$
declare v_table text;
begin
  foreach v_table in array array[
    'kpi_versions','kpi_blueprints','kpi_blueprint_items','kpi_templates',
    'kpi_template_items','kpi_assignments','kpi_results'
  ] loop
    execute format('drop trigger if exists trg_%s_updated_at on public.%I', v_table, v_table);
    execute format(
      'create trigger trg_%s_updated_at before update on public.%I for each row execute function app.set_updated_at()',
      v_table, v_table
    );
  end loop;
end $$;
