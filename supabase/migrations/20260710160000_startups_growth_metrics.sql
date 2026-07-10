-- =====================================================================
-- 스타트업 풀 상세: '성장 지표' 컬럼 추가 (연도별 지표 + 비즈니스 현황 타임라인)
-- - 스타트업 상세페이지 '성장 지표' 섹션(재무/매출/고용/투자 현황 + 비즈니스 현황)용.
--   통합 수정(저장 시 통째 교체) 모델에 맞춰 별도 테이블 대신 jsonb 배열로 저장한다.
--   · growth_metrics : [{ year, assets, liabilities, equity, revenue, operatingProfit,
--                          netIncome, employeeCount, valuation, fundingAmount,
--                          fundingRound, investor }]  (연도별 1개 객체)
--   · business_status: [{ date, content }]  (비즈니스 현황 타임라인)
-- - RLS: startups 는 이미 RLS 활성 + SELECT/INSERT/UPDATE 정책 존재
--        (20260705120500_rls_enable_policies.sql). 신규 컬럼은 기존 정책 상속 → 추가 정책 불요.
-- - 물리 삭제/DELETE 정책 없음. 신규 RPC/SECURITY DEFINER/Storage 정책 없음. 개인정보 없음.
-- 근거: docs/docs_dev/11_migration_security_gate.md,
--       20260705120400_networks_master.sql(startups 정의)
-- =====================================================================

alter table public.startups
  add column if not exists growth_metrics  jsonb not null default '[]'::jsonb,
  add column if not exists business_status jsonb not null default '[]'::jsonb;

comment on column public.startups.growth_metrics is
  '연도별 성장 지표 배열: [{ year, assets, liabilities, equity, revenue, operatingProfit, netIncome, employeeCount, valuation, fundingAmount, fundingRound, investor }].';
comment on column public.startups.business_status is
  '비즈니스 현황 타임라인 배열: [{ date, content }].';
