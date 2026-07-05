-- =====================================================================
-- [Phase 2] RLS 헬퍼 함수 (2계층 구조)
-- - 기저 헬퍼: current_app_user_id(), current_app_role()
--   → 표준 JWT(임직원)/커스텀 JWT(게스트) 차이와 session_version 대조를 흡수
-- - 업무 헬퍼: is_admin(), can_read/write_workspace(), get_scope_*, can_access_*
--   → 모든 정책은 auth.jwt()를 직접 파싱하지 않고 이 헬퍼만 경유
-- 근거: docs/docs_dev/3_database_rls_policy_matrix.md §3, 1_development_stack.md §2
-- =====================================================================

-- [기저] 현재 요청자의 앱 사용자 ID -----------------------------------------
-- 1) 커스텀 게스트 JWT: app_user_id 클레임 우선
-- 2) 임직원 표준 JWT: auth.uid() → users.auth_user_id 매핑
-- 3) session_version 클레임이 있으면 DB 값과 대조(불일치 시 즉시 무효)
-- 4) 활성/미삭제 계정만 유효
create or replace function app.current_app_user_id()
returns uuid
language plpgsql
stable
security definer
set search_path = app, public, auth
as $$
declare
  claims     jsonb := auth.jwt();
  claim_uid  text;
  claim_ver  integer;
  db_ver     integer;
  resolved   uuid;
begin
  claim_uid := claims ->> 'app_user_id';

  if claim_uid is not null and claim_uid <> '' then
    resolved := claim_uid::uuid;
  else
    select u.id into resolved
      from public.users u
     where u.auth_user_id = auth.uid();
  end if;

  if resolved is null then
    return null;
  end if;

  claim_ver := nullif(claims ->> 'session_version', '')::integer;
  if claim_ver is not null then
    select session_version into db_ver from public.users where id = resolved;
    if db_ver is distinct from claim_ver then
      return null; -- 세션 무효화(강제 로그아웃)
    end if;
  end if;

  if not exists (
    select 1 from public.users
     where id = resolved and is_active and deleted_at is null
  ) then
    return null;
  end if;

  return resolved;
end;
$$;

-- [기저] 현재 요청자의 사용자 유형(역할) ------------------------------------
create or replace function app.current_app_role()
returns text
language sql
stable
security definer
set search_path = app, public
as $$
  select u.user_type::text
    from public.users u
   where u.id = app.current_app_user_id();
$$;

-- [업무] 최고 관리자 여부 ---------------------------------------------------
create or replace function app.is_admin()
returns boolean
language sql
stable
security definer
set search_path = app, public
as $$
  select coalesce(app.current_app_role() = 'super_admin', false);
$$;

-- [업무] 워크스페이스 읽기 권한(read 또는 write) ----------------------------
create or replace function app.can_read_workspace(ws_key text)
returns boolean
language sql
stable
security definer
set search_path = app, public
as $$
  select app.is_admin() or exists (
    select 1
      from public.workspace_permissions p
     where p.user_id = app.current_app_user_id()
       and p.workspace_key::text = ws_key
       and p.permission_level in ('read', 'write')
       and (p.expires_at is null or p.expires_at > now())
  );
$$;

-- [업무] 워크스페이스 쓰기 권한(write) --------------------------------------
create or replace function app.can_write_workspace(ws_key text)
returns boolean
language sql
stable
security definer
set search_path = app, public
as $$
  select app.is_admin() or exists (
    select 1
      from public.workspace_permissions p
     where p.user_id = app.current_app_user_id()
       and p.workspace_key::text = ws_key
       and p.permission_level = 'write'
       and (p.expires_at is null or p.expires_at > now())
  );
$$;

-- [업무] 워크스페이스 내 데이터 범위 유형 반환 -------------------------------
create or replace function app.get_scope_type(ws_key text)
returns text
language sql
stable
security definer
set search_path = app, public
as $$
  select coalesce((
    select p.scope_type::text
      from public.workspace_permissions p
     where p.user_id = app.current_app_user_id()
       and p.workspace_key::text = ws_key
       and (p.expires_at is null or p.expires_at > now())
     limit 1
  ), case when app.is_admin() then 'global' else 'none' end);
$$;

-- [업무] 워크스페이스 내 범위 기준 ID 반환 ----------------------------------
create or replace function app.get_scope_id(ws_key text)
returns uuid
language sql
stable
security definer
set search_path = app, public
as $$
  select p.scope_id
    from public.workspace_permissions p
   where p.user_id = app.current_app_user_id()
     and p.workspace_key::text = ws_key
     and (p.expires_at is null or p.expires_at > now())
   limit 1;
$$;

-- [업무] 특정 프로그램 접근 가능 여부(AC) -----------------------------------
-- 전사(global) 또는 담당 프로그램(program scope 일치) 시 허용.
-- 외부 스타트업/전문가의 배정 기반 접근은 배정 테이블 도입(Phase 7) 시 확장.
create or replace function app.can_access_program(target_program_id uuid)
returns boolean
language sql
stable
security definer
set search_path = app, public
as $$
  select app.is_admin()
      or app.get_scope_type('ac') = 'global'
      or (app.get_scope_type('ac') = 'program' and app.get_scope_id('ac') = target_program_id);
$$;

-- [업무] 특정 기업 접근 가능 여부 -------------------------------------------
-- 내부 networks 열람자(global) 또는 본인 소속 기업(외부 스타트업)만 허용.
create or replace function app.can_access_company(target_company_id uuid)
returns boolean
language sql
stable
security definer
set search_path = app, public
as $$
  select app.is_admin()
      or (app.can_read_workspace('networks') and app.get_scope_type('networks') = 'global')
      or exists (
        select 1 from public.users u
         where u.id = app.current_app_user_id()
           and u.company_id = target_company_id
      );
$$;

-- [업무] 특정 펀드 접근 가능 여부(FUND) -------------------------------------
create or replace function app.can_access_fund(target_fund_id uuid)
returns boolean
language sql
stable
security definer
set search_path = app, public
as $$
  select app.is_admin()
      or app.get_scope_type('fund') = 'global'
      or (app.get_scope_type('fund') = 'fund' and app.get_scope_id('fund') = target_fund_id);
$$;
