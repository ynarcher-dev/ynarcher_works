-- =====================================================================
-- 스타트업 풀 상세: '산업' 다중 선택(최대 3개) 지원 — industries jsonb 배열 추가
-- - 기존 산업은 단일 텍스트(startups.industry) 1개만 저장 가능했다. 상세 편집에서
--   ADMIN 산업 태그(industry_tags)를 최대 3개까지 고를 수 있도록 배열 컬럼을 신설한다.
--   · industries : ["핀테크", "AI", ...]  (태그명 문자열 배열, 최대 3개)
-- - 레거시 스칼라 컬럼(industry)은 유지한다. HUB 통합검색·M&A 매칭이 여전히 단일 업종을
--   텍스트로 읽으므로, 저장 시 프론트가 industries[0](대표 산업)을 industry에 미러링한다.
--   따라서 industries가 SSOT, industry는 대표값 미러(하위 호환)다.
-- - 백필: 기존 단일 industry 값이 있으면 1개짜리 배열로 초기화한다(값 유실 없음).
-- - RLS: startups 는 이미 RLS 활성 + SELECT/INSERT/UPDATE 정책 존재. 신규 컬럼은 기존
--        테이블 정책을 그대로 상속하므로 추가 정책이 필요 없다.
-- - 물리 삭제/DELETE 정책 없음. 신규 RPC/SECURITY DEFINER/Storage 정책 없음.
--   개인정보·다운로드·Export·권한 변경 영향 없음(Internal 등급 태그 문자열 배열 1종).
-- 근거: docs/docs_dev/11_migration_security_gate.md,
--       20260705120400_networks_master.sql(startups.industry 정의),
--       20260706120000_industry_tags.sql(산업 태그 원장), NetworkForm expertise(전문 분야) 패턴
-- =====================================================================

alter table public.startups
  add column if not exists industries jsonb not null default '[]'::jsonb;

comment on column public.startups.industries is
  '산업 태그(industry_tags) 다중 선택 배열(최대 3개). SSOT이며, 대표값(첫 번째)은 하위 호환용으로 industry 컬럼에 미러링된다.';

-- 백필: 기존 단일 industry 값을 1개짜리 배열로 승격(이미 채워진 행은 건너뜀).
update public.startups
  set industries = to_jsonb(array[industry])
  where industry is not null
    and industry <> ''
    and industries = '[]'::jsonb;
