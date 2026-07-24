-- =====================================================================
-- FUND 유형구분(fund_strategy_type)에 PROJECT·BLIND 추가
--   사이드바 유형 탭을 AC/VC/PE → +프로젝트/+블라인드로 확장한다.
--
-- 보안 게이트(docs/docs_dev/11_migration_security_gate.md)
--   · enum 값 추가만 — 신규 테이블/RLS/정책/RPC/SECURITY DEFINER/Storage 없음 → 대상 항목 없음.
--   · 기존 funds.strategy_type RLS·정책 불변(값 추가는 가산적).
-- 근거: 20260724100000_fund_classification_columns.sql(fund_strategy_type 정의)
-- =====================================================================

alter type public.fund_strategy_type add value if not exists 'PROJECT';
alter type public.fund_strategy_type add value if not exists 'BLIND';
