-- =====================================================================
-- [Phase 2] 기반 스키마 및 열거형(Enum) 정의
-- - app 스키마: RLS 헬퍼 등 내부 전용 함수 격리(PostgREST 노출 차단)
-- - 전역 열거형: 워크스페이스 키 / 권한 단계 / 데이터 범위 / 사용자 유형
-- 근거: docs/docs_dev/2_auth_permissions_architecture.md §3~5
-- =====================================================================

create schema if not exists app;

-- 워크스페이스 식별 키 (9개 도메인) — §3.1
do $$ begin
  create type public.workspace_key as enum (
    'hub', 'networks', 'ac', 'fund', 'mna', 'project', 'management', 'admin', 'guest'
  );
exception when duplicate_object then null; end $$;

-- 워크스페이스 권한 단계 (3단계) — §3.2
do $$ begin
  create type public.permission_level as enum ('none', 'read', 'write');
exception when duplicate_object then null; end $$;

-- 데이터 접근 범위(Scope) — §4
do $$ begin
  create type public.scope_type as enum (
    'none', 'global', 'department', 'program', 'project', 'fund', 'company', 'self', 'temporary'
  );
exception when duplicate_object then null; end $$;

-- 사용자 유형 (11종) — §2
do $$ begin
  create type public.user_type as enum (
    'super_admin',          -- 최고 관리자
    'executive',            -- 경영진
    'management_support',   -- 경영지원/관리부서
    'ac_business',          -- AC 사업부
    'fund_manager',         -- 투자/FUND 담당자
    'mna_manager',          -- M&A 담당자
    'project_manager',      -- 프로젝트 담당자
    'external_startup',     -- 외부 스타트업
    'external_expert',      -- 외부 전문가
    'temporary_guest',      -- 임시 게스트
    'read_only'             -- 읽기 전용 사용자
  );
exception when duplicate_object then null; end $$;

-- 공통 updated_at 자동 갱신 트리거 함수
create or replace function app.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
