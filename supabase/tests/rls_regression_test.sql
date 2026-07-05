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
select plan(12);

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
  ('00000000-0000-0000-0000-0000000000ea', 'management','write','global', null);

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

-- 케이스 8: public 전 테이블에 RLS 활성화 누락이 없다
select is(
  (select count(*)::int from pg_tables where schemaname = 'public' and rowsecurity = false),
  0,
  '케이스8: RLS 미적용 테이블 없음'
);

select * from finish();
rollback;
