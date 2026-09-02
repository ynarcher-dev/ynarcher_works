-- =====================================================================
-- 협의되지 않은 운영 모듈 7종을 걷는다 — 카탈로그·인스턴스·내용물 원장까지
--
-- 무엇을 걷는가
--   서면평가(DOC_REVIEW) · 대면평가(ONSITE_EVAL) · OT(ORIENTATION) ·
--   멘토링(MENTORING) · 비즈니스 매칭(BUSINESS_MATCHING) ·
--   데모데이(DEMO_DAY) · 성과(OUTCOMES)
--
--   남는 것은 글쓰기(POST) · URL첨부(LINK) · 파일첨부(FILE) · 모집(RECRUITMENT)
--   네 종류이며, 사업 공통 기능(공지·QNA·명부·타임라인·자료)은 모듈 축이 아니므로
--   이 마이그레이션이 손대지 않는다.
--
-- 왜 끄지 않고 지우는가
--   이 7종은 세부 기능이 기획 협의 없이 구현된 것이라 **처음부터 다시 설계**한다.
--   is_active를 내리는 것(새로 못 만들 뿐 남아 있음)은 '운영은 계속하되 배치만 멈춘다'는
--   뜻이고, 여기서 필요한 것은 그 반대다 — 다시 설계할 자리를 비우는 것이다. 빈 원장
--   30종이 RLS 정책과 외래키를 단 채 남으면 새 설계가 매번 그것들을 피해 가야 하고,
--   모듈 삭제 기능의 내용물 카탈로그(app.module_content_tables)도 계속 그것들을 가리킨다.
--
-- 지금이 가장 싼 시점이다 — 대상 원장은 사실상 비어 있다(평가 정의 2행, 나머지 0행).
-- 운영 기록이라 부를 만한 것이 없으므로 잃는 실데이터가 없다.
--
-- 물리 삭제 금지 원칙과의 관계
--   그 원칙은 **업무 기록 행**을 지우지 말라는 것이다. 여기서 없애는 것은 행이 아니라
--   아직 쓰이지 않은 **그릇(테이블·카탈로그 행·모듈 인스턴스)**이며, 모듈 인스턴스는
--   이미 하드 딜리트가 허용된 유일한 예외다(CLAUDE.md '모듈 인스턴스만 하드 딜리트한다').
--
-- 이름이 비슷하다고 함께 걷지 않은 것
--   * attendance_policies / attendance_days / attendance_statuses / attendance_edits
--     — MANAGEMENT 임직원 근태다. 모듈과 무관하며 실데이터가 있다.
--       OT 출석인 attendance_logs 하나만 대상이다.
--   * export_jobs — 특정 모듈이 아니라 내보내기 일반 기구다. 그대로 둔다.
--   * DEMO_DAY는 program_status enum에도 같은 이름의 값이 있다. 그쪽은 사업 상태이므로
--     건드리지 않는다(여기서 다루는 것은 module_type뿐이다).
--
-- ---------------------------------------------------------------------
-- 보안 게이트 자기점검 (docs/docs_dev/11_migration_security_gate.md)
--   · 소유 워크스페이스: ac / mna / project(사업 공용 모듈). 진입 주체는 내부 사용자와 guest.
--   · 데이터 등급: Internal. **새로 여는 데이터가 없다** — 이 마이그레이션은 접근 가능한
--     대상을 줄이기만 한다. 노출면이 넓어지는 경로는 한 줄도 없다.
--   · 접근 주체 변화: 게스트가 보던 메뉴 중 이 7종이 사라진다(대상 인스턴스가 함께 지워지므로
--     app.guest_module_ids()의 결과 집합이 줄어든다). 전문가 뷰(세션 보드·멘토 피드백)는
--     원장이 사라져 빈 화면이 되며, 같은 배포에서 화면도 함께 걷는다.
--   · Scope: program → module. **신규 테이블·정책·트리거·SECURITY DEFINER 함수 없음.**
--   · RLS: 정책은 테이블과 함께 사라진다(별도 drop policy 불필요). 남는 표에 정책 변경 없음.
--   · SECURITY DEFINER: 신설 없음. app.module_external_record(text)를 재정의하되 종전과 같은
--     INVOKER·immutable·text 인자·boolean 반환이며, 목록만 줄어든다(더 많이 막던 것이
--     덜 막게 되는 방향이 아니다 — 막을 대상 표 자체가 사라진다).
--   · 감사 로그: 해당 없음(개인정보 조회·다운로드·권한 변경 경로가 아니다).
--   · 물리 삭제: 있음. 위 '물리 삭제 금지 원칙과의 관계'가 근거이며 대상은 빈 그릇이다.
--   · 프론트 영향: 해당 패널·훅·게스트 화면을 걷은 빌드가 함께 나간다. 순서는 무관하다 —
--     구 프론트가 사라진 표를 조회하면 그 패널만 오류를 내고(진입 경로인 모듈 인스턴스가
--     이미 없어 실제로는 도달하지 않는다), 신 프론트는 그 표를 부르지 않는다.
-- 근거: 20260902140000_module_templates.sql(카탈로그), 20260902180000_program_module_hard_delete.sql,
--       20260902210000_module_delete_external_only.sql, 20260903100000_program_module_ledger_unify.sql
-- =====================================================================

