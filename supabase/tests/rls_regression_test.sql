-- =====================================================================
-- [Phase 2] RLS 회귀 테스트 (pgTAP)
-- 실행: supabase test db   (Docker 로컬 스택에서 pgtap 확장 사용)
-- 근거: docs/docs_dev/3_database_rls_policy_matrix.md §5 (테스트 계정 10종 + 보안 케이스 8종)
--
-- 참고: funds/lps/deals/programs 등 일부 대상 테이블은 후속 Phase에서 생성되므로,
--       본 회귀 테스트는 Phase 2 존재 테이블(startups 등)과 헬퍼 판정으로 동등 케이스를 검증한다.
--       해당 테이블 도입 시 케이스를 실제 테이블 접근으로 승격한다.
-- =====================================================================
begin;
select plan(34);

-- 픽스처: 테스트 계정 10종 + 데이터 (슈퍼유저로 삽입, 트랜잭션 종료 시 롤백) ----
insert into public.startups(id, name) values
  ('a0000000-0000-0000-0000-0000000000a1', 'A컴퍼니'),
  ('b0000000-0000-0000-0000-0000000000b2', 'B컴퍼니');

insert into public.users(id, user_type, name, session_version, company_id) values
  ('00000000-0000-0000-0000-0000000000e1', 'super_admin',      'test_master_user',           1, null),
  ('00000000-0000-0000-0000-0000000000e2', 'read_only',        'test_no_permission_user',    1, null),
  ('00000000-0000-0000-0000-0000000000e3', 'read_only',        'test_read_only_user',        1, null),
  ('00000000-0000-0000-0000-0000000000e4', 'ac_business',      'test_ac_write_user',         1, null),
  ('00000000-0000-0000-0000-0000000000e5', 'temporary_guest',  'test_expired_permission_user',1, null),
  ('00000000-0000-0000-0000-0000000000e6', 'external_startup', 'test_guest_startup_user',    1, 'a0000000-0000-0000-0000-0000000000a1'),
  ('00000000-0000-0000-0000-0000000000e7', 'external_expert',  'test_guest_expert_user',     1, null),
  ('00000000-0000-0000-0000-0000000000e8', 'fund_manager',     'test_fund_user',             1, null),
  ('00000000-0000-0000-0000-0000000000e9', 'mna_manager',      'test_mna_user',              1, null),
  ('00000000-0000-0000-0000-0000000000ea', 'management_support','test_hr_user',              1, null);

insert into public.workspace_permissions(user_id, workspace_key, permission_level, scope_type, expires_at) values
  ('00000000-0000-0000-0000-0000000000e3', 'networks', 'read',  'global', null),                 -- read_only
  ('00000000-0000-0000-0000-0000000000e4', 'ac',       'write', 'program', null),                -- ac write only
  ('00000000-0000-0000-0000-0000000000e5', 'mna',      'read',  'temporary', now() - interval '1 day'), -- 만료
  ('00000000-0000-0000-0000-0000000000e6', 'guest',    'write', 'company', null),
  ('00000000-0000-0000-0000-0000000000e8', 'fund',     'write', 'fund', null),
  ('00000000-0000-0000-0000-0000000000e9', 'mna',      'write', 'global', null),
  ('00000000-0000-0000-0000-0000000000ea', 'networks', 'write', 'global', null),
  ('00000000-0000-0000-0000-0000000000ea', 'management','write','global', null),
  ('00000000-0000-0000-0000-0000000000ea', 'office',   'write', 'global', null),   -- office 신키
  ('00000000-0000-0000-0000-0000000000e4', 'startup',  'write', 'global', null);   -- startup 신키

-- 임퍼소네이트 도우미: 매 케이스마다 role/claims 설정 후 reset ------------------
-- (pgTAP 내에서는 set local role + set_config('request.jwt.claims', ...) 조합 사용)

-- 케이스 1: 무권한 사용자는 startups(내부 마스터)를 조회할 수 없다 (0건)
set local role authenticated;
select set_config('request.jwt.claims', '{"app_user_id":"00000000-0000-0000-0000-0000000000e2","session_version":1}', true);
select is((select count(*)::int from public.startups), 0, '케이스1: 무권한 사용자 startups SELECT 0건');
reset role;

-- 케이스 2: read_only 사용자가 startups INSERT 시 RLS 차단(권한 오류)
set local role authenticated;
select set_config('request.jwt.claims', '{"app_user_id":"00000000-0000-0000-0000-0000000000e3","session_version":1}', true);
select throws_ok(
  $$ insert into public.startups(name) values ('불가') $$,
  '42501',
  null,
  '케이스2: read_only 사용자 INSERT는 RLS로 차단'
);
select is((select count(*)::int from public.startups), 2, '케이스2b: read_only 사용자는 전체 마스터 SELECT 가능');
reset role;

