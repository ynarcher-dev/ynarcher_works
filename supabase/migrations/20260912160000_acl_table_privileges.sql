-- =====================================================================
-- public 스키마 테이블 권한 — 인벤토리 전수에 대한 유한 보정 (AUTHZ-1/2)
--
-- 20260912025406은 원장 11개에만 권한을 적었고 나머지는 공백으로 남았습니다. 이 파일은
-- **재생된 카탈로그 전수(159개 표)**를 근거로 그 공백을 닫습니다. 표별 결정과 근거는
-- supabase/security/acl-decisions.json이 소유하며, 이 파일은 그 결정을 옮긴 것입니다
-- (scripts/security/emit-grant-sql.mjs가 같은 문장을 다시 찍어 대조할 수 있습니다).
--
-- 권한을 주는 근거는 네 가지를 **모두** 본 결과입니다.
--   (1) 재생된 DB의 실제 정책 — 정책이 없는 명령에는 권한을 주지 않습니다.
--   (2) 화면의 직접 호출(.from('표'))과 설정 객체를 거친 간접 호출.
--   (3) SECURITY INVOKER RPC가 **호출자 권한으로** 닿는 표. 정책과 직접 호출만 보면 이
--       요구가 통째로 빠집니다 — INVOKER는 호출자 권한으로 돌기 때문에 권한이 없으면 RPC가
--       그 자리에서 42501로 멈춥니다. SECURITY DEFINER는 소유자 권한으로 도므로 그 안쪽
--       표는 대상이 아닙니다(권한 경계에서 끊습니다).
--   (4) Edge Function 전수 감사 — service_role 경로와 호출자 JWT 경로를 갈라 봤습니다.
--
-- SELECT는 "읽는 화면이 있는가"만으로 정하지 않습니다. PostgreSQL은 쓰기 문에도 SELECT를
-- 따로 요구합니다.
--   · insert ... returning (supabase-js의 .insert(...).select())은 돌려줄 칸을 읽습니다.
--   · update/delete의 WHERE에 쓰인 칸도 읽습니다.
-- **RLS를 우회하는 service_role도 테이블 ACL은 그대로 받습니다.** 그래서 "INSERT만 주면 된다"가
-- 실행 시점에 42501로 무너집니다 — application-submit이 제출 행의 id를 돌려받는 자리
-- (application-submit/index.ts:121)와 게스트 초대를 참가자로 좁혀 소진하는 자리
-- (_shared/guestAccount.ts:321, _shared/guestSession.ts:187)가 그 예입니다. 체인 꼬리와
-- 함수 본문의 문 단위로 이 둘을 찾아 최소 SELECT를 함께 적습니다.
--
-- 하지 않는 것
--   · `all tables in schema` 같은 미래 객체까지 암묵적으로 포함하는 부여. 대상은 아래
--     이름으로 적은 표뿐입니다(기본 권한은 다음 마이그레이션이 따로 다룹니다).
--   · anon에 어떤 행 권한도 주지 않습니다. 게스트도 로그인 뒤에는 authenticated 롤이며,
--     내부·외부 경계는 계속 RLS가 정합니다.
--   · 근거를 찾지 못한 기존 권한의 회수. 우리 조사가 못 본 경로일 수 있어 회수하지 않고
--     acl-decisions.json의 확인 대기 목록에 남깁니다.
--
-- service_role: 깨끗한 재생에서 이 역할은 public 159개 표 전부에 행 권한이 **없었습니다**.
--   supabaseAdmin() 경로의 Edge Function이 새 환경에서 전부 42501로 떨어지는 상태였고,
--   내부 인증(internalAuth.ts)이 users·workspace_permissions를 읽지 못해 함께 막혔습니다.
--   여기서는 Edge 전수 감사가 확인한 표에만, 확인된 연산만 줍니다.
--
-- 물리 삭제(DELETE)는 네 표뿐이며 모두 **DELETE 정책이 이미 있는** 자리입니다.
--   capital_call_payments — 캐피탈콜 삭제가 납입 행을 물리 삭제합니다
--     (features/fund/hooks.ts useDeleteCapitalCall, CapitalCallPanel.tsx가 호출).
--   fund_managers / fund_purposes / investment_purposes — 배정성 원장이라 INVOKER RPC가
--     "지우고 다시 넣기"로 행을 교체합니다(set_fund_staffing / set_fund_purposes /
--     set_investment_purposes). 이 RPC들은 호출자 권한으로 돌아 권한이 없으면 멈춥니다.
--   그 밖의 업무 표는 종전대로 soft delete이며 DELETE를 주지 않습니다.
-- =====================================================================