-- ---------------------------------------------------------------------
-- (1) 카탈로그에서 7종을 뺀다 — "무엇을 배치할 수 있는가"는 원장이 답한다
--     행을 지우면 app.module_template_available()이 false를 답해 새로 만들 수 없다.
-- ---------------------------------------------------------------------
delete from public.module_templates
 where key in ('DOC_REVIEW', 'ONSITE_EVAL', 'ORIENTATION',
               'MENTORING', 'BUSINESS_MATCHING', 'DEMO_DAY', 'OUTCOMES');

-- ---------------------------------------------------------------------
-- (2) 그 종류로 만들어진 모듈 인스턴스를 거둔다
--     순서가 중요하다 — 첨부 되돌리기와 공개 링크 정리가 인스턴스 삭제보다 먼저다.
-- ---------------------------------------------------------------------
do $$
declare
  v_types text[] := array['DOC_REVIEW', 'ONSITE_EVAL', 'ORIENTATION',
                          'MENTORING', 'BUSINESS_MATCHING', 'DEMO_DAY', 'OUTCOMES'];
  v_ids   uuid[];
  v_n     integer;
begin
  select coalesce(array_agg(id), '{}') into v_ids
    from public.program_modules where module_type::text = any(v_types);

  if array_length(v_ids, 1) is null then
    raise notice '[모듈 정리] 대상 인스턴스 없음';
    return;
  end if;

  -- 첨부는 지우지 않고 사업 자료로 되돌린다. 행을 지우면 스토리지 실물이 아무도 못 찾는
  -- 파일로 남는다(하드 딜리트 규칙과 같다).
  update public.attachments set program_module_id = null
   where program_module_id = any(v_ids);
  get diagnostics v_n = row_count;
  raise notice '[모듈 정리] 사업 자료로 되돌린 첨부: %건', v_n;

  -- 공개 링크는 FK 없는 다형 원장이라 cascade가 닿지 않는다. 직접 거둔다.
  delete from public.program_module_public_links where program_module_id = any(v_ids);
  get diagnostics v_n = row_count;
  raise notice '[모듈 정리] 함께 지운 공개 링크: %건', v_n;

  -- 인스턴스. 담당자·공지·타임라인·내용물은 FK cascade가 함께 거둔다.
  delete from public.program_modules where id = any(v_ids);
  get diagnostics v_n = row_count;
  raise notice '[모듈 정리] 지운 모듈 인스턴스: %건', v_n;
end $$;

-- ---------------------------------------------------------------------
-- (3) 내용물 원장을 걷는다
--
--     cascade를 쓰는 이유: 이 표들을 참조하는 외래키가 **전부 이 목록 안**에 있음을
--     사전에 확인했다(목록 밖에서 들어오는 참조 0건). 그럼에도 의존 순서를 손으로 맞추면
--     한 줄만 어긋나도 마이그레이션이 중간에 멈추고, 그 상태는 되돌리기 어렵다.
--     cascade는 그 위험을 없애되, 위 확인 덕분에 목록 밖의 무엇도 함께 지우지 않는다.
-- ---------------------------------------------------------------------

