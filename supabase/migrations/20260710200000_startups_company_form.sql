-- =====================================================================
-- 스타트업 풀 상세: '회사 형태' 컬럼 추가 (법인/개인/예비)
-- - 기본 데이터의 사업자등록번호 좌측에 노출. 고정 3값(법인·개인·예비)이라 태그 관리 대신
--   text 컬럼 + 프론트 고정 선택으로 관리한다.
-- - RLS: startups 는 이미 RLS 활성 + 정책 존재. 신규 컬럼은 기존 정책 상속 → 추가 정책 불요.
-- - 물리 삭제/DELETE 정책 없음. 신규 RPC/SECURITY DEFINER/Storage 정책 없음.
-- 근거: docs/docs_dev/11_migration_security_gate.md, 20260710120000_startups_pool_columns.sql
-- =====================================================================

alter table public.startups
  add column if not exists company_form text;

comment on column public.startups.company_form is
  '회사 형태: 법인 | 개인 | 예비.';