-- ── 가드: 권한을 주는 표에 RLS가 켜져 있는가 ────────────────────────────
--
-- 권한만 있고 RLS가 꺼져 있으면 그 표는 전체 공개가 됩니다. 부여 직전에 확인하고
-- 하나라도 어긋나면 마이그레이션을 실패시킵니다.
do $$
declare
  v_missing text;
begin
  select string_agg(t.name, ', ' order by t.name)
    into v_missing
    from (values
      ('access_logs'),
      ('application_forms'),
      ('application_submissions'),
      ('approval_document_links'),
      ('approval_documents'),
      ('approval_form_versions'),
      ('approval_forms'),
      ('approval_lines'),
      ('approval_program_links'),
      ('approval_reads'),
      ('approval_recipients'),
      ('assets'),
      ('attachment_extracts'),
      ('attachments'),
      ('attendance_days'),
      ('attendance_edits'),
      ('attendance_policies'),
      ('attendance_statuses'),
      ('audit_logs'),
      ('board_posts'),
      ('boards'),
      ('branch_members'),
      ('branches'),
      ('capital_call_payments'),
      ('capital_calls'),
      ('category_tags'),
      ('company_category_tags'),
      ('company_status_tags'),
      ('country_tags'),
      ('departments'),
      ('dept_budgets'),
      ('dept_members'),
      ('entity_contributions'),
      ('entity_feedback'),
      ('field_tags'),
      ('fund_lps'),
      ('fund_managers'),
      ('fund_purposes'),
      ('funds'),
      ('guest_identities'),
      ('guest_invitations'),
      ('hr_profiles'),
      ('industry_tags'),
      ('investment_method_tags'),
      ('investment_purposes'),
      ('investment_stage_tags'),
      ('investments'),
      ('kpi_actual_revisions'),
      ('kpi_assignments'),
      ('kpi_blueprint_items'),
      ('kpi_blueprints'),
      ('kpi_records'),
      ('kpi_results'),
      ('kpi_template_items'),
      ('kpi_templates'),
      ('kpi_versions'),
      ('location_region_tags'),
      ('location_tags'),
      ('ma_buyers'),
      ('ma_program_departments'),
      ('ma_program_managers'),
      ('ma_program_party_links'),
      ('ma_program_timeline_items'),
      ('ma_programs'),
      ('ma_sellers'),
      ('meeting_minute_links'),
      ('meeting_minutes'),
      ('meeting_recording_segments'),
      ('meeting_recordings'),
      ('meeting_room_reservations'),
      ('meeting_rooms'),
      ('module_templates'),
      ('networks'),
      ('notifications'),
      ('org_levels'),
      ('org_versions'),
      ('pay_step_tags'),
      ('permission_templates'),
      ('position_tags'),
      ('program_announcements'),
      ('program_departments'),
      ('program_links'),
      ('program_managers'),
      ('program_module_public_links'),
      ('program_modules'),
      ('program_notices'),
      ('program_overviews'),
      ('program_participant_entries'),
      ('program_participants'),
      ('program_posts'),
      ('program_questions'),
      ('program_timeline_items'),
      ('programs'),
      ('rank_tags'),
      ('region_tags'),
      ('startup_managers'),
      ('startups'),
      ('system_events'),
      ('trade_partners'),
      ('upload_batches'),
      ('users'),
      ('workspace_permissions')
    ) as t(name)
    left join pg_class c
      on c.relname = t.name
     and c.relnamespace = 'public'::regnamespace
     and c.relkind = 'r'
   where c.oid is null or c.relrowsecurity is false;

  if v_missing is not null then
    raise exception
      'RLS가 꺼져 있거나 존재하지 않는 표에는 권한을 주지 않습니다: %', v_missing
      using errcode = '42501';
  end if;
