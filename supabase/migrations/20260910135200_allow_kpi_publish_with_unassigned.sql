-- KPI 미할당 대상은 발행 차단이 아니라 운영 중 보완 가능한 경고로 취급한다.
-- 기존 정의와 기존 할당은 발행 후에도 고정하고, 비어 있던 주 할당의 최초 INSERT만 허용한다.

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
    from (select distinct dm.user_id from public.dept_members dm
           where dm.version_id = p_org_version_id and dm.deleted_at is null) people
   where not exists (
     select 1 from public.kpi_assignments a
      where a.kpi_version_id = v_kpi.id and a.subject_type = 'PERSON'
        and a.user_id = people.user_id and a.assignment_kind = 'PRIMARY' and a.deleted_at is null
   );

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
    jsonb_build_object(
      'org_version_id', v_org.id, 'kpi_version_id', v_kpi.id,
      'effective_from', v_org.effective_from,
      'missing_departments', v_missing_departments, 'missing_people', v_missing_people
    ),
    case when v_missing_departments + v_missing_people > 0
      then '조직·KPI 스냅샷 동시 발행(미할당 대상 후속 보완)'
      else '조직·KPI 스냅샷 동시 발행' end
  );
  return v_kpi.id;
end $$;

revoke all on function app.publish_org_and_kpi_version(uuid) from public, anon;
grant execute on function app.publish_org_and_kpi_version(uuid) to authenticated;

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
    select t.kpi_version_id into v_version from public.kpi_templates t where t.id = new.template_id;
  elsif tg_table_name = 'kpi_assignments' then
    v_version := new.kpi_version_id;
    select t.kpi_version_id, t.scope_type into v_template_version, v_scope
      from public.kpi_templates t where t.id = new.template_id and t.deleted_at is null;
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
    elsif not exists (
      select 1
        from public.dept_members dm
       where dm.version_id = (
               select kv.org_version_id from public.kpi_versions kv where kv.id = v_version
             )
         and dm.user_id = new.user_id
         and dm.deleted_at is null
    ) then
      raise exception '선택한 조직 버전에 배치된 임직원만 KPI를 할당할 수 있습니다.' using errcode = '23514';
    end if;
  end if;

  select kv.status into v_status from public.kpi_versions kv
   where kv.id = v_version and kv.deleted_at is null;
  if v_status = 'PUBLISHED' and tg_table_name = 'kpi_assignments'
     and tg_op = 'INSERT' and new.assignment_kind = 'PRIMARY' then
    return new;
  end if;
  if v_status is distinct from 'DRAFT' then
    raise exception '발행된 KPI 정의와 기존 할당은 수정할 수 없습니다.' using errcode = '55000';
  end if;
  return new;
end $$;

revoke all on function app.guard_kpi_definition() from public, anon, authenticated;
