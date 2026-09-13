-- =====================================================================
-- 권한 인벤토리 회귀 (pgTAP) — AUTHZ-1/2
-- 실행: pnpm test:db authorization_inventory_test.sql
--
-- **이 파일은 생성물입니다. 손으로 고치지 마십시오.**
-- 정본은 scripts/security/_gen_test.mjs이고, 기대 권한 행렬은 거기서
-- supabase/security/acl-decisions.json의 decisions[].expected를 읽어 찍습니다.
-- 고칠 것이 있으면 생성기를 고친 뒤 node scripts/security/_gen_test.mjs 로 다시 찍습니다
-- (같은 입력이면 바이트가 같습니다).
--
-- 이 파일이 고정하는 것은 네 가지입니다.
--   (A) public 전수의 **기대 권한 행렬** — 표 하나하나에 대해 anon·authenticated·service_role이
--       무엇을 가져야 하는지. 정본은 supabase/security/acl-decisions.json이고 아래 VALUES는
--       그것을 그대로 옮긴 것입니다(scripts/security/emit-grant-sql.mjs expected-matrix와 동치).
--   (B) **새로 만드는 표**가 비행 권한을 물려받지 않는가 — 기본 권한 회수가 실제로 먹는지
--       실제 표를 만들어 확인하고 롤백합니다.
--   (C) service_role이 자격증명·인사 경로를 **실제로 읽고 쓸 수 있는가**, 그리고 같은 자리에서
--       anon·authenticated는 막히는가. 여기에는 **쓰기가 SELECT를 함께 요구하는 두 자리**가
--       들어갑니다 — insert ... returning(application-submit)과 update ... where로 좁힌
--       초대 소진(guestAccount/guestSession). 권한 행렬만 보면 이 둘은 통과하지만 실행은
--       42501로 무너지므로, 문장을 실제로 돌려 봅니다. 거절을 확인할 때는 **역할을 되돌린 뒤**
--       저장된 값을 봅니다 — 거절된 역할 안에서 세면 "안 바뀐 것"과 "안 보이는 것"이 같은
--       0으로 보이기 때문입니다.
--   (D) 워크스페이스 경계 — FUND 쓰기 계정의 긍정 경로(납입 행 물리 삭제 포함)와
--       읽기 전용·다른 워크스페이스·게스트의 부정 경로, 그리고 삭제가 상위 집계에 반영되는지.
--   (E) PUBLIC에서 좁힌 RPC 넷의 실행 권한 — anon 거절, authenticated 허용.
--
-- 여기서 정책을 약화시키지 않습니다. 부정 단언은 모두 "막혀야 한다"를 보는 쪽입니다.
-- 실제 개인정보는 쓰지 않습니다 — 픽스처는 이 트랜잭션 안에서만 살고 롤백됩니다.
-- =====================================================================
begin;
select plan(56);

-- =====================================================================
-- (A) 전수 기대 권한 행렬
-- =====================================================================

