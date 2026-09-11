-- =====================================================================
-- Restore the cumulative GUEST audit action allowlist.
--
-- Several later migrations replaced app.log_guest_access while adding one
-- action, but copied only a subset of earlier actions. As a result account
-- issuance reached its mandatory audit step and failed with SQLSTATE 22023.
-- Keep every action currently emitted by a GUEST RPC in one allowlist.
--
-- Security gate: no new data or access path. This SECURITY DEFINER function
-- only inserts an audit row, has a pinned empty search_path, and actor identity
-- is always derived from the JWT rather than a caller argument.
-- =====================================================================

create or replace function app.log_guest_access(
  p_target_user_id uuid,
  p_action         text,
  p_after          text,
  p_data           jsonb,
  p_reason         text
)
returns void
language plpgsql
security definer
set search_path = ''
as $fn$
begin
  if p_action not in (
    'GUEST_ACCESS_OPEN',
    'GUEST_ACCESS_CLOSE',
    'GUEST_ACCESS_REOPEN',
    'GUEST_ACCESS_REMOVE',
    'GUEST_ACCESS_WINDOW',
    'GUEST_ACCOUNT_ISSUE',
    'GUEST_ACCOUNT_RESTORE',
    'GUEST_ACCOUNT_SUSPEND',
    'GUEST_IDENTITY_ADD',
    'GUEST_PASSWORD_RESET',
    'GUEST_PASSWORD_RESET_SEND'
  ) then
    raise exception '허용되지 않은 감사 액션입니다: %', p_action using errcode = '22023';
  end if;

  insert into public.audit_logs (
    actor_user_id,
    target_user_id,
    action,
    changed_workspace,
    after_permission,
    after_data,
    reason
  )
  values (
    app.current_app_user_id(),
    p_target_user_id,
    p_action,
    'guest',
    p_after,
    p_data,
    p_reason
  );
end;
$fn$;

revoke all on function app.log_guest_access(uuid, text, text, jsonb, text)
  from public, anon, service_role;
grant execute on function app.log_guest_access(uuid, text, text, jsonb, text)
  to authenticated;

comment on function app.log_guest_access(uuid, text, text, jsonb, text) is
  'GUEST 계정·접근·비밀번호 작업의 감사 로그 전용 창구. 허용 목록은 현재 모든 GUEST RPC가 내는 액션의 누적 집합이며, actor는 JWT의 현재 앱 사용자에서만 읽는다.';
