-- =====================================================================
-- 양식·예산 관계에서 **'근거 품의 필수'(SPEND_REQUIRED)를 없앤다** (2026-09-15 사용자 결정).
--
-- 왜 없애는가
--   필수로 두면 품의 없이 나가는 지출—법인카드·인건비는 물론 사업에서도 흔하다—이 결재에 오를
--   길 자체가 막힌다. 그런 문 앞에서 담당자가 하는 일은 지출을 포기하는 것이 아니라 **상관없는
--   품의를 아무거나 고르는 것**이고, 그 순간 예산은 실제로 쓴 곳이 아닌 줄에서 깎인다. 근거를
--   비운 지출은 "어느 예산도 깎지 않은 지출"로 눈에 남지만(app.approval_spend_item_amounts가
--   line_id null인 행도 돌려주는 것과 같은 이유), 잘못 고른 지출은 남은 예산이 조용히 거짓을
--   말하게 만든다. 남는 값은 세 가지다 — NONE / SPEND_OPTIONAL / REVISE.
--
-- 무엇이 바뀌는가
--   (1) SPEND_REQUIRED였던 양식은 전부 SPEND_OPTIONAL로 옮긴다(표준 지출결의서 `지결`이 대상).
--       근거 품의를 고르는 자리는 그대로 서고, 비운 채로도 상신된다.
--   (2) CHECK 제약에서 값을 뺀다. 화면에서만 지우면 직접 UPDATE로 되살아나고, 그때 상신이
--       막히는 이유를 화면 어디에서도 설명하지 못한다.
--   (3) 열 주석을 세 값으로 고친다.
--
-- 건드리지 않는 것
--   · app.assert_budget_spend_submittable의 `SPEND_REQUIRED` 분기는 **그대로 둔다.** 제약이
--     값을 막고 있어 닿지 않는 길이며, 세 줄을 지우자고 150줄짜리 함수 전체를 다시 발행하면
--     이번 변경이 실제로 바꾸는 것보다 되돌릴 것이 많아진다. 값이 어떤 경로로든 되살아나면
--     그 분기가 여전히 옳게 판정한다.
--   · 문서(approval_documents)와 이미 고른 근거 품의(budget_source_document_id)는 손대지 않는다.
--     필수가 아니게 되었다고 이미 맺어진 근거를 끊지 않는다.
--
-- 재실행 안전: UPDATE는 대상이 없으면 0행, 제약은 drop 후 add, 주석은 덮어쓰기다.
--
-- 보안 게이트(docs/docs_dev/11_migration_security_gate.md): 해당 없음.
--   · 소유: OFFICE 사용 / ADMIN 관리, 데이터 등급: Internal, 범위: global.
--   · 신규 테이블·뷰·정책·트리거·RPC·Storage 정책·SECURITY DEFINER 함수 없음.
--   · GRANT/REVOKE 변경 없음, RLS 경계 불변, 개인정보 없음.
--   · 완화 방향 검토: 상신 시 근거 품의 강제가 사라진다. 대신 **틀린 근거가 붙지 않는다**는
--     쪽을 택한 것이며, 근거가 있는 지출의 차감·초과 판정 규칙은 무엇도 약해지지 않는다
--     (app.assert_budget_spend_submittable의 나머지 검사는 전부 그대로다).
-- =====================================================================

-- (1) 값 옮기기 — 제약을 좁히기 전에 한다.
update public.approval_forms
   set budget_link = 'SPEND_OPTIONAL'
 where budget_link = 'SPEND_REQUIRED';

-- (2) 고를 수 있는 값을 셋으로 좁힌다.
alter table public.approval_forms
  drop constraint if exists approval_forms_budget_link_chk;

alter table public.approval_forms
  add constraint approval_forms_budget_link_chk
  check (budget_link in ('NONE', 'SPEND_OPTIONAL', 'REVISE'));

-- (3) 주석 — 값의 뜻은 여기가 정본이다.
comment on column public.approval_forms.budget_link is
  '이 양식이 예산과 맺는 관계. NONE=없음 / SPEND_OPTIONAL=근거 품의를 고를 수 있다(지출결의서. '
  '고르는 것은 담당자의 판단이며 비어도 상신된다) / REVISE=예산 변경 품의(승인 시 대상 품의의 '
  '예산표를 이 문서의 예산표로 갈아끼운다). ''근거 품의 필수''는 2026-09-15에 폐지했다 — 문을 '
  '막으면 담당자가 상관없는 품의를 골라 통과시키고 예산이 엉뚱한 줄에서 깎인다. 예산표를 '
  '가졌는가는 이 값이 아니라 양식 필드에 BUDGET_TREE가 있는가가 답한다.';
