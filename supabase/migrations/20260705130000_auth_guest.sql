-- =====================================================================
-- [Phase 3] 이원화 인증 지원 스키마
-- - guest_invitations: 게스트 사전 등록(삼각 매핑 검증) + OTP 발급/만료/사용 관리
-- - custom_access_token_hook: 임직원 표준 JWT에 app_user_id/app_role/session_version 주입
-- 근거: docs/docs_planning/1_roles_permissions.md §3, 1_development_stack.md §2
-- =====================================================================

-- 게스트 초대/OTP -------------------------------------------------------
create table if not exists public.guest_invitations (
  id                uuid primary key default gen_random_uuid(),
  business_code     text not null,                 -- 사업 고유코드 (예: AC-2026-003)
  name              text not null,                 -- 사전 등록된 이름
  email             text,
  phone             text,
  invited_user_type public.user_type not null default 'temporary_guest',
  company_id        uuid references public.startups(id),
  target_type       text,                          -- 'PROGRAM' | 'DEAL' | 'FUND' ...
  target_id         uuid,
  app_user_id       uuid references public.users(id),  -- 인증 성공 시 연결된 앱 사용자
  otp_hash          text,                          -- 최근 발급 OTP 해시(평문 저장 금지)
  otp_expires_at    timestamptz,                   -- OTP 만료(발급 후 3분)
  otp_attempts      integer not null default 0,    -- OTP 검증 시도 횟수(무차별 대입 방지)
  invite_expires_at timestamptz not null default (now() + interval '30 days'),
  used_at           timestamptz,
  created_by        uuid references public.users(id),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index if not exists idx_guest_inv_code on public.guest_invitations (business_code);
create index if not exists idx_guest_inv_email on public.guest_invitations (email);
create index if not exists idx_guest_inv_phone on public.guest_invitations (phone);

drop trigger if exists trg_guest_inv_updated_at on public.guest_invitations;
create trigger trg_guest_inv_updated_at before update on public.guest_invitations
  for each row execute function app.set_updated_at();

alter table public.guest_invitations enable row level security;

-- 내부 실무자(비게스트)만 초대 관리. OTP 발급/검증은 Edge Function(service_role)이 수행.
drop policy if exists guest_inv_select on public.guest_invitations;
create policy guest_inv_select on public.guest_invitations for select
  using (
    app.is_admin()
    or (app.current_app_user_id() is not null
        and app.current_app_role() not in ('external_startup', 'external_expert', 'temporary_guest'))
  );
drop policy if exists guest_inv_insert on public.guest_invitations;
create policy guest_inv_insert on public.guest_invitations for insert
  with check (app.is_admin() or app.can_write_workspace('ac') or app.can_write_workspace('guest'));
drop policy if exists guest_inv_update on public.guest_invitations;
create policy guest_inv_update on public.guest_invitations for update
  using (app.is_admin() or app.can_write_workspace('ac') or app.can_write_workspace('guest'))
  with check (app.is_admin() or app.can_write_workspace('ac') or app.can_write_workspace('guest'));

-- 커스텀 액세스 토큰 훅 --------------------------------------------------
-- 임직원 표준 JWT 발급 시 app 사용자 식별/역할/세션버전 클레임을 주입한다.
-- (RLS 기저 헬퍼 current_app_user_id()가 app_user_id 클레임을 우선 사용)
create or replace function app.custom_access_token_hook(event jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = app, public
as $$
declare
  claims  jsonb := coalesce(event -> 'claims', '{}'::jsonb);
  u       record;
begin
  select id, user_type, session_version
    into u
    from public.users
   where auth_user_id = (event ->> 'user_id')::uuid
     and is_active and deleted_at is null;

  if u.id is not null then
    claims := jsonb_set(claims, '{app_user_id}',    to_jsonb(u.id));
    claims := jsonb_set(claims, '{app_role}',       to_jsonb(u.user_type::text));
    claims := jsonb_set(claims, '{session_version}',to_jsonb(u.session_version));
  end if;

  return jsonb_set(event, '{claims}', claims);
end;
$$;

-- Supabase Auth 서비스가 훅을 실행할 수 있도록 권한 부여(로컬/원격 환경 한정)
do $$ begin
  grant execute on function app.custom_access_token_hook(jsonb) to supabase_auth_admin;
  grant usage on schema app to supabase_auth_admin;
exception when undefined_object then null; end $$;
