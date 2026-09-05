-- =====================================================================
-- 스타트업 상세 '요약' 섹션 3축(강점 · 보완점 · 필요사항) — 컬럼 주석 갱신
-- - 상세페이지 '요약' 섹션(기업 개요 위) 카드 3종이 쓰는 값으로, 신규 컬럼을 만들지 않고
--   기존 정성 정보 jsonb(business_profile) 안에 문장 배열 3종을 함께 담는다.
--     · strengths / improvements / needs : text[] (각 최대 3문장, 빈 문장은 앱이 저장 전에 떨어뜨림)
--   별도 컬럼을 만들지 않는 이유는 같은 성격의 값이기 때문이다 — 비즈니스 모델·경쟁 우위와
--   마찬가지로 담당자가 문장으로 적는 정성 서술이라, 컬럼을 나누면 이 섹션의 최종 수정 시각
--   (business_profile_updated_at)이 무엇의 시각인지 답할 수 없게 된다.
--   상한(3문장)은 DB 제약이 아니라 입력 자리 수(폼의 3줄)와 저장 직전 slice가 함께 지킨다 —
--   jsonb CHECK는 옛 행까지 소급 검증해 이미 저장된 값의 저장 자체를 막는다.
-- - 스키마 변경 없음(주석만 갱신). 신규 테이블/RPC/SECURITY DEFINER/Storage 정책 없음.
--   RLS: startups 기존 정책 그대로 상속. 개인정보 없음, 물리 삭제 없음.
-- 근거: docs/docs_dev/11_migration_security_gate.md, 20260710150000_startups_business_team.sql
-- =====================================================================

comment on column public.startups.business_profile is
  '비즈니스 정성 정보 jsonb: { oneLiner, businessModel, targetMarket, competitiveEdge, '
  'strengths[], improvements[], needs[] } — 뒤 3종은 상세 요약 섹션 축(각 최대 3문장).';
