-- =====================================================================
-- FUND 펀드유형(fund_type) 신규 컬럼 — 구분(strategy_type: AC/VC/PE)과 별개 축
--   펀드유형은 조합 구조(프로젝트/블라인드)로, 전략 구분(AC/VC/PE)과 다른 개념이다.
--   구분은 사이드바 탭 축으로 유지하고, 펀드유형은 컬럼·필터·배지로만 노출한다(탭 아님).
--
-- 참고: 20260724130000에서 fund_strategy_type에 추가한 PROJECT/BLIND는 이 분리로 미사용이 된다
--   (PostgreSQL은 enum 값 제거를 지원하지 않아 그대로 두되, UI는 fund_strategy_type에서
--    PROJECT/BLIND를 더 이상 제공하지 않는다). 신규 fund_type enum이 프로젝트/블라인드의 정본이다.
--
-- 보안 게이트(docs/docs_dev/11_migration_security_gate.md)
--   · enum 생성 + nullable 컬럼 추가만 — 신규 테이블/RLS/정책/RPC/DEFINER/Storage 없음 → 대상 항목 없음.
--   · 기존 funds RLS가 컬럼 무관이라 신규 컬럼을 그대로 커버.
-- 근거: 20260724100000_fund_classification_columns.sql(구분 enum 4종)
-- =====================================================================

do $$ begin create type public.fund_type as enum ('PROJECT','BLIND');
exception when duplicate_object then null; end $$;

alter table public.funds
  add column if not exists fund_type public.fund_type;  -- 펀드유형(프로젝트/블라인드)

comment on column public.funds.fund_type is
  '펀드유형: PROJECT(프로젝트)/BLIND(블라인드). 조합 구조 축이며 strategy_type(구분: AC/VC/PE)과 별개.';