-- 케이스 3: 만료 권한 사용자는 해당 데이터 접근이 차단된다
set local role authenticated;
select set_config('request.jwt.claims', '{"app_user_id":"00000000-0000-0000-0000-0000000000e5","session_version":1}', true);
select is(app.can_read_workspace('mna'), false, '케이스3: 만료된 mna 권한은 read 불가');
reset role;

-- 케이스 4: 외부 스타트업은 타사(B) 데이터 접근이 원천 차단된다
set local role authenticated;
select set_config('request.jwt.claims', '{"app_user_id":"00000000-0000-0000-0000-0000000000e6","session_version":1}', true);
select is(app.can_access_company('a0000000-0000-0000-0000-0000000000a1'), true,  '케이스4a: 본인 기업(A) 접근 허용');
select is(app.can_access_company('b0000000-0000-0000-0000-0000000000b2'), false, '케이스4b: 타사(B) 접근 차단');
select is((select count(*)::int from public.startups), 0, '케이스4c: 외부 스타트업 마스터 직접 SELECT 0건');
reset role;

-- 케이스 5: 외부 전문가는 미배정 프로그램/타인 데이터에 접근 불가
set local role authenticated;
select set_config('request.jwt.claims', '{"app_user_id":"00000000-0000-0000-0000-0000000000e7","session_version":1}', true);
select is(app.can_access_program('c0000000-0000-0000-0000-0000000000c3'), false, '케이스5: 외부 전문가 미배정 프로그램 접근 차단');
reset role;

-- 케이스 6: AC write 사용자는 FUND(출자자 명부 계열) 접근 권한이 없다
set local role authenticated;
select set_config('request.jwt.claims', '{"app_user_id":"00000000-0000-0000-0000-0000000000e4","session_version":1}', true);
select is(app.can_read_workspace('fund'), false, '케이스6: AC write 사용자 fund 읽기 불가');
reset role;

-- 케이스 7: 어떤 사용자도 audit_logs를 UPDATE/DELETE 할 수 없다
insert into public.audit_logs(action) values ('SEED_FOR_TEST');
set local role authenticated;
select set_config('request.jwt.claims', '{"app_user_id":"00000000-0000-0000-0000-0000000000e1","session_version":1}', true);
select is(
  (with d as (delete from public.audit_logs returning 1) select count(*)::int from d),
  0,
  '케이스7a: 관리자도 audit_logs DELETE 불가(0건 영향)'
);
select is(
  (with u as (update public.audit_logs set reason = '변조' returning 1) select count(*)::int from u),
  0,
  '케이스7b: audit_logs UPDATE 불가(0건 영향)'
);
reset role;

-- 케이스 9: office/startup 신설 워크스페이스 키 권한 판정 (P0-2 정합화 회귀)
set local role authenticated;
select set_config('request.jwt.claims', '{"app_user_id":"00000000-0000-0000-0000-0000000000ea","session_version":1}', true);
select is(app.can_write_workspace('office'), true, '케이스9a: office write 권한 보유자 판정 통과');
reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"app_user_id":"00000000-0000-0000-0000-0000000000e4","session_version":1}', true);
select is(app.can_write_workspace('startup'), true, '케이스9b: startup write 권한 보유자 판정 통과');
reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"app_user_id":"00000000-0000-0000-0000-0000000000e2","session_version":1}', true);
select is(app.can_read_workspace('office') or app.can_read_workspace('startup'), false,
  '케이스9c: 무권한 사용자 office/startup 접근 차단');
reset role;

-- 케이스 10: 기여 로그는 본인 명의로만 남길 수 있다(사칭 차단) ------------------
-- 근거: 20260721120000_networks_shared_management_guard.sql
--   기여 로그는 권한을 주지 않지만 '누가 했는가'의 기록이므로 행위자 위조를 막는다.
reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"app_user_id":"00000000-0000-0000-0000-0000000000ea","session_version":1}', true);

-- 10a: 본인 명의(= user_id 미지정 → 트리거가 현재 사용자로 스탬프) 기록은 허용
select lives_ok(
  $$insert into public.entity_contributions(entity_table, entity_id, action, source)
    values ('experts', 'a0000000-0000-0000-0000-0000000000a1', 'edited', 'manual')$$,
  '케이스10a: networks write 사용자는 본인 명의 기여 기록 가능'
);