end $$;

-- ── 부여 전 스냅샷 ──────────────────────────────────────────────────────
--
-- 끝에서 "이 마이그레이션이 의도 밖으로 권한을 넓히지 않았다"를 스스로 증명합니다.
-- 절대값이 아니라 전후 차이를 봅니다 — 레거시 자동 노출 시절에 만들어진 기존 DB가
-- 이 파일이 준 적 없는 권한 때문에 멈춰서는 안 되기 때문입니다.
create temporary table _acl_before as
select c.relname as name,
       r.role_name,
       p.priv,
       has_table_privilege(r.role_name, c.oid, p.priv) as had
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
 cross join (values ('anon'), ('authenticated'), ('service_role')) as r(role_name)
 cross join (values ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE'),
                    ('TRUNCATE'), ('REFERENCES'), ('TRIGGER')) as p(priv)
 where n.nspname = 'public' and c.relkind = 'r';

-- ── 회수: 레거시 자동 노출 권한 + 행을 열지 않는 권한 ───────────────────
--
-- 기존 클라우드 프로젝트는 예전 Data API 자동 노출 기본값으로 만들어져 anon·authenticated가
-- 모든 표의 DML을 이미 가진 상태일 수 있습니다. 깨끗한 재생에는 그 권한이 없어서 단순 grant만
-- 해도 맞지만, 운영 업그레이드에서는 먼저 같은 유한 인벤토리의 DML을 모두 걷고 아래 결정표대로
-- authenticated 권한만 다시 부여해야 두 환경이 같은 ACL에 도달합니다. anon은 표를 직접 읽지
-- 않으며 공개 진입은 Edge Function을 사용합니다.
--
-- TRUNCATE·REFERENCES·TRIGGER도 기본 권한을 타고 딸려 온 것이며 Data API 경로는 셋 다 쓰지
-- 않습니다. 특히 TRUNCATE는 정책을 거치지 않고 표를 통째로 비우는 RLS 우회 경로입니다.
-- REFERENCES·TRIGGER는 **생성 시점에만** 검사하므로 이미 만들어진 외래키·트리거는 그대로
-- 남습니다.
revoke select, insert, update, delete, truncate, references, trigger on table
  public._retired_asset_checkouts,
  public._retired_corporates,
  public._retired_etc,
  public._retired_exp,
  public._retired_experts,
  public._retired_global_networks,
  public._retired_institutions,
  public._retired_investors,
  public._retired_ma_program_links,
  public._retired_ma_program_module_assignees,
  public._retired_ma_program_modules,
  public._retired_ma_program_participants,
  public._retired_ma_program_posts,
  public._retired_others,
  public._retired_universities,
  public._retired_van,
  public._retired_vendors,
  public.access_logs,
  public.action_items,
  public.activity_attachments,
  public.activity_attendees,
  public.activity_minutes,
  public.application_answers,
  public.application_form_fields,
  public.application_forms,
  public.application_submissions,
  public.approval_budget_revisions,
  public.approval_doc_counters,
  public.approval_document_events,
  public.approval_document_links,
  public.approval_documents,
  public.approval_form_versions,
  public.approval_forms,
  public.approval_legacy_actor_mappings,
  public.approval_legacy_actors,
  public.approval_legacy_attachment_refs,
  public.approval_legacy_document_links,
  public.approval_legacy_documents,
  public.approval_legacy_import_batches,
  public.approval_legacy_participants,
  public.approval_lines,
  public.approval_program_links,
  public.approval_reads,
  public.approval_recipients,
  public.assets,
  public.attachment_extracts,
  public.attachments,
  public.attendance_days,
  public.attendance_edits,
  public.attendance_policies,
  public.attendance_statuses,
  public.audit_logs,
  public.board_comments,
  public.board_posts,
  public.boards,
  public.branch_members,
  public.branches,
  public.capital_call_payments,
  public.capital_calls,
  public.category_tags,
  public.company_category_tags,
  public.company_status_tags,
  public.country_tags,
  public.departments,
  public.dept_budgets,
  public.dept_members,
  public.entity_codes,
  public.entity_contributions,
  public.entity_feedback,
  public.export_jobs,
  public.field_tags,
  public.fund_lps,
  public.fund_managers,
  public.fund_purposes,
  public.funds,
  public.guest_credentials,
  public.guest_identities,
  public.guest_invitations,
  public.hr_assignments,
  public.hr_profiles,
  public.hr_trainings,
  public.industry_tags,
  public.investment_method_tags,
  public.investment_purposes,
  public.investment_stage_tags,
  public.investments,
  public.kpi_actual_revisions,
  public.kpi_assignments,
  public.kpi_blueprint_items,
  public.kpi_blueprints,
  public.kpi_records,
  public.kpi_results,
  public.kpi_template_items,
  public.kpi_templates,
  public.kpi_versions,
  public.location_region_tags,
  public.location_tags,
  public.ma_buyers,
  public.ma_deal_documents,
  public.ma_deal_stage_logs,
  public.ma_deals,
  public.ma_match_candidates,
  public.ma_program_departments,
  public.ma_program_managers,
  public.ma_program_party_links,
  public.ma_program_timeline_items,
  public.ma_programs,
  public.ma_sellers,
  public.meeting_minute_links,
  public.meeting_minute_people,
  public.meeting_minutes,
  public.meeting_places,
  public.meeting_recording_segments,
  public.meeting_recordings,
  public.meeting_room_reservations,
  public.meeting_rooms,
  public.module_kpi_snapshots,
  public.module_templates,
  public.networks,
  public.notification_logs,
  public.notifications,
  public.org_levels,
  public.org_versions,
  public.partners,
  public.pay_step_tags,
  public.permission_templates,
  public.portfolio_financials,
  public.position_tags,
  public.program_announcements,
  public.program_departments,
  public.program_links,
  public.program_managers,
  public.program_module_assignees,
  public.program_module_public_links,
  public.program_modules,
  public.program_notices,
  public.program_overviews,
  public.program_participant_entries,
  public.program_participants,
  public.program_posts,
  public.program_questions,
  public.program_timeline_items,
  public.programs,
  public.project_members,
  public.project_milestones,
  public.project_tasks,
  public.projects,
  public.quick_memos,
  public.rank_tags,
  public.region_tags,
  public.startup_managers,
  public.startups,
  public.system_events,
  public.task_checklist_items,
  public.timeline_conflicts,
  public.trade_partners,
  public.upload_batches,
  public.users,
  public.workspace_permissions
