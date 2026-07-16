-- =====================================================================
-- 프로그램 단계 이원화: 제안 단계 기간(제안서 작성~발표) 컬럼 신설
--   * 제안 단계(PROPOSED/NOT_SELECTED)  → proposal_start_date ~ proposal_end_date
--   * 운영 단계(DRAFT/OPERATING/FINISHED/CANCELLED) → 기존 start_date ~ end_date
--     (기존 start_date/end_date 는 "운영 기간(실제 행사 관리 기간)"으로 의미 확정)
-- 상태값(program_status enum)은 변경 없음 — 20260715140000 수명주기 그대로.
-- 보안 게이트(11_migration_security_gate.md):
--   - 신규 테이블/RPC/Storage 정책/SECURITY DEFINER 없음. nullable 컬럼 2개 추가만.
--   - RLS·권한 경계·감사 로그·개인정보 영향 없음. 멱등(add column if not exists).
-- =====================================================================

alter table public.programs
  add column if not exists proposal_start_date date,
  add column if not exists proposal_end_date date;

comment on column public.programs.proposal_start_date is '제안 단계 시작일(제안서 작성~발표 기간의 시작)';
comment on column public.programs.proposal_end_date is '제안 단계 종료일(제안서 작성~발표 기간의 끝)';
comment on column public.programs.start_date is '운영 기간 시작일(실제 행사 관리 기간)';
comment on column public.programs.end_date is '운영 기간 종료일(실제 행사 관리 기간)';