-- 10b: 남의 user_id(master)를 명시해 사칭을 시도해도, 트리거가 현재 사용자로 덮어쓴다
select lives_ok(
  $$insert into public.entity_contributions(entity_table, entity_id, action, source, user_id, user_name)
    values ('experts', 'b0000000-0000-0000-0000-0000000000b2', 'edited', 'manual',
            '00000000-0000-0000-0000-0000000000e1', 'test_master_user')$$,
  '케이스10b: 사칭 시도 INSERT 자체는 수행됨(트리거가 행위자를 교정)'
);
select is(
  (select count(*)::int from public.entity_contributions
    where entity_id = 'b0000000-0000-0000-0000-0000000000b2'
      and user_id = '00000000-0000-0000-0000-0000000000e1'),
  0,
  '케이스10c: 타인 명의로 기록된 기여 행이 존재하지 않음(사칭 차단)'
);

-- 케이스 11: NETWORKS는 공동관리 — 비활성화 가드가 남아 있지 않다 --------------
-- 근거: 20260721120000_networks_shared_management_guard.sql
--   기여 로그 기반 파괴적 작업 가드는 우회 가능(로그를 스스로 넣으면 통과)해 실효가 없었고,
--   NETWORKS는 수정·비활성화 모두 공용으로 확정했다.
reset role;
select is(
  (select count(*)::int from pg_trigger
    where tgname like 'trg_%_destructive_guard' and not tgisinternal),
  0,
  '케이스11a: 파괴적 작업 가드 트리거가 제거됨'
);
select is(
  (select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'app' and p.proname in ('is_entity_contributor', 'guard_network_destructive')),
  0,
  '케이스11b: 기여자 기반 권한 판정 헬퍼가 제거됨'
);

-- 케이스 8: public 전 테이블에 RLS 활성화 누락이 없다
select is(
  (select count(*)::int from pg_tables where schemaname = 'public' and rowsecurity = false),
  0,
  '케이스8: RLS 미적용 테이블 없음'
);

-- 케이스 14: 하이웍스 복원 원장은 읽기 경계만 열고 클라이언트 쓰기는 닫는다 -----
select is(
  (select count(*)::int
     from pg_tables
    where schemaname = 'public'
      and tablename in (
        'approval_legacy_import_batches', 'approval_legacy_actors',
        'approval_legacy_actor_mappings', 'approval_legacy_documents',
        'approval_legacy_participants', 'approval_document_events',
        'approval_legacy_document_links', 'approval_legacy_attachment_refs'
      )
      and rowsecurity = false),
  0,
  '케이스14a: 하이웍스 복원 원장 8종 RLS 활성화'
);
select is(
  (select count(*)::int
     from pg_policies
    where schemaname = 'public'
      and tablename in (
        'approval_legacy_import_batches', 'approval_legacy_actors',
        'approval_legacy_actor_mappings', 'approval_legacy_documents',
        'approval_legacy_participants', 'approval_document_events',
        'approval_legacy_document_links', 'approval_legacy_attachment_refs'
      )
      and cmd = 'DELETE'),
  0,
  '케이스14b: 하이웍스 복원 원장 DELETE 정책 없음'
);
select is(
  (select count(*)::int
     from information_schema.role_table_grants
    where table_schema = 'public'
      and table_name in (
        'approval_legacy_import_batches', 'approval_legacy_actors',
        'approval_legacy_actor_mappings', 'approval_legacy_documents',
        'approval_legacy_participants', 'approval_document_events',
        'approval_legacy_document_links', 'approval_legacy_attachment_refs'
      )
      and grantee = 'authenticated'
      and privilege_type in ('INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER')),
  0,
  '케이스14c: authenticated는 하이웍스 복원 원장 쓰기 불가'
);
select is(
  (select count(*)::int
     from information_schema.role_table_grants
    where table_schema = 'public'
      and table_name in (
        'approval_legacy_import_batches', 'approval_legacy_actors',
        'approval_legacy_actor_mappings', 'approval_legacy_documents',
        'approval_legacy_participants', 'approval_document_events',
        'approval_legacy_document_links', 'approval_legacy_attachment_refs'
      )
      and grantee = 'anon'),
  0,
  '케이스14d: anon은 하이웍스 복원 원장 접근 불가'
);