from anon, authenticated;

-- MAINTAIN은 PostgreSQL 17에서 들어온 권한입니다(VACUUM·ANALYZE·REINDEX·CLUSTER·
-- REFRESH MATERIALIZED VIEW·LOCK TABLE). 20260912025406은 이 권한을 몰랐기에, 그때 정리한
-- 표 12개에도 MAINTAIN만은 그대로 남아 있었습니다. 16 이하에는 문법 자체가 없으므로
-- 서버 버전을 보고 돕니다 — 없는 버전에서 마이그레이션이 멈추지 않아야 합니다.
do $$
declare
  t text;
begin
  if current_setting('server_version_num')::int < 170000 then
    raise notice 'PostgreSQL 17 미만이라 MAINTAIN 회수를 건너뜁니다(이 버전에 없는 권한입니다).';
    return;
  end if;
  foreach t in array array[
    '_retired_asset_checkouts',
    '_retired_corporates',
    '_retired_etc',
    '_retired_exp',
    '_retired_experts',
    '_retired_global_networks',
    '_retired_institutions',
    '_retired_investors',
    '_retired_ma_program_links',
    '_retired_ma_program_module_assignees',
    '_retired_ma_program_modules',
    '_retired_ma_program_participants',
    '_retired_ma_program_posts',
    '_retired_others',
    '_retired_universities',
    '_retired_van',
    '_retired_vendors',
    'access_logs',
    'action_items',
    'activity_attachments',
    'activity_attendees',
    'activity_minutes',
    'application_answers',
    'application_form_fields',
    'application_forms',
    'application_submissions',
    'approval_budget_revisions',
    'approval_doc_counters',
    'approval_document_events',
    'approval_document_links',
    'approval_documents',
    'approval_form_versions',
    'approval_forms',
    'approval_legacy_actor_mappings',
    'approval_legacy_actors',
    'approval_legacy_attachment_refs',
    'approval_legacy_document_links',
    'approval_legacy_documents',
    'approval_legacy_import_batches',
    'approval_legacy_participants',
    'approval_lines',
    'approval_program_links',
    'approval_reads',
    'approval_recipients',
    'assets',
    'attachment_extracts',
    'attachments',
    'attendance_days',
    'attendance_edits',
    'attendance_policies',
    'attendance_statuses',
    'audit_logs',
    'board_comments',
    'board_posts',
    'boards',
    'branch_members',
    'branches',
    'capital_call_payments',
    'capital_calls',
    'category_tags',
    'company_category_tags',
    'company_status_tags',
    'country_tags',
    'departments',
    'dept_budgets',
    'dept_members',
    'entity_codes',
    'entity_contributions',
    'entity_feedback',
    'export_jobs',
    'field_tags',
    'fund_lps',
    'fund_managers',
    'fund_purposes',
    'funds',
    'guest_credentials',
    'guest_identities',
    'guest_invitations',
    'hr_assignments',
    'hr_profiles',
    'hr_trainings',
    'industry_tags',
    'investment_method_tags',
    'investment_purposes',
    'investment_stage_tags',
    'investments',
    'kpi_actual_revisions',
    'kpi_assignments',
    'kpi_blueprint_items',
    'kpi_blueprints',
    'kpi_records',
    'kpi_results',
    'kpi_template_items',
    'kpi_templates',
    'kpi_versions',
    'location_region_tags',
    'location_tags',
    'ma_buyers',
    'ma_deal_documents',
    'ma_deal_stage_logs',
    'ma_deals',
    'ma_match_candidates',
    'ma_program_departments',
    'ma_program_managers',
    'ma_program_party_links',
    'ma_program_timeline_items',
    'ma_programs',
    'ma_sellers',
    'meeting_minute_links',
    'meeting_minute_people',
    'meeting_minutes',
    'meeting_places',
    'meeting_recording_segments',
    'meeting_recordings',
    'meeting_room_reservations',
    'meeting_rooms',
    'module_kpi_snapshots',
    'module_templates',
    'networks',
    'notification_logs',
    'notifications',
    'org_levels',
    'org_versions',
    'partners',
    'pay_step_tags',
    'permission_templates',
    'portfolio_financials',
    'position_tags',
    'program_announcements',
    'program_departments',
    'program_links',
    'program_managers',
    'program_module_assignees',
    'program_module_public_links',
    'program_modules',
    'program_notices',
    'program_overviews',
    'program_participant_entries',
    'program_participants',
    'program_posts',
    'program_questions',
    'program_timeline_items',
    'programs',
    'project_members',
    'project_milestones',
    'project_tasks',
    'projects',
    'quick_memos',
    'rank_tags',
    'region_tags',
    'startup_managers',
    'startups',
    'system_events',
    'task_checklist_items',
    'timeline_conflicts',
    'trade_partners',
    'upload_batches',
    'users',
    'workspace_permissions'
  ]
  loop
    execute format('revoke maintain on table public.%I from anon, authenticated', t);
  end loop;
