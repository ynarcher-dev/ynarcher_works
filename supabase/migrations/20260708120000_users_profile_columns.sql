-- =====================================================================
-- [Phase 7] 임직원 프로필 컬럼 추가 (인사 관리 상세/수정 모드)
-- - public.users 에 연락처(phone) + 자유 프로필(profile jsonb) 컬럼을 추가한다.
--   · phone   : 임직원 연락처(개인정보). 목록/상세 마스킹은 앱 계층(maskPhone + 민감정보 토글)에서 강제.
--   · profile : { company, position, bio, note } 등 자유 프로필(전문가 profile jsonb 패턴과 동일).
-- - RLS: users 는 이미 RLS 활성 + SELECT/INSERT/UPDATE 정책 존재
--        (users_update = admin OR can_write_workspace('management') OR self).
--        신규 컬럼은 기존 테이블 정책을 그대로 상속하므로 추가 정책이 필요 없다.
-- - 물리 삭제/DELETE 정책 없음(soft delete 유지). 신규 RPC/SECURITY DEFINER/Storage 정책 없음.
-- 근거: docs/docs_dev/11_migration_security_gate.md,
--       20260705120100_core_identity.sql(users 정의), 20260705120500_rls_enable_policies.sql(users RLS),
--       20260707120000_networks_unify_profile_schema.sql(profile jsonb 패턴)
-- =====================================================================

alter table public.users
  add column if not exists phone   text,
  add column if not exists profile jsonb not null default '{}'::jsonb;

comment on column public.users.phone is
  '임직원 연락처(개인정보). 목록/상세 마스킹은 앱 계층에서 강제(원본 노출은 민감정보 토글).';
comment on column public.users.profile is
  '임직원 자유 프로필(jsonb): company/position/bio/note 등. 전문가 profile 패턴과 동일.';
