-- Phase 12 fix: organization reform creates an editable draft first.
--
-- The UI flow calls clone_org_version from the "start structure design" button,
-- then keeps the cloned version hidden until the user reserves it. Creating the
-- row as PUBLISHED first is fragile because older databases may still have the
-- published-period exclusion constraint, and the current organization often has
-- effective_to = null. A future PUBLISHED row overlaps that open-ended period
-- before the UI can downgrade it to DRAFT.
--
-- Keep the latest clone behavior from 20260709120000_org_levels_versioned.sql
-- (level snapshot, department snapshot, member placement snapshot), but insert
-- org_versions.status = DRAFT from the start.
create or replace function public.clone_org_version(
  p_src_version uuid,
  p_label       text,
  p_from        date,
  p_to          date
)
returns uuid
language plpgsql
security definer
set search_path = public, app
as $$
declare
  v_new uuid;
begin
  if not (app.is_admin() or app.can_write_workspace('management')) then
    raise exception '조직 버전을 생성할 권한이 없습니다.' using errcode = '42501';
  end if;
  if btrim(coalesce(p_label, '')) = '' then
    raise exception '버전 이름을 입력하세요.' using errcode = '22023';
  end if;
  if p_from is null then
    raise exception '시작일을 입력하세요.' using errcode = '22023';
  end if;

  insert into public.org_versions (label, effective_from, effective_to, status)
  values (btrim(p_label), p_from, p_to, 'DRAFT')
  returning id into v_new;

  insert into public.org_levels (name, sort_order, version_id, lineage_id)
  select l.name, l.sort_order, v_new, l.lineage_id
    from public.org_levels l
   where l.version_id = p_src_version
     and l.deleted_at is null;

  insert into public.departments
    (name, parent_id, level_id, sort_order, version_id, lineage_id, hr_hidden)
  select s.name, null, nl.id, s.sort_order, v_new, s.lineage_id, s.hr_hidden
    from public.departments s
    left join public.org_levels sl
      on sl.id = s.level_id
    left join public.org_levels nl
      on nl.version_id = v_new and nl.lineage_id = sl.lineage_id and nl.deleted_at is null
   where s.version_id = p_src_version
     and s.deleted_at is null;

  update public.departments c
     set parent_id = np.id
    from public.departments s_child
    join public.departments s_parent
      on s_parent.id = s_child.parent_id and s_parent.version_id = p_src_version
    join public.departments np
      on np.version_id = v_new and np.lineage_id = s_parent.lineage_id
   where c.version_id = v_new
     and c.lineage_id = s_child.lineage_id
     and s_child.version_id = p_src_version;

  insert into public.dept_members (version_id, department_id, user_id)
  select v_new, np.id, m.user_id
    from public.dept_members m
    join public.departments sd
      on sd.id = m.department_id and sd.version_id = p_src_version
    join public.departments np
      on np.version_id = v_new and np.lineage_id = sd.lineage_id
   where m.version_id = p_src_version
     and m.deleted_at is null;

  return v_new;
end $$;

revoke all on function public.clone_org_version(uuid, text, date, date) from public;
grant execute on function public.clone_org_version(uuid, text, date, date) to authenticated;