end $$;

-- ── 부여: authenticated ─────────────────────────────────────────────────
--
-- 표별 근거(호출 파일·줄, 경유 RPC, 정책 명령)는 acl-decisions.json의
-- decisions[].evidence가 갖습니다. 여기서 같은 내용을 되풀이하지 않습니다.

grant insert on table
  public.approval_recipients
to authenticated;

grant insert, update on table
  public.approval_reads
to authenticated;

grant select on table
  public.access_logs,
  public.application_forms,
  public.application_submissions,
  public.attachment_extracts,
  public.audit_logs,
  public.branch_members,
  public.dept_budgets,
  public.guest_identities,
  public.kpi_records,
  public.kpi_results,
  public.kpi_versions,
  public.ma_program_departments,
  public.ma_program_managers,
  public.ma_program_party_links,
  public.ma_program_timeline_items,
  public.meeting_minute_links,
  public.meeting_recording_segments,
  public.meeting_recordings,
  public.permission_templates,
  public.program_departments,
  public.program_managers,
  public.program_timeline_items,
  public.startup_managers,
  public.workspace_permissions
to authenticated;

grant select, insert on table
  public.approval_form_versions,
  public.attendance_edits,
  public.entity_contributions,
  public.kpi_actual_revisions,
  public.kpi_blueprint_items,
  public.kpi_blueprints,
  public.upload_batches
