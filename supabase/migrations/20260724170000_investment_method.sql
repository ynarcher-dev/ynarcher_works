-- =====================================================================
-- FUND 포트폴리오 투자방식(investment_method) 신규 컬럼
--   투자 시 취득한 증권 종류(보통주 / CPS 전환우선주 / RCPS 상환전환우선주 / CB / BW 등).
--   라운드(stage: Series A 등)와 별개 축이며(기획 §2.3), 값 집합이 확장될 수 있어
--   enum이 아닌 text로 둔다(stage와 동일하게 자유 텍스트, UI는 Select로 제약).
--
-- 보안 게이트(docs/docs_dev/11_migration_security_gate.md)
--   · nullable 컬럼 1개 추가만 — 신규 테이블/RLS/정책/RPC/DEFINER/Storage 없음 → 대상 항목 없음.
--   · 기존 investments RLS(FUND 스코프)가 컬럼 무관이라 신규 컬럼을 그대로 커버.
-- 근거: 3_5_workspace_fund.md §2.3(투자방식 RCPS/보통주/CPS)
-- =====================================================================

alter table public.investments
  add column if not exists investment_method text;  -- 투자방식(보통주/CPS/RCPS/CB/BW 등)

comment on column public.investments.investment_method is
  '투자방식(취득 증권 종류): 보통주/CPS/RCPS/CB/BW 등. 라운드(stage)와 별개 축.';
