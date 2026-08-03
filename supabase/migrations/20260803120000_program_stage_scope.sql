-- =====================================================================
-- M&A·PROJECT 상태 수명주기에서 제안 단계 폐지 — 운영 4단계만 남긴다
--
-- 배경
--   사업 공용 모듈(features/program)을 AC에서 이식하면서 상태 수명주기도 그대로 따라왔다.
--   그러나 제안 단계(시도 → 선정 / 미선정)는 AC의 사실이다 — 공고에 제안해 선정되어야 사업이
--   열리므로 '선정되지 않은 사업'이 원장에 남아야 한다. M&A 딜과 PROJECT는 착수 결정이 곧
--   시작이라 제안을 밟지 않는다. 쓰지 않는 단계를 남겨 두면 두 가지가 어긋난다.
--     (1) 목록 위 진행 현황에 영원히 0건인 칸 셋이 서서, 편중을 읽어야 할 자리가 빈칸을 읽는다.
--     (2) 상태 셀렉트에 남아 있는 한 언젠가 제안 상태로 등록되고, 그 행은 운영 4단계 어디에도
--         속하지 않아 목록 상태 필터로 다시 찾을 수 없다.
--
-- 범위
--   (1) 기존 행 환산 — 시도·선정 → 준비(DRAFT), 미선정 → 취소(CANCELLED).
--       '선정'은 운영을 열어 주는 경계 상태이므로 그 다음 칸인 준비로 내려앉히고, '미선정'은
--       더 진행되지 않는 결말이라 운영 단계의 같은 성격 결말인 취소로 옮긴다.
--   (2) CHECK 제약 — 두 원장에 제안 상태를 저장할 수 없게 DB에서 막는다.
--       화면(폼·업로드·필터)에서 선택지를 지우는 것만으로는 RPC·직접 호출 경로가 남는다.
--       "UI에서 숨기는 것은 보안이 아니다"(docs_dev/1_development_stack.md).
--   AC(public.programs)는 손대지 않는다 — 제안 단계는 AC의 정상 수명주기다.
--   enum public.program_status 자체는 그대로 둔다(AC가 쓰는 값이라 지울 수 없다).
--
-- 제약을 '허용 4종 열거'가 아니라 '제안 3종 금지'로 쓰는 이유
--   금지 목록이 이 변경이 실제로 뜻하는 바다. 허용 목록으로 쓰면 enum에 남아 있는 구 상태값
--   (RECRUITING·SCREENING·DEMO_DAY)을 가진 행이 어느 환경에 하나라도 있을 때 제약 추가 자체가
--   실패하고, 그 행을 살리자고 마이그레이션이 임의의 상태를 지어내게 된다.
--
-- 보안 게이트(11_migration_security_gate.md) 답변
--   - 소유 워크스페이스: mna / project
--   - 데이터 등급: Restricted(M&A 딜) · Internal(프로젝트). 등급 변화 없음
--   - 접근 주체: 내부 사용자만. 게스트 경로 없음
--   - Scope 기준: 변화 없음(기존 워크스페이스 + 단건 사업 정책 그대로)
--   - 감사 로그: 상태 환산은 기존 변동 이력 트리거(app.log_entity_contribution)가 남긴다.
--     사유는 트리거가 알 수 없으므로 트랜잭션 GUC app.contribution_ctx로 실어 보낸다.
--   - 운영 영향: 신규 테이블·RPC·정책·SECURITY DEFINER 함수 없음. RLS 변경 없음.
--     프론트는 ProgramWorkspaceConfig.hasProposalStage(false)로 같은 규칙을 따른다.
-- 근거: 20260720140000_ma_program_schema.sql, 20260720150000_project_program_schema.sql,
--       20260720120000_program_status_selected.sql, 20260721160000_entity_contribution_trigger_networks.sql
-- =====================================================================

-- (1) 기존 행 환산 -----------------------------------------------------------
--     GUC와 UPDATE를 한 DO 블록에 두어 같은 트랜잭션을 공유하게 한다(is_local=true는
--     트랜잭션 종료와 함께 저절로 풀린다). source는 'manual'|'upload'만 허용되므로
--     경위는 note에 적는다.
do $$
declare
  v_moved integer;
begin
  perform set_config(
    'app.contribution_ctx',
    jsonb_build_object(
      'action', 'edited',
      'source', 'manual',
      'note',  '제안 단계 폐지에 따른 상태 환산(마이그레이션 20260803120000)'
    )::text,
    true
  );

  update public.ma_programs set status = 'DRAFT'
   where status in ('PROPOSED', 'SELECTED');
  get diagnostics v_moved = row_count;
  raise notice 'ma_programs 시도·선정 → 준비: %건', v_moved;

  update public.ma_programs set status = 'CANCELLED'
   where status = 'NOT_SELECTED';
  get diagnostics v_moved = row_count;
  raise notice 'ma_programs 미선정 → 취소: %건', v_moved;

  update public.project_programs set status = 'DRAFT'
   where status in ('PROPOSED', 'SELECTED');
  get diagnostics v_moved = row_count;
  raise notice 'project_programs 시도·선정 → 준비: %건', v_moved;

  update public.project_programs set status = 'CANCELLED'
   where status = 'NOT_SELECTED';
  get diagnostics v_moved = row_count;
  raise notice 'project_programs 미선정 → 취소: %건', v_moved;
end $$;

-- (2) 제안 상태 저장 금지 ----------------------------------------------------
alter table public.ma_programs
  drop constraint if exists ma_programs_no_proposal_status_check;
alter table public.ma_programs
  add constraint ma_programs_no_proposal_status_check
  check (status not in ('PROPOSED', 'SELECTED', 'NOT_SELECTED'));

alter table public.project_programs
  drop constraint if exists project_programs_no_proposal_status_check;
alter table public.project_programs
  add constraint project_programs_no_proposal_status_check
  check (status not in ('PROPOSED', 'SELECTED', 'NOT_SELECTED'));

comment on constraint ma_programs_no_proposal_status_check on public.ma_programs is
  'M&A는 제안 단계를 운용하지 않는다 — 운영 4단계(준비/진행중/종료/취소)만 저장한다. 프론트 ProgramWorkspaceConfig.hasProposalStage=false와 같은 규칙.';
comment on constraint project_programs_no_proposal_status_check on public.project_programs is
  'PROJECT는 제안 단계를 운용하지 않는다 — 운영 4단계(준비/진행중/종료/취소)만 저장한다. 프론트 ProgramWorkspaceConfig.hasProposalStage=false와 같은 규칙.';
