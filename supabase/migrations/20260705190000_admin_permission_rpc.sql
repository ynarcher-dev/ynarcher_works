-- =====================================================================
-- [Phase 10] ADMIN 워크스페이스 — 동적 권한 제어 RPC
-- 역할(user_type)×워크스페이스 Read/Write를 UI에서 토글하면:
--   1) permission_templates(기본 매트릭스) 갱신
--   2) 해당 역할 사용자들의 workspace_permissions에 실시간 전파(세션 권한 즉시 반영)
--   3) audit_logs에 변경 전/후 증적 기록
-- 안전장치: 재귀 잠금 방지(super_admin의 admin write 해제 원천 차단).
-- 근거: docs_planning/3_2_workspace_admin.md §1.1, §2
-- =====================================================================

create or replace function public.admin_set_permission_template(
  p_user_type    text,
  p_workspace_key text,
  p_level        text
)
returns void
language plpgsql
security definer
set search_path = app, public
as $$
declare
  v_actor      uuid := app.current_app_user_id();
  v_before     text;
  v_scope      public.scope_type;
begin
  -- 권한: ADMIN 쓰기 보유자(사실상 최고 관리자)만 조작 가능
  if not app.can_write_workspace('admin') then
    raise exception '권한이 없습니다.' using errcode = '42501';
  end if;

  if p_level not in ('none','read','write') then
    raise exception '허용되지 않은 권한 단계입니다: %', p_level using errcode = '22023';
  end if;

  -- 재귀 잠금 방지: 최고 관리자의 ADMIN 쓰기 권한은 해제할 수 없다
  if p_user_type = 'super_admin' and p_workspace_key = 'admin' and p_level <> 'write' then
    raise exception '시스템 관리자 권한은 해제할 수 없습니다.' using errcode = 'P0001';
  end if;

  -- 변경 전 값/범위 조회(없으면 기본값)
  select permission_level::text, scope_type
    into v_before, v_scope
    from public.permission_templates
   where user_type = p_user_type::public.user_type
     and workspace_key = p_workspace_key::public.workspace_key;

  v_before := coalesce(v_before, 'none');
  v_scope  := coalesce(v_scope, 'global');

  -- 1) 템플릿 갱신(멱등 upsert)
  insert into public.permission_templates (user_type, workspace_key, permission_level, scope_type)
  values (p_user_type::public.user_type, p_workspace_key::public.workspace_key,
          p_level::public.permission_level, v_scope)
  on conflict (user_type, workspace_key)
    do update set permission_level = excluded.permission_level;

  -- 2) 해당 역할 사용자들의 실 권한에 전파(세션 즉시 반영)
  insert into public.workspace_permissions (user_id, workspace_key, permission_level, scope_type)
  select u.id, p_workspace_key::public.workspace_key, p_level::public.permission_level, v_scope
    from public.users u
   where u.user_type = p_user_type::public.user_type
     and u.deleted_at is null
  on conflict (user_id, workspace_key)
    do update set permission_level = excluded.permission_level;

  -- 3) 감사 로그 기록
  insert into public.audit_logs
    (actor_user_id, action, changed_workspace, before_permission, after_permission,
     before_data, after_data)
  values
    (v_actor, 'PERMISSION_CHANGE', p_workspace_key, v_before, p_level,
     jsonb_build_object('user_type', p_user_type, 'level', v_before),
     jsonb_build_object('user_type', p_user_type, 'level', p_level));
end;
$$;

revoke all on function public.admin_set_permission_template(text, text, text) from public;
grant execute on function public.admin_set_permission_template(text, text, text) to authenticated;
