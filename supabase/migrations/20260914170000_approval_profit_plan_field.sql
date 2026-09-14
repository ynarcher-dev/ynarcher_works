-- =====================================================================
-- 수지 계획 필드(PROFIT_PLAN) — 저장 형태를 원장 주석에 적는다.
--
-- 스키마 변경이 아니다. 양식 필드는 `approval_form_versions.fields`(jsonb)에 자유 형태로
-- 담기므로 새 종류를 더하는 데 DDL이 필요하지 않다. 그래도 이 마이그레이션을 두는 이유는
-- **저장 형태의 정본이 이 열 주석**이기 때문이다(apps/works/src/features/approval/fields.ts
-- 머리 주석이 그렇게 가리킨다). 코드가 새 값을 쓰기 시작했는데 주석이 옛 목록을 들고 있으면,
-- 나중에 이 원장을 여는 사람은 문서에 왜 객체가 들어 있는지 답할 곳이 없다.
--
-- 함께 밀린 것도 같이 적는다 — 주석은 TEXT/TEXTAREA/RICHTEXT/NUMBER/MONEY/DATE/SELECT/TABLE
-- 여덟에서 멈춰 있었고, 그 뒤로 HTML_TEMPLATE(20260911194500)·BUDGET_TREE(20260911140000)가
-- 이미 들어와 쓰이고 있었다.
--
-- 수지 계획의 값은 **두 칸짜리 객체**(`{"revenue": "...", "budget": "..."}`)다. 이익 칸은
-- 두지 않는다 — 이익은 적는 값이 아니라 매출 − 예산이고, 세 칸을 다 받으면 셋이 서로
-- 어긋난 문서가 결재를 통과한다. 대표 금액 해석(app.approval_primary_amount)은 이 종류를
-- 보지 않는다: 계획은 결재가 승인하는 **계획**이지 문서가 집행하는 금액이 아니다.
--
-- 보안 게이트(docs/docs_dev/11_migration_security_gate.md): 해당 없음.
--   · 신규 테이블·RPC·Storage 정책·SECURITY DEFINER 함수 없음. 권한 변경 없음.
--   · 데이터 변경 없음(주석 한 줄만 바뀐다). RLS 경계 불변.
-- =====================================================================

comment on column public.approval_form_versions.fields is
  '필드 스키마(jsonb 배열). 각 원소: {key, label, type, required?, options?, primaryAmount?, '
  'columns?, levels?, defaultValue?, htmlAssets?, help?}. '
  'type ∈ TEXT/TEXTAREA/RICHTEXT/HTML_TEMPLATE/NUMBER/MONEY/DATE/SELECT/TABLE/BUDGET_TREE/PROFIT_PLAN. '
  'TABLE·BUDGET_TREE는 columns(열 정의 배열)를 갖고, 값은 각각 행 객체 배열과 층 있는 표다. '
  'HTML_TEMPLATE의 값은 {"html": "..."}이고, PROFIT_PLAN(수지 계획)의 값은 '
  '{"revenue": "예상 매출", "budget": "예상 예산"} 두 칸이다 — 예상 이익은 그 차액이라 '
  '저장하지 않고 읽는 쪽이 뺀다. '
  'primaryAmount=true인 MONEY/NUMBER 필드(또는 TABLE·BUDGET_TREE의 열)가 문서 대표 금액(amount)의 '
  '원천이며 app.approval_primary_amount()가 해석한다(PROFIT_PLAN은 그 해석 대상이 아니다). '
  '버전 행은 불변 — 양식 수정은 새 버전 발행이다';