to authenticated;

grant select, insert, delete on table
  public.capital_call_payments,
  public.fund_managers,
  public.fund_purposes,
  public.investment_purposes
to authenticated;

grant select, insert, update on table
  public.approval_document_links,
  public.approval_documents,
  public.approval_forms,
  public.approval_lines,
  public.approval_program_links,
  public.assets,
  public.attachments,
  public.attendance_days,
  public.attendance_policies,
  public.attendance_statuses,
  public.board_posts,
  public.boards,
  public.branches,
  public.capital_calls,
  public.category_tags,
  public.company_category_tags,
  public.company_status_tags,
  public.country_tags,
  public.departments,
  public.dept_members,
  public.entity_feedback,
  public.field_tags,
  public.fund_lps,
  public.funds,
  public.guest_invitations,
  public.hr_profiles,
  public.industry_tags,
  public.investment_method_tags,
  public.investment_stage_tags,
  public.investments,
  public.kpi_assignments,
  public.kpi_template_items,
  public.kpi_templates,
  public.location_region_tags,
  public.location_tags,
  public.ma_buyers,
  public.ma_programs,
  public.ma_sellers,
  public.meeting_minutes,
  public.meeting_room_reservations,
  public.meeting_rooms,
  public.networks,
  public.org_levels,
  public.pay_step_tags,
  public.position_tags,
  public.program_announcements,
  public.program_links,
  public.program_module_public_links,
  public.program_notices,
  public.program_overviews,
  public.program_participant_entries,
  public.program_participants,
  public.program_posts,
  public.program_questions,
  public.programs,
  public.rank_tags,
  public.region_tags,
  public.startups,
  public.system_events,
  public.trade_partners
to authenticated;

grant select, update on table
  public.module_templates,
  public.notifications,
  public.org_versions,
  public.program_modules,
  public.users
to authenticated;

-- acl-decisions.json의 review_authenticated_row는 호출 근거를 아직 확정하지 못해
-- 이번 정리에서 회수하지 않기로 한 기존 권한입니다. 위에서 기존 프로젝트의 자동 부여
-- 권한을 모두 지웠으므로, 신규 설치와 기존 설치가 같은 결과가 되도록 이를 명시적으로
-- 복원합니다.
grant select on table
  public.approval_document_events,
  public.approval_legacy_actor_mappings,
  public.approval_legacy_actors,
  public.approval_legacy_attachment_refs,
  public.approval_legacy_document_links,
  public.approval_legacy_documents,
  public.approval_legacy_import_batches,
  public.approval_legacy_participants,
  public.board_comments
to authenticated;

grant insert on table
  public.kpi_versions,
  public.module_templates
to authenticated;

grant update on table
  public.kpi_blueprint_items,
  public.kpi_blueprints,
  public.kpi_versions
