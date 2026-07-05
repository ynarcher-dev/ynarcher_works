-- =====================================================================
-- [Phase 7] 평가 폼 가중 집계 RPC (7-4 공통 평가 엔진)
-- 제출(SUBMITTED)된 답변을 지표 가중치로 합산하여 대상별 집계.
-- 가중총점 = SUM(score_value * criteria.weight), 평가자 수로 평균 산출.
-- =====================================================================

create or replace function public.evaluation_form_results(p_form_id uuid)
returns table (
  target_id        uuid,
  target_type      text,
  target_ref       uuid,
  weighted_total   numeric,
  evaluator_count  bigint
)
language sql
stable
security definer
set search_path = public, app
as $$
  select
    et.id,
    et.target_type::text,
    et.target_id,
    round(coalesce(sum(ea.score_value * ec.weight), 0)::numeric, 2),
    count(distinct es.evaluator_id)
  from public.evaluation_targets et
  left join public.evaluation_submissions es
    on es.form_id = et.form_id and es.target_id = et.id and es.status = 'SUBMITTED'
  left join public.evaluation_answers ea on ea.submission_id = es.id
  left join public.evaluation_criteria ec on ec.id = ea.criterion_id
  where et.form_id = p_form_id
    and app.can_read_workspace('ac')
  group by et.id, et.target_type, et.target_id
  order by 4 desc nulls last;
$$;

grant execute on function public.evaluation_form_results(uuid) to authenticated;
