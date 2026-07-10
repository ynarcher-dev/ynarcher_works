-- =====================================================================
-- 스타트업 풀 상세: 로고(사진)·이메일·연락처 컬럼 추가
-- - 스타트업 풀 상세페이지 '기본 데이터' 카드를 NETWORKS 상세와 동일한 구성
--   (사진 + 이름/배지 + 연락처·이메일 정보행)으로 만들기 위한 컬럼 3종.
--   · logo_url : 로고/사진. NETWORKS profile.photo와 동일하게 2MB 이하 data URL(또는 URL)을 담는다.
--   · email    : 이메일(nullable).
--   · phone    : 연락처(nullable, 숫자만 저장 관례).
-- - RLS: startups 는 이미 RLS 활성 + SELECT/INSERT/UPDATE 정책 존재
--        (20260705120500_rls_enable_policies.sql). 신규 컬럼은 기존 정책을 상속하므로 추가 정책 불요.
-- - 물리 삭제/DELETE 정책 없음. 신규 RPC/SECURITY DEFINER/Storage 정책 없음.
--   이메일·연락처는 개인정보이나, 목록/상세 노출 정책은 기존 startups 접근 경계를 따른다.
-- 근거: docs/docs_dev/11_migration_security_gate.md,
--       20260705120400_networks_master.sql(startups 정의)
-- =====================================================================

alter table public.startups
  add column if not exists logo_url text,
  add column if not exists email    text,
  add column if not exists phone    text;

comment on column public.startups.logo_url is
  '로고/사진(2MB 이하 data URL 또는 URL). NETWORKS profile.photo와 동일 방식.';
comment on column public.startups.email is '이메일(nullable).';
comment on column public.startups.phone is '연락처(숫자만 저장, nullable).';
