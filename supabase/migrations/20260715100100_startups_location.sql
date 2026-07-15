-- =====================================================================
-- 스타트업 풀 소재지/상세주소 컬럼 추가
-- - public.startups 에 소재지(location) + 상세주소(address_detail) 2개 컬럼을 추가한다.
--   · location       : 소재지(시·도 등). location_tags 원장의 태그명(text)을 저장한다.
--                      stage/pool_status 와 동일한 태그명 문자열 저장 패턴(FK 아님).
--   · address_detail : 상세주소(자유 텍스트).
-- - RLS: startups 는 이미 RLS 활성 + SELECT/INSERT/UPDATE 정책 존재. 신규 컬럼은
--        기존 테이블 정책을 그대로 상속하므로 추가 정책이 필요 없다.
-- - 물리 삭제/DELETE 정책 없음(soft delete 유지). 신규 RPC/SECURITY DEFINER/Storage 정책 없음.
--   개인정보·다운로드·Export·권한 변경 영향 없음(Internal 등급 nullable 텍스트 2종).
-- 근거: docs/docs_dev/11_migration_security_gate.md,
--       20260710120000_startups_pool_columns.sql(동일 패턴 컬럼 추가),
--       20260715100000_location_tags.sql(소재지 태그 원장)
-- =====================================================================

alter table public.startups
  add column if not exists location       text,
  add column if not exists address_detail text;

comment on column public.startups.location is
  '소재지(시·도 등). location_tags 원장의 태그명(text)을 저장한다.';
comment on column public.startups.address_detail is
  '상세주소(자유 텍스트).';
