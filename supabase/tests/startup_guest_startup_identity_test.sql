begin;
select plan(12);

select ok(
  not exists (
    select 1
      from information_schema.columns
     where table_schema = 'public'
       and table_name = 'startups'
       and column_name = 'representative_network_id'
  ),
  'STARTUP 대표자에 NETWORKS 참조 컬럼이 없다'
);

select ok(
  to_regclass('public.network_affiliations') is null,
  'STARTUP 사람을 투영하던 소속 관계 표가 없다'
);

select ok(
  not exists (
    select 1
      from pg_constraint c
     where c.conrelid = 'public.networks'::regclass
       and c.conname = 'networks_category_chk'
       and pg_get_constraintdef(c.oid) like '%startup%'
  ),
  'NETWORKS 구분은 startup을 받지 않는다'
);

insert into public.users (id, user_type, name, session_version)
values ('91000000-0000-0000-0000-000000000001', 'super_admin', 'startup guest rollback test admin', 1);

-- 같은 이름의 NETWORKS 사람이 있어도 STARTUP 발급은 이 행을 추정하거나 연결하지 않는다.
insert into public.networks (id, name, email, phone, category)
values (
  '92000000-0000-0000-0000-000000000001',
  '동명이인 대표자',
  'network-person@example.test',
  '01099999999',
  'experts'
);

insert into public.startups (id, name, representative, email, phone)
values (
  '93000000-0000-0000-0000-000000000001',
  '테스트 스타트업 A',
  'STARTUP 원장 대표자',
  'startup-ledger@example.test',
  '01012345678'
), (
  '93000000-0000-0000-0000-000000000002',
  '테스트 스타트업 B',
  '동일 이메일 담당자',
  'startup-ledger@example.test',
  '01087654321'
);

create temporary table startup_guest_rollback_result (
  source text primary key,
  user_id uuid not null
);
grant select, insert on startup_guest_rollback_result to authenticated;

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"app_user_id":"91000000-0000-0000-0000-000000000001","session_version":1}',
  true
);

insert into startup_guest_rollback_result (source, user_id)
select 'first', public.issue_guest_account(
  'startups',
  '93000000-0000-0000-0000-000000000001',
  null,
  null,
  null
);

select is(
  (select u.name
     from public.users u
     join startup_guest_rollback_result r on r.user_id = u.id
    where r.source = 'first'),
  'STARTUP 원장 대표자',
  'STARTUP GUEST 이름은 STARTUP 대표자 칸에서 읽는다'
);

select is(
  (select u.email
     from public.users u
     join startup_guest_rollback_result r on r.user_id = u.id
    where r.source = 'first'),
  'startup-ledger@example.test',
  'STARTUP GUEST 이메일은 STARTUP 원장에서 읽는다'
);

select is(
  (select u.phone
     from public.users u
     join startup_guest_rollback_result r on r.user_id = u.id
    where r.source = 'first'),
  '01012345678',
  'STARTUP GUEST 연락처는 STARTUP 원장에서 읽는다'
);

select is(
  (select u.company_id
     from public.users u
     join startup_guest_rollback_result r on r.user_id = u.id
    where r.source = 'first'),
  '93000000-0000-0000-0000-000000000001'::uuid,
  'STARTUP GUEST의 회사 기준도 STARTUP 행이다'
);

select is(
  (select count(*)::integer
     from public.guest_identities gi
     join startup_guest_rollback_result r on r.user_id = gi.user_id
    where r.source = 'first'
      and gi.master_table = 'startups'
      and gi.master_id = '93000000-0000-0000-0000-000000000001'),
  1,
  '발급 계정에는 STARTUP 인격을 붙인다'
);

select is(
  (select count(*)::integer
     from public.guest_identities gi
     join startup_guest_rollback_result r on r.user_id = gi.user_id
    where r.source = 'first'
      and gi.master_table = 'networks'
      and gi.master_id = '92000000-0000-0000-0000-000000000001'),
  0,
  '이름이 비슷한 NETWORKS 인격을 자동으로 붙이지 않는다'
);

insert into startup_guest_rollback_result (source, user_id)
select 'second', public.issue_guest_account(
  'startups',
  '93000000-0000-0000-0000-000000000002',
  null,
  null,
  null
);

select is(
  (select user_id from startup_guest_rollback_result where source = 'second'),
  (select user_id from startup_guest_rollback_result where source = 'first'),
  '다른 STARTUP에서 같은 이메일을 발급하면 기존 게스트 계정을 재사용한다'
);

select is(
  (select count(*)::integer
     from public.users
    where deleted_at is null
      and lower(email) = 'startup-ledger@example.test'),
  1,
  '같은 이메일의 활성 게스트 계정은 중복 생성되지 않는다'
);

select is(
  (select count(*)::integer
     from public.guest_identities gi
     join startup_guest_rollback_result r on r.user_id = gi.user_id
    where r.source = 'first'
      and gi.master_table = 'startups'
      and gi.master_id in (
        '93000000-0000-0000-0000-000000000001',
        '93000000-0000-0000-0000-000000000002'
      )),
  2,
  '재사용한 한 계정에 두 STARTUP 인격을 각각 남긴다'
);

select * from finish();
rollback;

