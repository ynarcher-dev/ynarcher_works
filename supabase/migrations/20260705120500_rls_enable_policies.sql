-- =====================================================================
-- [Phase 2] RLS 활성화 및 워크스페이스별 정책
-- 원칙(3_database_rls_policy_matrix.md §2):
--  - 모든 테이블 RLS 활성화(Default Deny)
--  - SELECT / INSERT / UPDATE 정책 분리 선언
--  - DELETE 정책 미선언 → 물리 삭제 원천 차단(soft delete = deleted_at UPDATE)
--  - 판정은 app.* 헬퍼만 경유
-- =====================================================================

-- 모든 대상 테이블 RLS 활성화
alter table public.departments            enable row level security;
alter table public.users                  enable row level security;
alter table public.workspace_permissions  enable row level security;
alter table public.permission_templates   enable row level security;
alter table public.attachments            enable row level security;
alter table public.audit_logs             enable row level security;
alter table public.access_logs            enable row level security;
alter table public.system_events          enable row level security;
alter table public.startups               enable row level security;
alter table public.experts                enable row level security;
alter table public.partners               enable row level security;

-- departments -----------------------------------------------------------
drop policy if exists departments_select on public.departments;
create policy departments_select on public.departments for select
  using (app.current_app_user_id() is not null);
drop policy if exists departments_insert on public.departments;
create policy departments_insert on public.departments for insert
  with check (app.is_admin() or app.can_write_workspace('management'));
drop policy if exists departments_update on public.departments;
create policy departments_update on public.departments for update
  using (app.is_admin() or app.can_write_workspace('management'))
  with check (app.is_admin() or app.can_write_workspace('management'));

-- users -----------------------------------------------------------------
drop policy if exists users_select on public.users;
create policy users_select on public.users for select
  using (
    app.is_admin()
    or id = app.current_app_user_id()
    or app.can_read_workspace('management')
  );
drop policy if exists users_insert on public.users;
create policy users_insert on public.users for insert
  with check (app.is_admin() or app.can_write_workspace('management'));
drop policy if exists users_update on public.users;
create policy users_update on public.users for update
  using (app.is_admin() or app.can_write_workspace('management') or id = app.current_app_user_id())
  with check (app.is_admin() or app.can_write_workspace('management') or id = app.current_app_user_id());

-- workspace_permissions (권한 원장) --------------------------------------
drop policy if exists wsperm_select on public.workspace_permissions;
create policy wsperm_select on public.workspace_permissions for select
  using (
    app.is_admin()
    or user_id = app.current_app_user_id()
    or app.can_read_workspace('admin')
  );
drop policy if exists wsperm_insert on public.workspace_permissions;
create policy wsperm_insert on public.workspace_permissions for insert
  with check (app.is_admin() or app.can_write_workspace('admin'));
drop policy if exists wsperm_update on public.workspace_permissions;
create policy wsperm_update on public.workspace_permissions for update
  using (app.is_admin() or app.can_write_workspace('admin'))
  with check (app.is_admin() or app.can_write_workspace('admin'));

-- permission_templates (참조 데이터) -------------------------------------
drop policy if exists ptpl_select on public.permission_templates;
create policy ptpl_select on public.permission_templates for select
  using (app.current_app_user_id() is not null);
drop policy if exists ptpl_insert on public.permission_templates;
create policy ptpl_insert on public.permission_templates for insert
  with check (app.is_admin());
drop policy if exists ptpl_update on public.permission_templates;
create policy ptpl_update on public.permission_templates for update
  using (app.is_admin()) with check (app.is_admin());

-- attachments (다형 공통) ------------------------------------------------
-- 외부 게스트는 직접 SELECT 불가(전용 RPC/View 경유). 내부 사용자만 열람.
drop policy if exists attachments_select on public.attachments;
create policy attachments_select on public.attachments for select
  using (
    app.is_admin()
    or (app.current_app_user_id() is not null
        and app.current_app_role() not in ('external_startup', 'external_expert', 'temporary_guest'))
  );
drop policy if exists attachments_insert on public.attachments;
create policy attachments_insert on public.attachments for insert
  with check (uploaded_by = app.current_app_user_id() and app.current_app_user_id() is not null);
drop policy if exists attachments_update on public.attachments;
create policy attachments_update on public.attachments for update
  using (app.is_admin() or uploaded_by = app.current_app_user_id())
  with check (app.is_admin() or uploaded_by = app.current_app_user_id());

-- audit_logs (증적, 수정·삭제 불가) --------------------------------------
-- INSERT 정책 미선언 → 사용자 직접 삽입 차단(감사 트리거의 SECURITY DEFINER만 적재)
drop policy if exists audit_logs_select on public.audit_logs;
create policy audit_logs_select on public.audit_logs for select
  using (app.is_admin());

-- access_logs (열람/다운로드 사유) ---------------------------------------
drop policy if exists access_logs_select on public.access_logs;
create policy access_logs_select on public.access_logs for select
  using (app.is_admin());
drop policy if exists access_logs_insert on public.access_logs;
create policy access_logs_insert on public.access_logs for insert
  with check (user_id = app.current_app_user_id() and app.current_app_user_id() is not null);

-- system_events (전사 캘린더) --------------------------------------------
drop policy if exists system_events_select on public.system_events;
create policy system_events_select on public.system_events for select
  using (app.is_admin() or app.can_read_workspace('hub'));
drop policy if exists system_events_insert on public.system_events;
create policy system_events_insert on public.system_events for insert
  with check (app.can_write_workspace(workspace_key::text) and created_by = app.current_app_user_id());
drop policy if exists system_events_update on public.system_events;
create policy system_events_update on public.system_events for update
  using (app.can_write_workspace(workspace_key::text))
  with check (app.can_write_workspace(workspace_key::text));

-- NETWORKS 마스터: startups / experts / partners -------------------------
-- 내부 read 권한자 전체 열람, write 권한자만 등록/수정, 외부 게스트 직접 접근 불가.
drop policy if exists startups_select on public.startups;
create policy startups_select on public.startups for select
  using (app.can_read_workspace('networks'));
drop policy if exists startups_insert on public.startups;
create policy startups_insert on public.startups for insert
  with check (app.can_write_workspace('networks'));
drop policy if exists startups_update on public.startups;
create policy startups_update on public.startups for update
  using (app.can_write_workspace('networks')) with check (app.can_write_workspace('networks'));

drop policy if exists experts_select on public.experts;
create policy experts_select on public.experts for select
  using (app.can_read_workspace('networks'));
drop policy if exists experts_insert on public.experts;
create policy experts_insert on public.experts for insert
  with check (app.can_write_workspace('networks'));
drop policy if exists experts_update on public.experts;
create policy experts_update on public.experts for update
  using (app.can_write_workspace('networks')) with check (app.can_write_workspace('networks'));

drop policy if exists partners_select on public.partners;
create policy partners_select on public.partners for select
  using (app.can_read_workspace('networks'));
drop policy if exists partners_insert on public.partners;
create policy partners_insert on public.partners for insert
  with check (app.can_write_workspace('networks'));
drop policy if exists partners_update on public.partners;
create policy partners_update on public.partners for update
  using (app.can_write_workspace('networks')) with check (app.can_write_workspace('networks'));