to authenticated;

-- ── 부여: service_role ──────────────────────────────────────────────────
--
-- Edge Function 전수 감사(22개 함수 전문 확인)가 supabaseAdmin() 경로에서 실제로 닿는 표와
-- 연산입니다. 호출자 JWT로 도는 경로(supabaseAsCaller)는 authenticated이므로 여기 없습니다.

grant insert on table
  public.application_answers,
  public.audit_logs,
  public.hr_profiles
to service_role;

grant select on table
  public.application_form_fields,
  public.application_forms,
  public.funds,
  public.guest_identities,
  public.location_tags,
  public.ma_programs,
  public.meeting_recordings,
  public.module_templates,
  public.networks,
  public.permission_templates,
  public.program_links,
  public.program_modules,
  public.program_posts,
  public.programs,
  public.startups
to service_role;

grant select, insert on table
  public.access_logs,
  public.application_submissions,
  public.attachments,
  public.workspace_permissions
to service_role;

grant select, insert, update on table
  public.attachment_extracts,
  public.guest_credentials
to service_role;

grant select, insert, update, delete on table
  public.users
to service_role;

grant select, update on table
  public.guest_invitations,
  public.meeting_recording_segments,
  public.program_module_public_links,
  public.program_participants
to service_role;

-- ── 사후 확인 ───────────────────────────────────────────────────────────
do $$
declare
  v_bad text;
begin
  -- (1) anon에 행 권한이 하나라도 생겼는가 — 하나도 없어야 합니다.
  select string_agg(format('%s(%s)', c.relname, p.priv), ', ' order by c.relname, p.priv)
    into v_bad
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
   cross join (values ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE')) as p(priv)
   where n.nspname = 'public' and c.relkind = 'r'
     and has_table_privilege('anon', c.oid, p.priv);
  if v_bad is not null then
    raise exception 'anon에 행 권한이 있습니다(있어서는 안 됩니다): %', v_bad using errcode = '42501';
  end if;

  -- (2) authenticated의 DELETE는 승인된 네 표뿐인가.
  select string_agg(c.relname, ', ' order by c.relname)
    into v_bad
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind = 'r'
     and has_table_privilege('authenticated', c.oid, 'DELETE')
     and c.relname <> all (array[
       'capital_call_payments',
       'fund_managers',
       'fund_purposes',
       'investment_purposes'
     ]);
  if v_bad is not null then
    raise exception
      '승인되지 않은 표에 authenticated DELETE가 있습니다: %', v_bad using errcode = '42501';
  end if;

  -- (3) 이 마이그레이션이 anon·authenticated의 비행 권한을 새로 만들지 않았는가.
  select string_agg(format('%s/%s(%s)', b.name, b.role_name, b.priv), ', ')
    into v_bad
    from _acl_before b
    join pg_class c on c.relname = b.name and c.relnamespace = 'public'::regnamespace
   where b.role_name in ('anon', 'authenticated')
     and b.priv in ('TRUNCATE', 'REFERENCES', 'TRIGGER')
     and b.had is false
     and has_table_privilege(b.role_name, c.oid, b.priv);
  if v_bad is not null then
    raise exception '비행 권한이 새로 생겼습니다: %', v_bad using errcode = '42501';
  end if;

  -- (4) 회수 뒤 anon·authenticated에 비행 권한이 남아 있지 않은가(전수).
  select string_agg(format('%s/%s(%s)', c.relname, r.role_name, p.priv), ', '
                    order by c.relname, r.role_name, p.priv)
    into v_bad
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
   cross join (values ('anon'), ('authenticated')) as r(role_name)
   cross join (values ('TRUNCATE'), ('REFERENCES'), ('TRIGGER')) as p(priv)
   where n.nspname = 'public' and c.relkind = 'r'
     and has_table_privilege(r.role_name, c.oid, p.priv);
  if v_bad is not null then
    raise exception '비행 권한이 남아 있습니다: %', v_bad using errcode = '42501';
  end if;
end $$;

drop table _acl_before;