create temporary table _expected_auth(name text primary key, privs text) on commit drop;
insert into _expected_auth values
    ('_retired_asset_checkouts', ''),
    ('_retired_corporates', ''),
    ('_retired_etc', ''),
    ('_retired_exp', ''),
    ('_retired_experts', ''),
    ('_retired_global_networks', ''),
    ('_retired_institutions', ''),
    ('_retired_investors', ''),
    ('_retired_ma_program_links', ''),
    ('_retired_ma_program_module_assignees', ''),
    ('_retired_ma_program_modules', ''),
    ('_retired_ma_program_participants', ''),
    ('_retired_ma_program_posts', ''),
    ('_retired_others', ''),
    ('_retired_universities', ''),
    ('_retired_van', ''),
    ('_retired_vendors', ''),
    ('access_logs', 'SELECT'),
    ('action_items', ''),
    ('activity_attachments', ''),
    ('activity_attendees', ''),
    ('activity_minutes', ''),
    ('application_answers', ''),
    ('application_form_fields', ''),
    ('application_forms', 'SELECT'),
    ('application_submissions', 'SELECT'),
    ('approval_budget_revisions', ''),
    ('approval_doc_counters', ''),
    ('approval_document_events', 'SELECT'),
    ('approval_document_links', 'SELECT,INSERT,UPDATE'),
    ('approval_documents', 'SELECT,INSERT,UPDATE'),
    ('approval_form_versions', 'SELECT,INSERT'),
    ('approval_forms', 'SELECT,INSERT,UPDATE'),
    ('approval_legacy_actor_mappings', 'SELECT'),
    ('approval_legacy_actors', 'SELECT'),
    ('approval_legacy_attachment_refs', 'SELECT'),
    ('approval_legacy_document_links', 'SELECT'),
    ('approval_legacy_documents', 'SELECT'),
    ('approval_legacy_import_batches', 'SELECT'),
    ('approval_legacy_participants', 'SELECT'),
    ('approval_lines', 'SELECT,INSERT,UPDATE'),
    ('approval_program_links', 'SELECT,INSERT,UPDATE'),
    ('approval_reads', 'SELECT,INSERT,UPDATE'),
    ('approval_recipients', 'SELECT,INSERT'),
    ('assets', 'SELECT,INSERT,UPDATE'),
    ('attachment_extracts', 'SELECT'),
    ('attachments', 'SELECT,INSERT,UPDATE'),
    ('attendance_days', 'SELECT,INSERT,UPDATE'),
    ('attendance_edits', 'SELECT,INSERT'),
    ('attendance_policies', 'SELECT,INSERT,UPDATE'),
    ('attendance_statuses', 'SELECT,INSERT,UPDATE'),
    ('audit_logs', 'SELECT'),
    ('board_comments', 'SELECT'),
    ('board_posts', 'SELECT,INSERT,UPDATE'),
    ('boards', 'SELECT,INSERT,UPDATE'),
    ('branch_members', 'SELECT'),
    ('branches', 'SELECT,INSERT,UPDATE'),
    ('capital_call_payments', 'SELECT,INSERT,DELETE'),
    ('capital_calls', 'SELECT,INSERT,UPDATE'),
    ('category_tags', 'SELECT,INSERT,UPDATE'),
    ('company_category_tags', 'SELECT,INSERT,UPDATE'),
    ('company_status_tags', 'SELECT,INSERT,UPDATE'),
    ('country_tags', 'SELECT,INSERT,UPDATE'),
    ('departments', 'SELECT,INSERT,UPDATE'),
    ('dept_budgets', 'SELECT'),
    ('dept_members', 'SELECT,INSERT,UPDATE'),
    ('entity_codes', ''),
    ('entity_contributions', 'SELECT,INSERT'),
    ('entity_feedback', 'SELECT,INSERT,UPDATE'),
    ('export_jobs', ''),
    ('field_tags', 'SELECT,INSERT,UPDATE'),
    ('fund_lps', 'SELECT,INSERT,UPDATE'),
    ('fund_managers', 'SELECT,INSERT,DELETE'),
    ('fund_purposes', 'SELECT,INSERT,DELETE'),
    ('funds', 'SELECT,INSERT,UPDATE'),
    ('guest_credentials', ''),
    ('guest_identities', 'SELECT'),
    ('guest_invitations', 'SELECT,INSERT,UPDATE'),
    ('hr_assignments', ''),
    ('hr_profiles', 'SELECT,INSERT,UPDATE'),
    ('hr_trainings', ''),
    ('industry_tags', 'SELECT,INSERT,UPDATE'),
    ('investment_method_tags', 'SELECT,INSERT,UPDATE'),
    ('investment_purposes', 'SELECT,INSERT,DELETE'),
    ('investment_stage_tags', 'SELECT,INSERT,UPDATE'),
    ('investments', 'SELECT,INSERT,UPDATE'),
    ('kpi_actual_revisions', 'SELECT,INSERT'),
    ('kpi_assignments', 'SELECT,INSERT,UPDATE'),
    ('kpi_blueprint_items', 'SELECT,INSERT,UPDATE'),
    ('kpi_blueprints', 'SELECT,INSERT,UPDATE'),
    ('kpi_records', 'SELECT'),
    ('kpi_results', 'SELECT'),
    ('kpi_template_items', 'SELECT,INSERT,UPDATE'),
    ('kpi_templates', 'SELECT,INSERT,UPDATE'),
    ('kpi_versions', 'SELECT,INSERT,UPDATE'),
    ('location_region_tags', 'SELECT,INSERT,UPDATE'),
    ('location_tags', 'SELECT,INSERT,UPDATE'),
    ('ma_buyers', 'SELECT,INSERT,UPDATE'),
    ('ma_deal_documents', ''),
    ('ma_deal_stage_logs', ''),
    ('ma_deals', ''),
    ('ma_match_candidates', ''),
    ('ma_program_departments', 'SELECT'),
    ('ma_program_managers', 'SELECT'),
    ('ma_program_party_links', 'SELECT'),
    ('ma_program_timeline_items', 'SELECT'),
    ('ma_programs', 'SELECT,INSERT,UPDATE'),
    ('ma_sellers', 'SELECT,INSERT,UPDATE'),
    ('meeting_minute_links', 'SELECT'),
    ('meeting_minute_people', ''),
    ('meeting_minutes', 'SELECT,INSERT,UPDATE'),
    ('meeting_places', ''),
    ('meeting_recording_segments', 'SELECT'),
    ('meeting_recordings', 'SELECT'),
    ('meeting_room_reservations', 'SELECT,INSERT,UPDATE'),
    ('meeting_rooms', 'SELECT,INSERT,UPDATE'),
    ('module_kpi_snapshots', ''),
    ('module_templates', 'SELECT,INSERT,UPDATE'),
    ('networks', 'SELECT,INSERT,UPDATE'),
    ('notification_logs', ''),
    ('notifications', 'SELECT,UPDATE'),
    ('org_levels', 'SELECT,INSERT,UPDATE'),
    ('org_versions', 'SELECT,UPDATE'),
    ('partners', ''),
    ('pay_step_tags', 'SELECT,INSERT,UPDATE'),
    ('permission_templates', 'SELECT'),
    ('portfolio_financials', ''),
    ('position_tags', 'SELECT,INSERT,UPDATE'),
    ('program_announcements', 'SELECT,INSERT,UPDATE'),
    ('program_departments', 'SELECT'),
    ('program_links', 'SELECT,INSERT,UPDATE'),
    ('program_managers', 'SELECT'),
    ('program_module_assignees', 'SELECT'),
    ('program_module_public_links', 'SELECT,INSERT,UPDATE'),
    ('program_modules', 'SELECT,UPDATE'),
    ('program_notices', 'SELECT,INSERT,UPDATE'),
    ('program_overviews', 'SELECT,INSERT,UPDATE'),
    ('program_participant_entries', 'SELECT,INSERT,UPDATE'),
    ('program_participants', 'SELECT,INSERT,UPDATE'),
    ('program_posts', 'SELECT,INSERT,UPDATE'),
    ('program_questions', 'SELECT,INSERT,UPDATE'),
    ('program_timeline_items', 'SELECT'),
    ('programs', 'SELECT,INSERT,UPDATE'),
    ('project_members', ''),
    ('project_milestones', ''),
    ('project_tasks', ''),
    ('projects', ''),
    ('quick_memos', ''),
    ('rank_tags', 'SELECT,INSERT,UPDATE'),
    ('region_tags', 'SELECT,INSERT,UPDATE'),
    ('startup_managers', 'SELECT'),
    ('startups', 'SELECT,INSERT,UPDATE'),
    ('system_events', 'SELECT,INSERT,UPDATE'),
    ('task_checklist_items', ''),
    ('timeline_conflicts', ''),
    ('trade_partners', 'SELECT,INSERT,UPDATE'),
    ('upload_batches', 'SELECT,INSERT'),
    ('users', 'SELECT,UPDATE'),
    ('workspace_permissions', 'SELECT');

