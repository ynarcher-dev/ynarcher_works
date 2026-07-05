-- =====================================================================
-- [Phase 2] 핵심 신원/권한 테이블
-- - departments: 부서(부서 Scope 기준)
-- - users: 앱 사용자 마스터(임직원=auth 연동, 게스트=커스텀 JWT)
-- - workspace_permissions: 사용자별 워크스페이스 권한/범위(만료 포함)
-- - permission_templates: 사용자 유형별 기본 권한 매트릭스(시드 대상)
-- 근거: docs/docs_dev/2_auth_permissions_architecture.md §2,§5,§6
-- =====================================================================

-- 부서 -------------------------------------------------------------------
create table if not exists public.departments (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz
);

-- 사용자 마스터 ----------------------------------------------------------
-- 임직원 마스터의 원장은 MANAGEMENT 워크스페이스이며, 본 테이블은 인증/권한
-- 판정을 위한 통합 사용자 레코드이다. (외부 게스트도 여기에 레코드를 가진다)
create table if not exists public.users (
  id             uuid primary key default gen_random_uuid(),
  -- 임직원 표준 JWT 연동(auth.users.id). 게스트는 null.
  auth_user_id   uuid unique,
  user_type      public.user_type not null,
  email          text,
  name           text not null,
  department_id  uuid references public.departments(id),
  -- 외부 스타트업 계정이 소속된 기업(startups). FK는 networks 마이그레이션에서 추가.
  company_id     uuid,
  -- 세션 무효화(강제 로그아웃)용 버전. 커스텀 JWT 페이로드와 대조.
  session_version integer not null default 1,
  is_active      boolean not null default true,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  deleted_at     timestamptz
);
create index if not exists idx_users_auth_user_id on public.users (auth_user_id);
create index if not exists idx_users_user_type on public.users (user_type);
create index if not exists idx_users_company_id on public.users (company_id);

-- 워크스페이스별 권한/범위 --------------------------------------------------
create table if not exists public.workspace_permissions (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references public.users(id) on delete cascade,
  workspace_key    public.workspace_key not null,
  permission_level public.permission_level not null default 'none',
  scope_type       public.scope_type not null default 'none',
  scope_id         uuid,
  -- 임시 권한 만료(now() < expires_at 이어야 유효). null이면 무기한.
  expires_at       timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (user_id, workspace_key)
);
create index if not exists idx_wsperm_user on public.workspace_permissions (user_id);

-- 사용자 유형별 기본 권한 템플릿(시드 원천) ----------------------------------
create table if not exists public.permission_templates (
  id               uuid primary key default gen_random_uuid(),
  user_type        public.user_type not null,
  workspace_key    public.workspace_key not null,
  permission_level public.permission_level not null,
  scope_type       public.scope_type not null,
  unique (user_type, workspace_key)
);

-- updated_at 트리거
drop trigger if exists trg_departments_updated_at on public.departments;
create trigger trg_departments_updated_at before update on public.departments
  for each row execute function app.set_updated_at();

drop trigger if exists trg_users_updated_at on public.users;
create trigger trg_users_updated_at before update on public.users
  for each row execute function app.set_updated_at();

drop trigger if exists trg_wsperm_updated_at on public.workspace_permissions;
create trigger trg_wsperm_updated_at before update on public.workspace_permissions
  for each row execute function app.set_updated_at();
