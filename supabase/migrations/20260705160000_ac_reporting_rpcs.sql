-- =====================================================================
-- [Phase 7] AC 집계 리포팅 RPC (HUB 랭킹 / NETWORKS 성장지표)
-- SECURITY DEFINER로 AC 테이블을 우회 집계하되, 호출자의 hub/networks 읽기 권한을
-- 함수 내부에서 검사하여 비인가 접근은 0건 반환(권한 게이트).
-- =====================================================================

-- HUB 자문단(전문가) 만족도 랭킹: 대상 전문가 평균 평점 내림차순
create or replace function public.hub_expert_ranking()
returns table (
  expert_id     uuid,
  expert_name   text,
  avg_score     numeric,
  session_count bigint
)
language sql
stable
security definer
set search_path = public, app
as $$
  select e.id, e.name, round(avg(msr.score)::numeric, 2), count(*)
    from public.mentor_satisfaction_records msr
    join public.program_participants pp on pp.id = msr.mentor_participant_id
    join public.experts e on e.id = pp.master_id
   where app.can_read_workspace('hub')
   group by e.id, e.name
   order by avg(msr.score) desc, count(*) desc;
$$;

-- NETWORKS 스타트업 성장 5대 지표 평균(멘토 진단 누적)
create or replace function public.startup_growth_metrics(p_startup_id uuid)
returns table (
  technology          numeric,
  business_model      numeric,
  credibility         numeric,
  collaboration       numeric,
  matching_feasibility numeric,
  sample_count        bigint
)
language sql
stable
security definer
set search_path = public, app
as $$
  select
    round(avg(score_technology)::numeric, 2),
    round(avg(score_business_model)::numeric, 2),
    round(avg(score_credibility)::numeric, 2),
    round(avg(score_collaboration)::numeric, 2),
    round(avg(score_matching_feasibility)::numeric, 2),
    count(*)
  from public.mentor_feedback_records
  where startup_id = p_startup_id
    and app.can_read_workspace('networks');
$$;

grant execute on function public.hub_expert_ranking() to authenticated;
grant execute on function public.startup_growth_metrics(uuid) to authenticated;