create temporary table _expected_svc(name text primary key, privs text) on commit drop;
insert into _expected_svc values
    ('_retired_asset_checkouts', ''),
    ('_retired_corporates', ''),
    ('_retired_etc', ''),
    ('_retired_exp', ''),
    ('_retired_experts', ''),
    ('_retired_global_networks', ''),
    ('_retired_institutions', ''),
    ('_retired_investors', ''),
    ('_retired_ma_program_links', ''),
    ('_retired_ma_program_module_assignees', ''),
    ('_retired_ma_program_modules', ''),
    ('_retired_ma_program_participants', ''),
    ('_retired_ma_program_posts', ''),
    ('_retired_others', ''),
    ('_retired_universities', ''),
    ('_retired_van', ''),
    ('_retired_vendors', ''),
    ('access_logs', 'SELECT,INSERT'),
    ('action_items', ''),
    ('activity_attachments', ''),
    ('activity_attendees', ''),
    ('activity_minutes', ''),
    ('application_answers', 'INSERT'),
    ('application_form_fields', 'SELECT'),
    ('application_forms', 'SELECT'),
    ('application_submissions', 'SELECT,INSERT'),
    ('approval_budget_revisions', ''),
    ('approval_doc_counters', ''),
    ('approval_document_events', ''),
    ('approval_document_links', ''),
    ('approval_documents', ''),
    ('approval_form_versions', ''),
    ('approval_forms', ''),
    ('approval_legacy_actor_mappings', ''),
    ('approval_legacy_actors', ''),
    ('approval_legacy_attachment_refs', ''),
    ('approval_legacy_document_links', ''),
    ('approval_legacy_documents', ''),
    ('approval_legacy_import_batches', ''),
    ('approval_legacy_participants', ''),
    ('approval_lines', ''),
    ('approval_program_links', ''),
    ('approval_reads', ''),
    ('approval_recipients', ''),
    ('assets', ''),
    ('attachment_extracts', 'SELECT,INSERT,UPDATE'),
    ('attachments', 'SELECT,INSERT'),
    ('attendance_days', ''),
    ('attendance_edits', ''),
    ('attendance_policies', ''),
    ('attendance_statuses', ''),
    ('audit_logs', 'INSERT'),
    ('board_comments', ''),
    ('board_posts', ''),
    ('boards', ''),
    ('branch_members', ''),
    ('branches', ''),
    ('capital_call_payments', ''),
    ('capital_calls', ''),
    ('category_tags', ''),
    ('company_category_tags', ''),
    ('company_status_tags', ''),
    ('country_tags', ''),
    ('departments', ''),
    ('dept_budgets', ''),
    ('dept_members', ''),
    ('entity_codes', ''),
    ('entity_contributions', ''),
    ('entity_feedback', ''),
    ('export_jobs', ''),
    ('field_tags', ''),
    ('fund_lps', ''),
    ('fund_managers', ''),
    ('fund_purposes', ''),
    ('funds', 'SELECT'),
    ('guest_credentials', 'SELECT,INSERT,UPDATE'),
    ('guest_identities', 'SELECT'),
    ('guest_invitations', 'SELECT,UPDATE'),
    ('hr_assignments', ''),
    ('hr_profiles', 'INSERT'),
    ('hr_trainings', ''),
    ('industry_tags', ''),
    ('investment_method_tags', ''),
    ('investment_purposes', ''),
    ('investment_stage_tags', ''),
    ('investments', ''),
    ('kpi_actual_revisions', ''),
    ('kpi_assignments', ''),
    ('kpi_blueprint_items', ''),
    ('kpi_blueprints', ''),
    ('kpi_records', ''),
    ('kpi_results', ''),
    ('kpi_template_items', ''),
    ('kpi_templates', ''),
    ('kpi_versions', ''),
    ('location_region_tags', ''),
    ('location_tags', 'SELECT'),
    ('ma_buyers', ''),
    ('ma_deal_documents', ''),
    ('ma_deal_stage_logs', ''),
    ('ma_deals', ''),
    ('ma_match_candidates', ''),
    ('ma_program_departments', ''),
    ('ma_program_managers', ''),
    ('ma_program_party_links', ''),
    ('ma_program_timeline_items', ''),
    ('ma_programs', 'SELECT'),
    ('ma_sellers', ''),
    ('meeting_minute_links', ''),
    ('meeting_minute_people', ''),
    ('meeting_minutes', ''),
    ('meeting_places', ''),
    ('meeting_recording_segments', 'SELECT,UPDATE'),
    ('meeting_recordings', 'SELECT'),
    ('meeting_room_reservations', ''),
    ('meeting_rooms', ''),
    ('module_kpi_snapshots', ''),
    ('module_templates', 'SELECT'),
    ('networks', 'SELECT'),
    ('notification_logs', ''),
    ('notifications', ''),
    ('org_levels', ''),
    ('org_versions', ''),
    ('partners', ''),
    ('pay_step_tags', ''),
    ('permission_templates', 'SELECT'),
    ('portfolio_financials', ''),
    ('position_tags', ''),
    ('program_announcements', ''),
    ('program_departments', ''),
    ('program_links', 'SELECT'),
    ('program_managers', ''),
    ('program_module_assignees', ''),
    ('program_module_public_links', 'SELECT,UPDATE'),
    ('program_modules', 'SELECT'),
    ('program_notices', ''),
    ('program_overviews', ''),
    ('program_participant_entries', ''),
    ('program_participants', 'SELECT,UPDATE'),
    ('program_posts', 'SELECT'),
    ('program_questions', ''),
    ('program_timeline_items', ''),
    ('programs', 'SELECT'),
    ('project_members', ''),
    ('project_milestones', ''),
    ('project_tasks', ''),
    ('projects', ''),
    ('quick_memos', ''),
    ('rank_tags', ''),
    ('region_tags', ''),
    ('startup_managers', ''),
    ('startups', 'SELECT'),
    ('system_events', ''),
    ('task_checklist_items', ''),
    ('timeline_conflicts', ''),
    ('trade_partners', ''),
    ('upload_batches', ''),
    ('users', 'SELECT,INSERT,UPDATE,DELETE'),
    ('workspace_permissions', 'SELECT,INSERT');

