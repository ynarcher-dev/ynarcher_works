-- =====================================================================
-- FUND 포트폴리오 투자 건 POST 밸류(post_valuation) 신규 컬럼
--   기존 investments.valuation은 PRE 밸류(투자 시점 기업가치)를 담는다(20260723120000).
--   포트폴리오 표에 PRE/POST를 나란히 노출하기 위해 POST 밸류 컬럼을 추가한다(기획 §2.3).
--   라운드=stage, PRE=valuation, 집행액=amount는 기존 그대로 사용한다.
--
--   구분(management_status)·관리현황(pool_status)·대표자·설립일·소재지·업종·아이템(한줄소개)·
--   딜메이커(startup_managers 리드)는 모두 startups 마스터에서 조인해 오며 investments에
--   중복 저장하지 않는다(사용자 확정: "구분·관리현황은 스타트업 데이터를 그대로 호출").
--
-- 보안 게이트(docs/docs_dev/11_migration_security_gate.md)
--   · nullable 컬럼 1개 추가만 — 신규 테이블/RLS/정책/RPC/DEFINER/Storage 없음 → 대상 항목 없음.
--   · 기존 investments RLS(FUND 스코프)가 컬럼 무관이라 신규 컬럼을 그대로 커버.
-- 근거: 20260723120000_fund_investment_link.sql(valuation=PRE 컬럼 추가), 3_5_workspace_fund.md §2.3
-- =====================================================================

alter table public.investments
  add column if not exists post_valuation numeric(18,2);  -- POST 밸류(투자 후 기업가치)

comment on column public.investments.post_valuation is
  'POST 밸류(투자 후 기업가치). PRE 밸류는 valuation 컬럼.';
