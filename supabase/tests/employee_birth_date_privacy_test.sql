begin;
select plan(6);

select has_column(
  'public',
  'hr_profiles',
  'birth_date',
  '생년월일은 MANAGEMENT 전용 인사 원장에 존재한다'
);

select ok(
  not has_table_privilege('anon', 'public.hr_profiles', 'SELECT'),
  '익명 역할에는 인사 원장 조회 권한이 없다'
);

insert into public.users (id, user_type, name, session_version)
values
  ('97000000-0000-0000-0000-000000000001', 'management_support', '경영실 담당자', 1),
  ('97000000-0000-0000-0000-000000000002', 'mna_manager', '일반 임직원', 1),
  ('97000000-0000-0000-0000-000000000003', 'ac_business', '생년월일 대상자', 1);

insert into public.workspace_permissions
  (user_id, workspace_key, permission_level, scope_type, expires_at)
values
  ('97000000-0000-0000-0000-000000000001', 'management', 'write', 'global', null);

insert into public.hr_profiles (user_id, birth_date)
values ('97000000-0000-0000-0000-000000000003', date '1990-05-14');

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"app_user_id":"97000000-0000-0000-0000-000000000001","session_version":1}',
  true
);

select is(
  (select birth_date::text from public.hr_profiles where user_id = '97000000-0000-0000-0000-000000000003'),
  '1990-05-14',
  'MANAGEMENT 권한자는 생년월일을 조회한다'
);

select set_config(
  'request.jwt.claims',
  '{"app_user_id":"97000000-0000-0000-0000-000000000002","session_version":1}',
  true
);

select is(
  (select count(*)::integer from public.hr_profiles),
  0,
  'OFFICE 등 다른 내부 화면 권한만 가진 임직원에게 인사 원장 행이 보이지 않는다'
);

-- 데이터 변경 CTE는 최상위 문에서만 허용되므로 UPDATE를 따로 실행하고 결과를 확인한다.
select lives_ok(
  $$update public.hr_profiles
       set birth_date = date '1991-01-01'
     where user_id = '97000000-0000-0000-0000-000000000003'$$,
  'MANAGEMENT 쓰기 권한이 없는 사용자의 UPDATE는 오류 없이 0건에 그친다'
);

reset role;
select is(
  (select birth_date::text from public.hr_profiles
    where user_id = '97000000-0000-0000-0000-000000000003'),
  '1990-05-14',
  'MANAGEMENT 쓰기 권한이 없으면 생년월일이 바뀌지 않는다'
);

select * from finish();
rollback;