-- 실제 유효 권한을 같은 모양으로 접습니다.
create temporary view _actual as
select c.relname as name,
       r.role_name,
       coalesce((
         select string_agg(p.priv, ',' order by array_position(
                  array['SELECT', 'INSERT', 'UPDATE', 'DELETE'], p.priv))
           from (values ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE')) as p(priv)
          where has_table_privilege(r.role_name, c.oid, p.priv)
       ), '') as privs
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
 cross join (values ('anon'), ('authenticated'), ('service_role')) as r(role_name)
 where n.nspname = 'public' and c.relkind = 'r';

-- A1. 매니페스트가 아는 표의 수와 실제 표의 수가 같아야 합니다. 다르면 아래 비교가
--     "없는 표는 못 본다"로 조용히 통과하므로 먼저 봅니다.
select is(
  (select count(*)::int from _actual where role_name = 'authenticated'),
  (select count(*)::int from _expected_auth),
  'A1: 기대 행렬이 public의 실제 표 전수를 덮는다'
);

-- A2. authenticated 권한이 기대와 정확히 같다(넘치는 쪽·모자란 쪽 모두 0건).
select is(
  (select count(*)::int
     from _expected_auth e
     join _actual a on a.name = e.name and a.role_name = 'authenticated'
    where a.privs <> e.privs),
  0,
  'A2: authenticated의 유효 권한이 결정 매니페스트와 한 칸도 다르지 않다'
);

-- A3. service_role도 같다.
select is(
  (select count(*)::int
     from _expected_svc e
     join _actual a on a.name = e.name and a.role_name = 'service_role'
    where a.privs <> e.privs),
  0,
  'A3: service_role의 유효 권한이 결정 매니페스트와 한 칸도 다르지 않다'
);

-- A4. anon은 public의 어떤 표에도 행 권한이 없다.
select is(
  (select count(*)::int from _actual where role_name = 'anon' and privs <> ''),
  0,
  'A4: anon은 public 표 전수에 행 권한이 없다'
);

-- A5. anon·authenticated에 행을 열지 않는 권한이 남아 있지 않다.
select is(
  (select count(*)::int
     from pg_class c
     join pg_namespace n on n.oid = c.relnamespace
    cross join (values ('anon'), ('authenticated')) as r(role_name)
    cross join (values ('TRUNCATE'), ('REFERENCES'), ('TRIGGER')) as p(priv)
    where n.nspname = 'public' and c.relkind = 'r'
      and has_table_privilege(r.role_name, c.oid, p.priv)),
  0,
  'A5: anon·authenticated에 TRUNCATE·REFERENCES·TRIGGER가 남아 있지 않다'
);

-- A6. MAINTAIN(PG17)도 마찬가지. 16 이하에서는 권한 자체가 없어 자연히 0입니다.
select is(
  (select case when current_setting('server_version_num')::int < 170000 then 0 else (
     select count(*)::int
       from pg_class c
       join pg_namespace n on n.oid = c.relnamespace
      cross join (values ('anon'), ('authenticated')) as r(role_name)
      where n.nspname = 'public' and c.relkind = 'r'
        and has_table_privilege(r.role_name, c.oid, 'MAINTAIN')) end),
  0,
  'A6: anon·authenticated에 MAINTAIN이 남아 있지 않다'
);

-- A7. authenticated의 DELETE는 승인된 네 표뿐이다.
select is(
  (select coalesce(string_agg(name, ',' order by name), '')
     from _actual
    where role_name = 'authenticated' and privs like '%DELETE%'),
  'capital_call_payments,fund_managers,fund_purposes,investment_purposes',
  'A7: authenticated의 물리 삭제 권한은 승인된 배정성 원장 네 개뿐이다'
);

-- A8. 보호 표에는 authenticated의 어떤 행 권한도 없다.
--     (자격증명·채번·발송 로그·서버 감사 이력 — 정책이 없거나 서버 전용입니다.)
select is(
  (select coalesce(string_agg(name, ',' order by name), '')
     from _actual
    where role_name = 'authenticated'
      and name in ('guest_credentials', 'approval_doc_counters', 'entity_codes',
                   'notification_logs', 'approval_budget_revisions')
      and privs <> ''),
  '',
  'A8: 자격증명·채번·발송로그·예산감사 표에 authenticated 행 권한이 없다'
);

-- A9. 감사 로그는 읽기만 — 쓰기는 서버 경로가 갖습니다.
select is(
  (select privs from _actual where name = 'audit_logs' and role_name = 'authenticated'),
  'SELECT',
  'A9: audit_logs는 authenticated에게 SELECT만 열려 있다'
);

-- =====================================================================
-- (B) 새 표가 비행 권한을 물려받지 않는가 (기본 권한 회수의 실제 확인)
-- =====================================================================
--
-- 마이그레이션을 실행하는 롤과 같은 소유자(postgres)로 표를 하나 만들어 봅니다.
-- 이 표는 이 트랜잭션 안에서만 살고 rollback과 함께 사라집니다.

create table public._acl_default_probe (id uuid primary key default gen_random_uuid());

select is(
  (select count(*)::int
     from (values ('anon'), ('authenticated')) as r(role_name)
    cross join (values ('TRUNCATE'), ('REFERENCES'), ('TRIGGER')) as p(priv)
    where has_table_privilege(r.role_name, 'public._acl_default_probe', p.priv)),
  0,
  'B1: 새로 만든 표가 anon·authenticated에 TRUNCATE·REFERENCES·TRIGGER를 물려주지 않는다'
);

select is(
  (select case when current_setting('server_version_num')::int < 170000 then 0 else (
     select count(*)::int
       from (values ('anon'), ('authenticated')) as r(role_name)
      where has_table_privilege(r.role_name, 'public._acl_default_probe', 'MAINTAIN')) end),
  0,
  'B2: 새로 만든 표가 anon·authenticated에 MAINTAIN을 물려주지 않는다'
);

select is(
  (select count(*)::int
     from (values ('anon'), ('authenticated')) as r(role_name)
    cross join (values ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE')) as p(priv)
    where has_table_privilege(r.role_name, 'public._acl_default_probe', p.priv)),
  0,
  'B3: 새로 만든 표는 행 권한도 주지 않는다(필요하면 그 표의 마이그레이션이 이름을 적는다)'
);

drop table public._acl_default_probe;

-- 시퀀스도 같은 방식으로 봅니다. 기본값은 anon·authenticated에 UPDATE를 주고 있었고,
-- UPDATE 하나로 nextval·setval이 함께 열립니다(남의 표 채번을 임의 값으로 밀 수 있습니다).
create sequence public._acl_default_probe_seq;

select is(
  (select count(*)::int
     from (values ('anon'), ('authenticated')) as r(role_name)
    cross join (values ('USAGE'), ('SELECT'), ('UPDATE')) as p(priv)
    where has_sequence_privilege(r.role_name, 'public._acl_default_probe_seq', p.priv)),
  0,
  'B4: 새로 만든 시퀀스가 anon·authenticated에 USAGE·SELECT·UPDATE를 물려주지 않는다'
);

drop sequence public._acl_default_probe_seq;

-- =====================================================================
-- 픽스처 — 이 트랜잭션 안에서만 사는 계정과 데이터
-- =====================================================================

insert into public.startups(id, name) values
  ('c0000000-0000-0000-0000-0000000000c1', 'ACL회귀 스타트업');

insert into public.users(id, user_type, name, session_version, company_id) values
  ('00000000-0000-0000-0000-0000000000f1', 'fund_manager',     'acl_fund_writer',   1, null),
  ('00000000-0000-0000-0000-0000000000f2', 'read_only',        'acl_fund_reader',   1, null),
  ('00000000-0000-0000-0000-0000000000f3', 'mna_manager',      'acl_other_ws',      1, null),
  ('00000000-0000-0000-0000-0000000000f4', 'external_startup', 'acl_guest',         1, 'c0000000-0000-0000-0000-0000000000c1'),
  ('00000000-0000-0000-0000-0000000000f5', 'management_support', 'acl_hr_writer',   1, null),
  ('00000000-0000-0000-0000-0000000000f6', 'ac_business',      'acl_program_writer', 1, null),
  ('00000000-0000-0000-0000-0000000000f7', 'external_startup', 'acl_guest_selfscope', 1, 'c0000000-0000-0000-0000-0000000000c1');

insert into public.workspace_permissions(user_id, workspace_key, permission_level, scope_type, expires_at) values
  ('00000000-0000-0000-0000-0000000000f1', 'fund',       'write', 'global', null),
  ('00000000-0000-0000-0000-0000000000f2', 'fund',       'read',  'global', null),
  ('00000000-0000-0000-0000-0000000000f3', 'mna',        'write', 'global', null),
  ('00000000-0000-0000-0000-0000000000f4', 'guest',      'write', 'company', null),
  ('00000000-0000-0000-0000-0000000000f5', 'management', 'write', 'global', null),
  ('00000000-0000-0000-0000-0000000000f6', 'project',    'write', 'global', null),
  -- f7은 issue_guest_account가 실제로 심는 값 그대로입니다(20260911221000:656).
  -- 게스트 계정은 전부 guest 워크스페이스 'write'를 들고 있습니다 — 아래 C21이 그 사실의 결과를 봅니다.
  ('00000000-0000-0000-0000-0000000000f7', 'guest',      'write', 'self', null);

insert into public.funds(id, name, total_commitment) values
  ('d0000000-0000-0000-0000-0000000000d1', 'ACL회귀 조합', 1000);

-- 납입 행은 (차수, LP)가 유일해야 하므로 LP를 셋 둡니다. 셋째는 아래 D2의 추가용입니다.
insert into public.fund_lps(id, fund_id, name, commitment_amount) values
  ('d0000000-0000-0000-0000-0000000000e1', 'd0000000-0000-0000-0000-0000000000d1', 'ACL회귀 LP 가', 700),
  ('d0000000-0000-0000-0000-0000000000e2', 'd0000000-0000-0000-0000-0000000000d1', 'ACL회귀 LP 나', 300),
  ('d0000000-0000-0000-0000-0000000000e3', 'd0000000-0000-0000-0000-0000000000d1', 'ACL회귀 LP 다', 100);

insert into public.capital_calls(id, fund_id, call_no, amount) values
  ('d0000000-0000-0000-0000-0000000000c1', 'd0000000-0000-0000-0000-0000000000d1', 1, 0);

insert into public.capital_call_payments(id, capital_call_id, lp_id, fund_id, requested_amount) values
  ('d0000000-0000-0000-0000-0000000000a1', 'd0000000-0000-0000-0000-0000000000c1',
   'd0000000-0000-0000-0000-0000000000e1', 'd0000000-0000-0000-0000-0000000000d1', 700),
  ('d0000000-0000-0000-0000-0000000000a2', 'd0000000-0000-0000-0000-0000000000c1',
   'd0000000-0000-0000-0000-0000000000e2', 'd0000000-0000-0000-0000-0000000000d1', 300);

-- 쓰기가 SELECT를 함께 요구하는 자리(C11~C16)의 픽스처입니다. 초대는 두 줄을 두어
-- "WHERE로 좁힌 갱신이 그 줄만 건드린다"까지 봅니다.
insert into public.programs(id, title) values
  ('e0000000-0000-0000-0000-0000000000a1', 'ACL회귀 사업');

-- 원장 인격을 매달면 명부 정합성 트리거(validate_guest_participant_roster)가 먼저 걸립니다.
-- 여기서 보려는 것은 권한이지 명부 규칙이 아니므로 인격 없는 임시 게스트 줄로 둡니다.
insert into public.program_participants(id, program_id, master_table, master_id) values
  ('e0000000-0000-0000-0000-0000000000a2', 'e0000000-0000-0000-0000-0000000000a1', null, null),
  ('e0000000-0000-0000-0000-0000000000a3', 'e0000000-0000-0000-0000-0000000000a1', null, null);

insert into public.guest_invitations(id, business_code, name, participant_id) values
  ('e0000000-0000-0000-0000-0000000000b1', 'ACL-REG-1', 'ACL회귀 초대 가', 'e0000000-0000-0000-0000-0000000000a2'),
  ('e0000000-0000-0000-0000-0000000000b2', 'ACL-REG-2', 'ACL회귀 초대 나', 'e0000000-0000-0000-0000-0000000000a3');

-- 집계 트리거가 차수 요청액을 채웠는지 먼저 확인합니다 — 이후 삭제 단언의 기준점입니다.
select is(
  (select amount::int from public.capital_calls where id = 'd0000000-0000-0000-0000-0000000000c1'),
  1000,
  'D0: 납입 행 두 건의 요청액이 차수 집계에 반영되어 있다(기준점)'
);

-- =====================================================================
-- (C) service_role의 실제 읽기·쓰기 — 그리고 같은 자리에서 앱 롤은 막힌다
-- =====================================================================
--
-- 자격증명 표는 정책이 한 건도 없어 RLS 기본 거부입니다. 즉 service_role이 여기서 일할 수
-- 있는 것은 **BYPASSRLS + 테이블 권한** 두 가지가 함께 있을 때뿐이며, 재생 직후에는
-- 테이블 권한이 없어 Edge 인증 경로 전체가 42501로 막혀 있었습니다. 여기서 그 경로가
-- 실제로 서는지 봅니다. 값은 픽스처 문자열이며 실제 자격증명이 아닙니다.

set local role service_role;

select lives_ok(
  $fx$ insert into public.guest_credentials(user_id, password_hash, password_set_at)
       values ('00000000-0000-0000-0000-0000000000f4', 'pbkdf2$fixture$notarealhash', now()) $fx$,
  'C1: service_role은 게스트 자격증명을 만들 수 있다(Edge 로그인·설정 경로)'
);

select is(
  (select login_attempts from public.guest_credentials
    where user_id = '00000000-0000-0000-0000-0000000000f4'),
  0,
  'C2: service_role이 자격증명 행을 다시 읽는다'
);

select lives_ok(
  $fx$ update public.guest_credentials set login_attempts = login_attempts + 1
        where user_id = '00000000-0000-0000-0000-0000000000f4' $fx$,
  'C3: service_role은 잠금 카운터를 갱신할 수 있다(실패 누적 경로)'
);

select lives_ok(
  $fx$ insert into public.hr_profiles(user_id, birth_date)
       values ('00000000-0000-0000-0000-0000000000f5', date '1990-01-01') $fx$,
  'C4: service_role은 인사 프로필을 만들 수 있다(employee-create 경로)'
);

select lives_ok(
  $fx$ insert into public.audit_logs(action, actor_user_id, reason)
       values ('acl_regression', '00000000-0000-0000-0000-0000000000f5', 'ACL 회귀 픽스처') $fx$,
  'C5: service_role은 감사 로그를 적재할 수 있다'
);

-- C11~C14: 쓰기가 SELECT를 함께 요구하는 두 자리.
--
-- service_role은 RLS를 우회하지만 **테이블 ACL은 그대로 받습니다.** INSERT만 주고 SELECT를
-- 빼면 아래 두 문장이 42501로 멈춥니다 — 권한 행렬 단언(A)만으로는 잡히지 않는 자리라
-- 문장을 실제로 돌립니다.

-- application-submit/index.ts:121 — .insert(...).select('id').single()
select lives_ok(
  $fx$ insert into public.application_submissions(id, program_id, status, submitted_at)
       values ('e0000000-0000-0000-0000-0000000000c1',
               'e0000000-0000-0000-0000-0000000000a1', 'SUBMITTED', now())
       returning id $fx$,
  'C11: service_role은 지원 행을 넣고 id를 돌려받을 수 있다(insert ... returning)'
);

select is(
  (select status::text from public.application_submissions
    where id = 'e0000000-0000-0000-0000-0000000000c1'),
  'SUBMITTED',
  'C12: 돌려받은 그 행이 실제로 남아 있다'
);

-- _shared/guestAccount.ts:321 / _shared/guestSession.ts:187 —
-- .update({...}).eq('participant_id', ...) : WHERE에 쓰인 칸도 읽습니다.
select lives_ok(
  $fx$ update public.guest_invitations
          set used_at = now(), app_user_id = '00000000-0000-0000-0000-0000000000f4'
        where participant_id = 'e0000000-0000-0000-0000-0000000000a2' $fx$,
  'C13: service_role은 참가자로 좁혀 초대를 소진할 수 있다(update ... where)'
);

select is(
  (select string_agg(id::text, ',' order by id) from public.guest_invitations
    where used_at is not null),
  'e0000000-0000-0000-0000-0000000000b1',
  'C14: WHERE로 좁힌 갱신이 그 참가자의 초대 한 줄만 소진했다'
);

reset role;

-- 같은 자리에서 앱 롤은 막혀야 합니다.
set local role authenticated;
select set_config('request.jwt.claims',
  '{"app_user_id":"00000000-0000-0000-0000-0000000000f5","session_version":1}', true);
select throws_ok(
  $fx$ select count(*) from public.guest_credentials $fx$,
  '42501', null,
  'C6: authenticated는 자격증명 표를 읽을 수 없다(권한 단계에서 막힌다)'
);
select throws_ok(
  $fx$ insert into public.audit_logs(action, actor_user_id, reason)
       values ('forged', '00000000-0000-0000-0000-0000000000f5', '위조 시도') $fx$,
  '42501', null,
  'C7: authenticated는 감사 로그를 위조할 수 없다(쓰기 권한 없음)'
);
select throws_ok(
  $fx$ insert into public.application_submissions(program_id, status)
       values ('e0000000-0000-0000-0000-0000000000a1', 'DRAFT') $fx$,
  '42501', null,
  'C15: authenticated는 지원 행을 직접 넣을 수 없다(제출은 Edge가 한다)'
);
-- 초대 표는 다릅니다. guest-access-invite/index.ts가 **호출자의 토큰 그대로**
-- open_program_guest_access(INVOKER)를 부르고, 그 함수가 이 표를 UPDATE/INSERT 합니다.
-- 그래서 authenticated에게 쓰기 권한이 있어야 하며, 경계는 권한이 아니라 RLS가 집니다.
--
-- 판정은 **반드시 역할을 되돌린 뒤** 합니다. 거절된 역할 안에서 세면 "정말 안 바뀐 것"과
-- "바뀌었지만 그 역할에게 안 보이는 것"이 같은 0으로 보입니다. 저장된 값을 직접 봅니다.
-- (앞의 C13이 이미 소진한 줄 말고 둘째 초대를 씁니다.)
update public.guest_invitations set used_at = now()
 where participant_id = 'e0000000-0000-0000-0000-0000000000a3';
reset role;

select is(
  (select used_at from public.guest_invitations
    where id = 'e0000000-0000-0000-0000-0000000000b2'),
  null,
  'C16: 사업 담당 권한이 없는 authenticated의 초대 갱신은 저장된 행을 바꾸지 못한다'
);

-- 같은 문장이 사업 담당 권한을 가진 계정에서는 실제로 서야 합니다. 여기가 무너지면
-- 게스트 로그인 개방 기능이 통째로 42501입니다.
set local role authenticated;
select set_config('request.jwt.claims',
  '{"app_user_id":"00000000-0000-0000-0000-0000000000f6","session_version":1}', true);

update public.guest_invitations set used_at = now()
 where participant_id = 'e0000000-0000-0000-0000-0000000000a3';
reset role;

select isnt(
  (select used_at from public.guest_invitations
    where id = 'e0000000-0000-0000-0000-0000000000b2'),
  null,
  'C17: 사업 담당 권한이 있는 authenticated는 초대를 소진할 수 있다(저장된 행이 바뀐다)'
);

-- INSERT 가지 — RPC는 초대 행이 없으면 만듭니다(20260909240000: update … if not found then insert).
-- UPDATE만 확인하면 이 가지가 통째로 빠집니다.
set local role authenticated;
select set_config('request.jwt.claims',
  '{"app_user_id":"00000000-0000-0000-0000-0000000000f6","session_version":1}', true);
select lives_ok(
  $fx$ insert into public.guest_invitations(id, business_code, name, participant_id)
       values ('e0000000-0000-0000-0000-0000000000b3', 'ACL-REG-3', 'ACL회귀 초대 다', null) $fx$,
  'C18: 사업 담당 권한이 있는 authenticated는 초대 행을 만들 수 있다(RPC의 insert 가지)'
);
reset role;

select is(
  (select business_code from public.guest_invitations
    where id = 'e0000000-0000-0000-0000-0000000000b3'),
  'ACL-REG-3',
  'C19: 그 행이 실제로 저장되어 있다(역할을 되돌려 직접 확인)'
);

-- 거절 쪽: 사업·게스트 워크스페이스 쓰기가 없는 내부 계정은 with_check에 걸립니다.
set local role authenticated;
select set_config('request.jwt.claims',
  '{"app_user_id":"00000000-0000-0000-0000-0000000000f5","session_version":1}', true);
select throws_ok(
  $fx$ insert into public.guest_invitations(id, business_code, name)
       values ('e0000000-0000-0000-0000-0000000000b4', 'ACL-REG-4', 'ACL회귀 초대 라') $fx$,
  '42501', null,
  'C20: 해당 워크스페이스 쓰기 권한이 없는 authenticated는 초대 행을 만들 수 없다'
);
reset role;

-- ── 게스트 계정으로 같은 두 문장 ────────────────────────────────────────
--
-- f7은 issue_guest_account가 실제로 심는 권한을 그대로 든 게스트입니다. 즉
-- app.can_write_workspace('guest')가 **참**입니다. 20260912161500 이전에는 그것만으로
-- guest_inv_insert의 with_check를 통과했고, 표 권한을 연 순간 외부 사용자가 초대 원장에
-- 눈먼 쓰기를 할 수 있었습니다. 그 마이그레이션이 두 쓰기 정책에 app.is_internal_user()를
-- AND로 더해 닫았습니다. 아래 둘이 그 경계를 지킵니다.
set local role authenticated;
select set_config('request.jwt.claims',
  '{"app_user_id":"00000000-0000-0000-0000-0000000000f7","session_version":1}', true);
select throws_ok(
  $fx$ insert into public.guest_invitations(id, business_code, name)
       values ('e0000000-0000-0000-0000-0000000000b5', 'ACL-REG-5', 'ACL회귀 초대 마') $fx$,
  '42501', null,
  'C21: 게스트 계정은 guest 워크스페이스 쓰기를 들고 있어도 초대 행을 만들 수 없다'
);

-- UPDATE도 같은 조건으로 막히고, 읽는 자리가 있어 guest_inv_select가 한 겹 더 걸립니다.
update public.guest_invitations set used_at = null
 where id = 'e0000000-0000-0000-0000-0000000000b2';
reset role;

select isnt(
  (select used_at from public.guest_invitations
    where id = 'e0000000-0000-0000-0000-0000000000b2'),
  null,
  'C22: 게스트 계정은 남의 초대 행을 되돌리지 못한다(저장된 값이 그대로다)'
);

select is(
  (select count(*)::int from public.guest_invitations
    where id = 'e0000000-0000-0000-0000-0000000000b5'),
  0,
  'C22b: 게스트가 만들려던 초대 행은 저장되지 않았다(역할을 되돌려 직접 확인)'
);

-- ── 호출자 경로 그 자체 ─────────────────────────────────────────────────
--
-- 행복 경로 전체(명부 정합성 + 원장 인격 + 계정 발급)는 이 파일의 픽스처 범위를 넘습니다.
-- 대신 **호출자 권한으로 함수 본문에 실제로 들어가 자체 인가에서 멈추는 것**까지는 봅니다.
--
-- 오류 코드만 보면 증명이 되지 않습니다 — EXECUTE 권한 거절도 42501이고 본문의 인가 거절도
-- 42501이라 둘이 구분되지 않습니다. 그래서 **본문이 내는 메시지 그대로**를 함께 단언합니다.
-- 이 문장이 통과한다는 것은 (ㄱ) authenticated가 이 함수를 실행할 수 있었고, (ㄴ) 본문이
-- 돌아 app.is_program_manager 판정까지 갔으며, (ㄷ) 담당자가 아니라서 거기서 멈췄다는 뜻입니다.
set local role authenticated;
select set_config('request.jwt.claims',
  '{"app_user_id":"00000000-0000-0000-0000-0000000000f6","session_version":1}', true);
select throws_ok(
  $fx$ select * from public.open_program_guest_access(
         array['e0000000-0000-0000-0000-0000000000a3']::uuid[]) $fx$,
  '42501',
  '담당자(PM·MEMBER·운용역)만 게스트 로그인을 열 수 있습니다.',
  'C23: 담당자가 아닌 authenticated는 open_program_guest_access의 **본문 인가**에서 막힌다(메시지로 확인)'
);
reset role;

set local role anon;
select throws_ok(
  $fx$ select count(*) from public.guest_credentials $fx$,
  '42501', null,
  'C8: anon은 자격증명 표를 읽을 수 없다'
);
select throws_ok(
  $fx$ select count(*) from public.users $fx$,
  '42501', null,
  'C9: anon은 계정 원장을 읽을 수 없다'
);
select throws_ok(
  $fx$ select count(*) from public.startups $fx$,
  '42501', null,
  'C10: anon은 업무 원장을 읽을 수 없다'
);
reset role;

-- =====================================================================
-- (D) 워크스페이스 경계 — FUND 쓰기 긍정, 읽기·타 워크스페이스·게스트 부정
-- =====================================================================

-- D1~D3: FUND 쓰기 계정의 긍정 경로. 납입 행 물리 삭제는 승인된 예외입니다
--        (useDeleteCapitalCall — 캐피탈콜을 접을 때 배정 행을 지웁니다).
set local role authenticated;
select set_config('request.jwt.claims',
  '{"app_user_id":"00000000-0000-0000-0000-0000000000f1","session_version":1}', true);

select is(
  (select count(*)::int from public.capital_call_payments
    where capital_call_id = 'd0000000-0000-0000-0000-0000000000c1'),
  2,
  'D1: FUND 쓰기 계정은 납입 행을 읽는다'
);

select lives_ok(
  $fx$ insert into public.capital_call_payments(capital_call_id, lp_id, fund_id, requested_amount)
       values ('d0000000-0000-0000-0000-0000000000c1',
               'd0000000-0000-0000-0000-0000000000e3',
               'd0000000-0000-0000-0000-0000000000d1', 100) $fx$,
  'D2: FUND 쓰기 계정은 납입 행을 추가한다'
);

select lives_ok(
  $fx$ delete from public.capital_call_payments
        where id = 'd0000000-0000-0000-0000-0000000000a2' $fx$,
  'D3: FUND 쓰기 계정은 납입 행을 물리 삭제한다(승인된 예외)'
);

select is(
  (select count(*)::int from public.capital_call_payments
    where id = 'd0000000-0000-0000-0000-0000000000a2'),
  0,
  'D4: 삭제된 납입 행이 실제로 사라졌다'
);

-- 물리 삭제가 상위 집계에 반영되어야 합니다 — 화면에서 사라진 돈이 집계에 남으면
-- 확인창 문구와 어긋납니다. 700(잔존) + 100(추가) = 800.
select is(
  (select amount::int from public.capital_calls
    where id = 'd0000000-0000-0000-0000-0000000000c1'),
  800,
  'D5: 납입 행 삭제·추가가 상위 차수 집계에 반영된다'
);
reset role;

-- D6~D7: 읽기 전용 계정 — 읽히지만 지워지지 않습니다. 권한은 authenticated 단위로 열려
--        있으므로 여기서 막는 것은 **정책**입니다. DELETE는 오류가 아니라 0행으로 끝납니다.
set local role authenticated;
select set_config('request.jwt.claims',
  '{"app_user_id":"00000000-0000-0000-0000-0000000000f2","session_version":1}', true);
select is(
  (select count(*)::int from public.capital_call_payments
    where id = 'd0000000-0000-0000-0000-0000000000a1'),
  1,
  'D6: FUND 읽기 계정은 납입 행을 읽는다'
);
delete from public.capital_call_payments where id = 'd0000000-0000-0000-0000-0000000000a1';
reset role;
select is(
  (select count(*)::int from public.capital_call_payments
    where id = 'd0000000-0000-0000-0000-0000000000a1'),
  1,
  'D7: FUND 읽기 계정의 삭제 시도는 한 행도 지우지 못한다'
);

-- D8: 다른 워크스페이스(M&A 쓰기) 계정에게는 FUND 원장이 보이지 않습니다.
set local role authenticated;
select set_config('request.jwt.claims',
  '{"app_user_id":"00000000-0000-0000-0000-0000000000f3","session_version":1}', true);
select is(
  (select count(*)::int from public.capital_call_payments
    where fund_id = 'd0000000-0000-0000-0000-0000000000d1'),
  0,
  'D8: M&A 쓰기 계정에게 FUND 납입 행이 보이지 않는다'
);
reset role;

-- D9~D11: 게스트. WORKS 임직원과 같은 authenticated 롤을 쓰므로, 경계는 전적으로 RLS입니다.
--         그래서 표 권한을 연 자리마다 게스트 부정 경로를 함께 고정합니다.
set local role authenticated;
select set_config('request.jwt.claims',
  '{"app_user_id":"00000000-0000-0000-0000-0000000000f4","session_version":1}', true);
select is(
  (select count(*)::int from public.capital_call_payments),
  0,
  'D9: 게스트에게 FUND 납입 행이 한 건도 보이지 않는다'
);
select is(
  (select count(*)::int from public.funds),
  0,
  'D10: 게스트에게 조합 원장이 보이지 않는다'
);
select is(
  (select count(*)::int from public.audit_logs),
  0,
  'D11: 게스트에게 감사 로그가 보이지 않는다(권한은 열려 있고 RLS가 막는다)'
);
select is(
  (select count(*)::int from public.hr_profiles),
  0,
  'D12: 게스트에게 인사 프로필이 보이지 않는다'
);
reset role;

-- D13: MANAGEMENT 쓰기 계정의 긍정 경로 — 같은 표가 권한 있는 역할에는 열려 있어야 합니다.
--      (부정만 모으면 "전부 막혔다"도 통과하므로 긍정을 함께 답니다.)
set local role authenticated;
select set_config('request.jwt.claims',
  '{"app_user_id":"00000000-0000-0000-0000-0000000000f5","session_version":1}', true);
select is(
  (select count(*)::int from public.hr_profiles
    where user_id = '00000000-0000-0000-0000-0000000000f5'),
  1,
  'D13: MANAGEMENT 쓰기 계정은 인사 프로필을 읽는다'
);
reset role;

-- =====================================================================
-- (E) PUBLIC에서 좁힌 RPC 넷
-- =====================================================================

select is(
  (select count(*)::int
     from (values
       ('public.set_program_staffing(uuid,jsonb,jsonb)'),
       ('public.set_ma_program_staffing(uuid,jsonb,jsonb)'),
       ('public.set_application_form(uuid,uuid,uuid,text,text,jsonb,jsonb,timestamptz,timestamptz)'),
       ('public.network_entity_metrics()')
     ) as t(sig)
    where has_function_privilege('anon', to_regprocedure(t.sig), 'EXECUTE')),
  0,
  'E1: anon은 담당자 배정·모집 공고·NETWORKS 집계 RPC를 실행할 수 없다'
);

select is(
  (select count(*)::int
     from (values
       ('public.set_program_staffing(uuid,jsonb,jsonb)'),
       ('public.set_ma_program_staffing(uuid,jsonb,jsonb)'),
       ('public.set_application_form(uuid,uuid,uuid,text,text,jsonb,jsonb,timestamptz,timestamptz)'),
       ('public.network_entity_metrics()')
     ) as t(sig)
    where has_function_privilege('authenticated', to_regprocedure(t.sig), 'EXECUTE')),
  4,
  'E2: authenticated는 넷을 그대로 실행할 수 있다(화면을 끄는 것이 목적이 아니다)'
);

set local role anon;
select throws_ok(
  $fx$ select public.set_program_staffing(
         'd0000000-0000-0000-0000-0000000000d1'::uuid, '[]'::jsonb, '[]'::jsonb) $fx$,
  '42501', null,
  'E3: anon의 실제 호출이 권한 단계에서 거절된다'
);
select throws_ok(
  $fx$ select * from public.network_entity_metrics() $fx$,
  '42501', null,
  'E4: anon의 집계 RPC 호출도 거절된다'
);
reset role;

-- 본문의 자체 인가는 그대로 남아 있어야 합니다 — 문을 좁혔다고 안쪽 검사를 뺀 것이
-- 아닙니다. 권한이 없는 로그인 사용자는 EXECUTE는 통과하고 본문에서 거절됩니다.
set local role authenticated;
select set_config('request.jwt.claims',
  '{"app_user_id":"00000000-0000-0000-0000-0000000000f2","session_version":1}', true);
select throws_ok(
  $fx$ select public.set_program_staffing(
         'd0000000-0000-0000-0000-0000000000d1'::uuid, '[]'::jsonb, '[]'::jsonb) $fx$,
  '42501', null,
  'E5: 사업 쓰기 권한이 없는 로그인 사용자는 함수 본문의 인가에서 거절된다'
);
reset role;

select * from finish();
rollback;
