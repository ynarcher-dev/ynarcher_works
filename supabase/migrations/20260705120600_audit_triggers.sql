-- =====================================================================
-- [Phase 2] 감사 로그 트리거
-- workspace_permissions 의 권한(permission_level) 변경 시 audit_logs에 자동 적재.
-- - SECURITY DEFINER: 테이블 소유자 권한으로 실행되어 audit_logs RLS(직접 INSERT 차단)를 통과
-- - 사유/IP/UA는 Edge Function이 세션 GUC로 주입: app.audit_reason / app.request_ip / app.user_agent
-- 근거: docs/docs_dev/2_auth_permissions_architecture.md §7,§8-5
-- =====================================================================

create or replace function app.audit_permission_change()
returns trigger
language plpgsql
security definer
set search_path = app, public
as $$
begin
  insert into public.audit_logs (
    actor_user_id, target_user_id, action, changed_workspace,
    before_permission, after_permission, reason, request_ip, user_agent
  )
  values (
    app.current_app_user_id(),
    new.user_id,
    'PERMISSION_CHANGE',
    new.workspace_key::text,
    case when tg_op = 'UPDATE' then old.permission_level::text else null end,
    new.permission_level::text,
    nullif(current_setting('app.audit_reason', true), ''),
    nullif(current_setting('app.request_ip', true), '')::inet,
    nullif(current_setting('app.user_agent', true), '')
  );
  return new;
end;
$$;

drop trigger if exists trg_audit_permission_change on public.workspace_permissions;
create trigger trg_audit_permission_change
  after insert or update of permission_level on public.workspace_permissions
  for each row execute function app.audit_permission_change();
