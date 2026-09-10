-- KPI 운영 중에만 실적을 받으며, 조직 종료 밖의 부서 이동 구간을 차단한다.
-- 기존 RLS/GRANT는 유지하고 트리거 함수의 상태·기간 검증만 강화한다.

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
  if v_status is distinct from 'PUBLISHED' then
    raise exception '운영 중인 KPI에만 실적을 입력할 수 있습니다.' using errcode = '55000';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(new.assignment_id::text || ':' || new.template_item_id::text, 0));
  select coalesce(max(r.revision_no), 0) + 1 into new.revision_no
    from public.kpi_actual_revisions r
   where r.assignment_id = new.assignment_id and r.template_item_id = new.template_item_id;
  v_target := coalesce(nullif(v_assignment.target_overrides->>v_item.metric_code, '')::numeric, v_item.default_target);
  new.entered_by := app.current_app_user_id();
  new.computed_score := app.kpi_score(
    v_item.rule_type, v_item.rule_params, v_item.target_mode, v_target,
    new.actual_value, new.qualitative_value, new.actual_payload
  );
  return new;
end $$;

revoke all on function app.prepare_kpi_actual_revision() from public, anon, authenticated;

create or replace function app.guard_department_membership_period()
returns trigger
language plpgsql
set search_path = ''
as $$
declare v_org public.org_versions%rowtype;
begin
  select * into v_org from public.org_versions where id = new.version_id and deleted_at is null;
  if v_org.id is null then
    raise exception '조직 버전을 찾을 수 없습니다.' using errcode = 'P0002';
  end if;
  if new.effective_from < v_org.effective_from
     or (v_org.effective_to is not null and new.effective_from >= v_org.effective_to)
     or (v_org.effective_to is not null and coalesce(new.effective_to, v_org.effective_to) > v_org.effective_to) then
    raise exception '인력 배치 기간은 조직 버전의 적용기간 안에 있어야 합니다.' using errcode = '23514';
  end if;
  return new;
end $$;

revoke all on function app.guard_department_membership_period() from public, anon, authenticated;
drop trigger if exists trg_dept_members_period_guard on public.dept_members;
create trigger trg_dept_members_period_guard
before insert or update of version_id, effective_from, effective_to on public.dept_members
for each row execute function app.guard_department_membership_period();
