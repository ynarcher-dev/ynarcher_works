-- =====================================================================
-- 걷힌 모듈 원장을 아직 가리키고 있는 함수 정리
--
-- 배경:
--   20260903150000이 협의되지 않은 운영 모듈 7종의 내용물 원장 30종을 drop cascade로
--   걷었다. cascade는 뷰·제약·정책까지만 따라가고 **함수 본문(문자열 본문)은 의존성으로
--   추적하지 않는다.** 그래서 그 표들을 조회하던 함수 4종이 살아남아, 호출 순간
--   42P01(undefined_table)로 실패한다. PostgREST는 이 SQLSTATE를 404로 내보내므로
--   프론트에서는 "RPC가 없다"로 보인다 — 실제로는 함수는 있고 본문이 깨진 것이다.
--
--   실제 증상: OFFICE 대시보드 '나의 데이터베이스'와 NETWORKS 통합/디렉토리 목록이
--   비었다. 셋 다 network_entity_metrics()를 경유한다.
--
-- 조치:
--   (1) public.network_entity_metrics() — 살린다. 활동(참여 사업 수)의 근거인
--       program_participants는 그대로 있고, 만족도의 근거인 mentor_satisfaction_records만
--       걷혔다. 반환 열은 그대로 두고 satisfaction_avg만 null로 낸다 — 열을 빼면 이 함수를
--       조인하는 목록 RPC 3종을 함께 고쳐야 하고, 멘토링을 다시 설계하는 날 같은 자리를
--       다시 만들게 된다. 만족도로 거르면 아무도 잡히지 않는데, 이는 종전 규약
--       ('만족도로 거른다 = 평가가 있는 인물 중에서')이 평가가 0건인 상태에서 그대로
--       적용된 결과다.
--   (2) public.startup_growth_metrics(uuid) — 지운다. 유일한 근거 원장이
--       mentor_feedback_records였고 호출하는 화면은 이미 없다. 되살릴 수 없는 함수를
--       남기면 다음 사람이 호출해 보고 404를 다시 만난다.
--   (3) app.guest_slot_ids() / guest_booking_ids() / guest_mentoring_session_ids() —
--       지운다. 이 셋을 쓰던 정책은 대상 표(matching_*·mentoring_*)와 함께 사라졌고
--       본문도 걷힌 표를 가리킨다. app.guest_open_module_ids()는 글·링크·첨부 정책이
--       계속 쓰므로 그대로 둔다.
--
-- 보안 게이트:
--   - 새 표·정책·Storage 없음. 권한 경계 변화 없음(넓어지는 방향의 변경이 없다).
--   - network_entity_metrics는 SECURITY DEFINER를 유지하되 search_path 고정과
--     함수 첫 조건의 can_read_workspace('networks') 검사를 그대로 둔다. 반환은 건수뿐.
--   - GRANT는 authenticated로 한정(종전과 동일). 삭제 대상 3+1종은 권한 판정에 쓰이지 않아
--     제거로 열리는 경로가 없다.
--   - 감사 로그 대상 아님(조회 집계).
-- 근거: 20260731190000_network_directory_search_metrics.sql(집계 규약),
--       20260903150000_remove_unagreed_module_templates.sql(원장 30종 제거)
-- =====================================================================

-- ── 1. 활동·만족도 집계 ───────────────────────────────────────────────
create or replace function public.network_entity_metrics()
returns table (
  entity_id        uuid,
  activity_count   bigint,
  satisfaction_avg numeric
)
language sql
stable
security definer
set search_path = app, public
as $$
  select pp.master_id as entity_id,
         count(distinct pp.program_id) as activity_count,
         -- 만족도의 근거 원장(mentor_satisfaction_records)은 20260903150000에서 걷혔다.
         -- 멘토링을 다시 설계할 때 이 자리를 다시 채운다. 그때까지 목록은 '-'로 표기한다.
         null::numeric as satisfaction_avg
    from public.program_participants pp
   where pp.master_id is not null
     -- 권한 게이트: NETWORKS 열람 권한이 없으면 0행(집계값이 목록으로 새어 나가지 않는다).
     and app.can_read_workspace('networks')
   group by pp.master_id;
$$;

grant execute on function public.network_entity_metrics() to authenticated;

comment on function public.network_entity_metrics() is
  'NETWORKS 인물의 활동(참여 사업 수) 집계. 만족도는 근거 원장이 걷혀(20260903150000) null이며 멘토링 재설계 때 되살린다. AC 원장을 우회 집계하므로 SECURITY DEFINER이며 함수 내부에서 networks 읽기 권한을 검사한다.';

-- ── 2. 근거 원장을 잃은 함수 정리 ─────────────────────────────────────
-- 성장 지표(멘토 평가 5축) — 원장도 화면도 없다.
drop function if exists public.startup_growth_metrics(uuid);

-- 게스트 매칭·멘토링 판정 헬퍼 — 대상 표와 정책이 함께 사라졌다.
drop function if exists app.guest_booking_ids();
drop function if exists app.guest_slot_ids();
drop function if exists app.guest_mentoring_session_ids();
