-- =====================================================================
-- [보안 안정화 P0-2] workspace_key enum 정합화 2/2: 시드·정책·RPC의 hub 참조 갱신
-- 근거: docs/docs_dev/12_immediate_security_stabilization_tasks.md §3.2,
--       docs/docs_dev/2_auth_permissions_architecture.md §5(권한 템플릿 매트릭스 정본)
--
-- 보안 게이트(11_migration_security_gate.md) 검토:
-- - 신규 테이블 없음. 기존 RLS 정책의 워크스페이스 키 문자열('hub')만 'office'로 교체.
-- - 권한 판정은 기존 app.* 헬퍼를 그대로 경유(직접 JWT 파싱 없음).
-- - 시드는 부재 행 삽입(on conflict do nothing) 원칙 — 관리자가 콘솔에서 커스텀한
--   기존 권한 값은 되돌리지 않는다. 유일한 예외는 management_support의 office 권한을
--   구 기본값(read)에서 정본 매트릭스 값(write)으로 올리는 것으로, 기본값이 아닌
--   행은 건드리지 않는다.
-- =====================================================================

-- 1) system_events SELECT 정책: 'hub' → 'office' ---------------------------
drop policy if exists system_events_select on public.system_events;
create policy system_events_select on public.system_events for select
  using (app.is_admin() or app.can_read_workspace('office'));

-- 2) 전문가 만족도 랭킹 RPC: 권한 게이트 'hub' → 'office' -------------------
--    (함수명은 프론트 호출 호환을 위해 유지)
create or replace function public.hub_expert_ranking()
returns table (
  expert_id     uuid,
  expert_name   text,
  avg_score     numeric,
  session_count bigint
)
language sql
stable
security definer
set search_path = public, app
as $$
  select e.id, e.name, round(avg(msr.score)::numeric, 2), count(*)
    from public.mentor_satisfaction_records msr
    join public.program_participants pp on pp.id = msr.mentor_participant_id
    join public.experts e on e.id = pp.master_id
   where app.can_read_workspace('office')
   group by e.id, e.name
   order by avg(msr.score) desc, count(*) desc;
$$;

-- 3) permission_templates 시드: STARTUP 열 신설 -----------------------------
--    근거: 2_auth_permissions_architecture.md §5 매트릭스(STARTUP 열)
insert into public.permission_templates (user_type, workspace_key, permission_level, scope_type) values
  ('super_admin',       'startup', 'write', 'global'),
  ('executive',         'startup', 'read',  'global'),
  ('management_support', 'startup', 'read',  'global'),
  ('fund_manager',      'startup', 'write', 'global'),
  ('ac_business',       'startup', 'write', 'global'),
  ('mna_manager',       'startup', 'read',  'global'),
  ('project_manager',   'startup', 'read',  'global'),
  ('read_only',         'startup', 'read',  'global')
on conflict (user_type, workspace_key) do nothing;

-- 4) management_support의 OFFICE 권한: 구 기본값(read)만 정본(write)으로 상향 --
update public.permission_templates
   set permission_level = 'write'
 where user_type = 'management_support'
   and workspace_key = 'office'
   and permission_level = 'read';

-- 5) 기존 사용자 실권한(workspace_permissions) 전파 --------------------------
--    - office: enum rename으로 기존 hub 행이 자동 이관되어 있음.
--    - startup: 템플릿 기준으로 부재 행만 삽입(커스텀 권한 비파괴).
insert into public.workspace_permissions (user_id, workspace_key, permission_level, scope_type)
select u.id, t.workspace_key, t.permission_level, t.scope_type
  from public.users u
  join public.permission_templates t on t.user_type = u.user_type
 where t.workspace_key = 'startup'
   and u.deleted_at is null
on conflict (user_id, workspace_key) do nothing;

--    - management_support 사용자의 office 실권한도 구 기본값(read)만 상향.
update public.workspace_permissions p
   set permission_level = 'write'
  from public.users u
 where p.user_id = u.id
   and u.user_type = 'management_support'
   and u.deleted_at is null
   and p.workspace_key = 'office'
   and p.permission_level = 'read';