-- 케이스 12: 레코드 코드 전역 레지스트리는 클라이언트가 닿을 수 없다 -------------
-- 근거: 20260731150000_entity_code_registry.sql
--   코드 유니크 보장을 entity_codes의 PK가 진다. 이 표를 클라이언트가 직접 쓸 수 있으면
--   남이 받을 코드를 미리 선점해 발급을 방해할 수 있으므로, 정책을 하나도 두지 않고
--   테이블 권한도 전부 회수해 트리거(DEFINER)만 닿게 한다.
reset role;
select is(
  (select count(*)::int from pg_policies where schemaname = 'public' and tablename = 'entity_codes'),
  0,
  '케이스12a: entity_codes에 RLS 정책이 하나도 없다(Default Deny)'
);
select is(
  (select count(*)::int
     from information_schema.role_table_grants
    where table_schema = 'public' and table_name = 'entity_codes'
      and grantee in ('anon', 'authenticated')),
  0,
  '케이스12b: anon·authenticated에 entity_codes 테이블 권한이 없다'
);
select is(
  (select count(*)::int
     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'claim_entity_code'
      and has_function_privilege('authenticated', p.oid, 'EXECUTE')),
  0,
  '케이스12c: authenticated가 코드 발급 함수를 직접 호출할 수 없다'
);
-- 코드는 원장에 행을 넣을 때만 트리거가 발급하며, 워크스페이스가 달라도 겹치지 않는다.
select is(
  (select count(*)::int from pg_trigger
    where tgname in ('trg_programs_assign_code', 'trg_ma_programs_assign_code',
                     'trg_project_programs_assign_code', 'trg_funds_assign_code')
      and not tgisinternal),
  4,
  '케이스12d: 코드 부여 트리거가 사업 3종·펀드에 모두 붙어 있다'
);

-- 케이스 13: 투자기업은 등록(INSERT)으로 만들 수 없다 --------------------------
-- 근거: 20260731180000_startups_invested_insert_guard.sql
--   승격 게이트(promote_to_invested)는 UPDATE 경로에만 걸려 있어, 처음부터 invested 로 넣으면
--   자사 투자 집행 근거 없이 투자기업이 생긴다. 대용량 업로드가 그 경로를 실제로 연다.
reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"app_user_id":"00000000-0000-0000-0000-0000000000e4","session_version":1}', true);
select throws_ok(
  $$ insert into public.startups(name, management_status) values ('우회투자사', 'invested') $$,
  '42501',
  null,
  '케이스13a: startup 쓰기 권한자도 invested 로 직접 등록할 수 없다'
);
select lives_ok(
  $$ insert into public.startups(name, management_status) values ('정상발굴사', 'sourced') $$,
  '케이스13b: 같은 사용자의 일반 등록(sourced)은 그대로 통과한다'
);
reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"app_user_id":"00000000-0000-0000-0000-0000000000e1","session_version":1}', true);
select lives_ok(
  $$ insert into public.startups(name, management_status) values ('관리자수습사', 'invested') $$,
  '케이스13c: 관리자는 오등록 수습을 위한 브레이크글라스로 남는다'
);
reset role;

-- 케이스 14: 결재 되돌림의 두 헬퍼는 사용자에게 열리지 않는다 -------------------
-- 근거: 20260905200000_approval_return_flow.sql
--   회차 복제(clone_approval_round)와 알림 팬아웃(notify_approval)은 호출자 검증을 하지
--   않는다 — 부르는 두 RPC가 "내 행인가·내 차례인가·기안자인가"를 먼저 확인한 뒤 부른다.
--   그래서 이 둘이 authenticated에 열리면 아무나 남의 문서에 회차를 만들고 남에게 알림을
--   보낼 수 있다. 처리 경로는 검증을 마친 RPC 둘뿐이어야 한다.
select is(
  (select count(*)::int
     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'app' and p.proname in ('clone_approval_round', 'notify_approval')
      and has_function_privilege('authenticated', p.oid, 'EXECUTE')),
  0,
  '케이스14a: authenticated가 회차 복제·알림 팬아웃 헬퍼를 직접 호출할 수 없다'
);
-- 반대로 처리·재상신 RPC는 열려 있어야 한다(닫히면 결재 자체가 멈춘다).
select is(
  (select count(*)::int
     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in ('decide_approval_document', 'resubmit_approval_document')
      and has_function_privilege('authenticated', p.oid, 'EXECUTE')),
  2,
  '케이스14b: 결재 처리·재상신 RPC는 authenticated에 열려 있다'
);
-- 결재선에 DELETE 정책이 없어야 회차 이력이 지워지지 않는다. 되돌림은 지난 회차의 도장을
-- 남겨 두는 것이 전제이고, 그 전제가 정책 한 줄로 무너지면 '1차 승인' 표시가 거짓이 된다.
select is(
  (select count(*)::int from pg_policies
    where schemaname = 'public' and tablename = 'approval_lines' and cmd = 'DELETE'),
  0,
  '케이스14c: approval_lines에 DELETE 정책이 없다(회차 이력은 지워지지 않는다)'
);

select * from finish();
rollback;
