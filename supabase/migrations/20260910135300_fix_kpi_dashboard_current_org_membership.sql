-- OFFICE KPI가 종료된 과거 조직을 고르던 문제와, 최초 기간 백필이 삭제된
-- 조직 초안의 시작일에서 소속을 끊은 문제를 함께 복구한다.

-- 각 조직 버전·임직원의 마지막 소속 구간은 그 조직 버전의 끝까지 이어져야 한다.
-- 중간 이동 구간은 건드리지 않고 마지막 활성 구간만 원장 경계에 맞춘다.
with latest_membership as (
  select distinct on (dm.version_id, dm.user_id)
         dm.id, dm.version_id
    from public.dept_members dm
   where dm.deleted_at is null
   order by dm.version_id, dm.user_id, dm.effective_from desc, dm.created_at desc
)
update public.dept_members dm
   set effective_to = ov.effective_to
  from latest_membership latest
  join public.org_versions ov on ov.id = latest.version_id and ov.deleted_at is null
 where dm.id = latest.id
   and dm.effective_to is distinct from ov.effective_to;

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
    select ov.*
      from public.org_versions ov
     where ov.status = 'PUBLISHED'
       and ov.deleted_at is null
       and ov.effective_from <= p_as_of
     order by
       (ov.effective_to is null or p_as_of < ov.effective_to) desc,
       case when ov.effective_to is null or p_as_of < ov.effective_to
         then ov.effective_from end desc,
       case when ov.effective_to is not null and ov.effective_to <= p_as_of
         then ov.effective_to end desc,
       ov.created_at desc
     limit 1
  ), selected_version as (
    select kv.*, ov.label as org_label, ov.effective_from as org_from, ov.effective_to as org_to
      from public.kpi_versions kv
      join selected_org ov on ov.id = kv.org_version_id
     where kv.status in ('PUBLISHED','CLOSED') and kv.deleted_at is null
  ), membership as (
    select dm.department_id, dm.effective_from
      from public.dept_members dm
      join selected_version sv on sv.org_version_id = dm.version_id
     where dm.user_id = app.current_app_user_id()
       and dm.deleted_at is null
       and dm.effective_from <= p_as_of
       and (dm.effective_to is null or p_as_of < dm.effective_to)
     order by dm.effective_from desc
     limit 1
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
    join public.kpi_assignments a
      on a.kpi_version_id = sv.id and a.deleted_at is null
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