-- 서면평가·대면평가(평가 엔진 공용)
drop table if exists public.selection_results             cascade;
drop table if exists public.evaluation_answers            cascade;
drop table if exists public.evaluation_submissions        cascade;
drop table if exists public.evaluation_assignments        cascade;
drop table if exists public.evaluation_targets            cascade;
drop table if exists public.evaluation_criteria           cascade;
drop table if exists public.evaluation_forms              cascade;
drop table if exists public.document_review_snapshots     cascade;
drop table if exists public.document_review_rounds        cascade;
drop table if exists public.onsite_eval_presentations     cascade;
drop table if exists public.onsite_eval_sessions          cascade;

-- OT·공통 세션 (attendance_logs는 세션 출석이다 — 임직원 근태 attendance_*와 다르다)
drop table if exists public.attendance_logs               cascade;
drop table if exists public.session_materials             cascade;
drop table if exists public.session_attendees             cascade;
drop table if exists public.orientation_sessions          cascade;

-- 멘토링
drop table if exists public.mentor_feedback_records       cascade;
drop table if exists public.mentor_satisfaction_records   cascade;
drop table if exists public.mentoring_logs                cascade;
drop table if exists public.mentoring_sessions            cascade;
drop table if exists public.mentoring_relationships       cascade;

-- 비즈니스 매칭
drop table if exists public.counseling_logs               cascade;
drop table if exists public.matching_bookings             cascade;
drop table if exists public.matching_slots                cascade;
drop table if exists public.matching_tables               cascade;
drop table if exists public.matching_events               cascade;

-- 데모데이
drop table if exists public.follow_up_meetings            cascade;
drop table if exists public.demoday_interests             cascade;
drop table if exists public.demoday_presentations         cascade;
drop table if exists public.demoday_sessions              cascade;

-- 성과
drop table if exists public.outcome_records               cascade;

-- ---------------------------------------------------------------------
-- (4) 그 원장에만 기대던 RPC를 함께 걷는다
--     남겨 두면 없는 표를 부르는 함수가 되어, 호출 시점에야 깨진다.
-- ---------------------------------------------------------------------
drop function if exists public.evaluation_form_results(uuid);
-- 전문가 만족도 랭킹 — 근거 원장이 멘토링 만족도였다. 랭킹을 다시 세울지는 멘토링
-- 재설계가 정한다(집계 규칙은 무엇을 재느냐에 딸린 것이지 그 반대가 아니다).
drop function if exists public.hub_expert_ranking();

-- ---------------------------------------------------------------------
-- (5) 모듈 삭제를 막는 '밖에서 들어온 기록' 목록에서 사라진 표를 뺀다
--     이 함수는 손 목록이라 표가 사라져도 저절로 줄지 않는다. 남겨 두면 실재하지 않는
--     이름을 계속 판정하게 되고, 나중에 같은 이름의 표가 다른 뜻으로 생기면 조용히
--     삭제를 막는다.
-- ---------------------------------------------------------------------
create or replace function app.module_external_record(p_rel_name text)
returns boolean
language sql
immutable
set search_path = app, public
as $$
  select regexp_replace(p_rel_name, '^(?:ma|project)_', '') in (
    -- 모집: 지원자가 낸 것. 2026-09-03 현재 밖에서 들어오는 원장은 이 둘뿐이다.
    'application_submissions',
    'application_answers'
  );
$$;

comment on function app.module_external_record(text) is
  '모듈 삭제를 막는 외부 유입 기록 판정. 여기 없는 표는 삭제를 막지 않으므로, 밖에서 들어오는 원장을 새로 만들면 반드시 여기에 넣어야 한다. (2026-09-03 — 운영 모듈 7종 제거로 모집 2종만 남았다.)';

-- ---------------------------------------------------------------------
-- (6) module_type enum 값은 지우지 않는다
--     PostgreSQL에서 enum 값 제거는 그 타입에 의존하는 컬럼·함수·인덱스를 모두 재작성해야
--     하고, 얻는 것은 카탈로그의 문자열 몇 줄뿐이다. 배치 가능 여부는 코드도 enum도 아닌
--     module_templates가 답하므로(20260902140000), 카탈로그에서 빠진 값은 이미 고를 수 없다.
--     같은 판단을 2026-09-02에 module_visibility의 PUBLIC에도 적용했다.
-- ---------------------------------------------------------------------
