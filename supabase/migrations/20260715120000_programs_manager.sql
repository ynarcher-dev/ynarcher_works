-- =====================================================================
-- [Phase 7] programs 프로그램 담당자(manager_id) 컬럼 추가
-- 목적: 프로그램 목록/상세에 '담당자'(관리 주체)를 노출한다. 등록자(created_by)와 별개 축이다.
--   - created_by: 최초 등록자(불변, 이력)
--   - manager_id: 현재 담당자(내부 사용자, 재지정 가능)
-- 멱등: add column if not exists / create index if not exists 로 재적용 안전.
-- 보안 게이트(11_migration_security_gate.md):
--   - 신규 테이블/RPC/Storage/SECURITY DEFINER 없음. 기존 programs 테이블에 nullable FK 컬럼 1개 추가만.
--   - programs는 이미 RLS 활성(20260705150500_ac_rls.sql)이며 SELECT/INSERT/UPDATE 정책이
--     행 단위로 모든 컬럼을 커버한다(컬럼 단위 GRANT 제한 없음) → 신규 정책 불필요.
--   - DELETE 미선언(soft delete 유지). 개인정보 원본/다운로드/Export/권한 변경 영향 없음(Internal 등급, 내부 사용자 참조).
-- 근거: 20260705150100_ac_core.sql(programs 스키마), 20260705150500_ac_rls.sql(RLS 정책)
-- =====================================================================

alter table public.programs
  add column if not exists manager_id uuid references public.users(id);

create index if not exists idx_programs_manager on public.programs (manager_id);

comment on column public.programs.manager_id is
  '프로그램 담당자(관리 주체, 내부 사용자). 등록자(created_by)와 별개 축이며 재지정 가능.';
