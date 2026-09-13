begin;
select plan(15);

insert into public.startups (id, name, email, phone)
values ('94000000-0000-0000-0000-000000000001', '식별 정책 A', 'ledger-a@example.test', '01011112222');

select throws_ok(
  $$insert into public.startups (name, email, phone)
    values ('식별 정책 B', 'LEDGER-A@example.test', '01033334444')$$,
  '23505', null,
  'STARTUP은 이메일 하나만 같아도 신규 저장을 막는다'
);

select throws_ok(
  $$insert into public.startups (name, email, phone)
    values ('식별 정책 C', 'ledger-c@example.test', '010-1111-2222')$$,
  '23505', null,
  'STARTUP은 전화 표기가 달라도 같은 번호면 저장을 막는다'
);

insert into public.ma_sellers (id, name, contact_email, phone)
values ('95000000-0000-0000-0000-000000000001', 'SELLER A', 'seller-a@example.test', '01055556666');

select throws_ok(
  $$insert into public.ma_sellers (name, contact_email, phone)
    values ('SELLER B', 'seller-a@example.test', '01077778888')$$,
  '23505', null,
  'SELLER는 이메일 하나만 같아도 신규 저장을 막는다'
);

select throws_ok(
  $$insert into public.ma_sellers (name, contact_email, phone)
    values ('SELLER C', 'seller-c@example.test', '010-5555-6666')$$,
  '23505', null,
  'SELLER는 전화 표기가 달라도 같은 번호면 저장을 막는다'
);

insert into public.ma_buyers (id, name, contact_email, phone)
values ('95100000-0000-0000-0000-000000000001', 'BUYER A', 'buyer-a@example.test', '01066667777');

select throws_ok(
  $$insert into public.ma_buyers (name, contact_email, phone)
    values ('BUYER B', 'BUYER-A@example.test', '01022223333')$$,
  '23505', null,
  'BUYER는 이메일 하나만 같아도 신규 저장을 막는다'
);

select throws_ok(
  $$insert into public.ma_buyers (name, contact_email, phone)
    values ('BUYER C', 'buyer-c@example.test', '010-6666-7777')$$,
  '23505', null,
  'BUYER는 전화 표기가 달라도 같은 번호면 저장을 막는다'
);

-- NETWORKS는 연락처 하나를 사람의 영구 식별키로 쓰지 않는다. 후임자가 같은 회사 메일을
-- 이어받을 수 있으므로 이름이 다른 두 행은 함께 설 수 있다.
insert into public.networks (id, name, email, phone, country_tag_id)
select '96000000-0000-0000-0000-000000000001', '퇴사자 A', 'team@example.test', '01012121212', c.id
  from public.country_tags c where c.deleted_at is null order by c.sort_order, c.name limit 1;
insert into public.networks (id, name, email, phone, country_tag_id)
select '96000000-0000-0000-0000-000000000002', '후임자 B', 'team@example.test', '01034343434', c.id
  from public.country_tags c where c.deleted_at is null order by c.sort_order, c.name limit 1;

select is(
  (select count(*)::int from public.networks where email = 'team@example.test' and deleted_at is null),
  2,
  'NETWORKS는 이름이 다른 사람의 공용 이메일 단독 중복을 허용한다'
);

update public.networks
   set email = 'new-job@example.test', phone = '01099990000'
 where id = '96000000-0000-0000-0000-000000000001';

select is(
  (select profile -> 'contact_history' -> 0 ->> 'email'
     from public.networks where id = '96000000-0000-0000-0000-000000000001'),
  'team@example.test',
  'NETWORKS 연락처 변경 전 이메일을 이력에 보존한다'
);

select is(
  (select profile -> 'contact_history' -> 0 ->> 'phone'
     from public.networks where id = '96000000-0000-0000-0000-000000000001'),
  '01012121212',
  'NETWORKS 연락처 변경 전 전화번호를 이력에 보존한다'
);

select ok(
  to_regclass('public.uq_networks_email_live') is null
  and to_regclass('public.uq_networks_phone_live') is null,
  'NETWORKS에는 이메일·전화 단일 유일 인덱스를 두지 않는다'
);

-- 통합 GUEST 목록은 M&A 인격의 존재까지 권한 밖에서 숨긴다.
insert into public.users (id, user_type, name, email, phone, session_version) values
  ('97000000-0000-0000-0000-000000000001', 'read_only', 'M&A 무권한 직원', null, null, 1),
  ('97000000-0000-0000-0000-000000000002', 'read_only', 'M&A 조회 직원', null, null, 1),
  ('97000000-0000-0000-0000-000000000003', 'external_startup', 'M&A 전용 게스트',
   'mna-only@example.test', '01088889999', 1),
  ('97000000-0000-0000-0000-000000000004', 'external_startup', '일반·M&A 혼합 게스트',
   'mixed@example.test', '01077770000', 1);

select throws_ok(
  $$insert into public.users (user_type, name, email, phone)
    values ('temporary_guest', '다른 게스트', 'another-guest@example.test', '010-8888-9999')$$,
  '23505', null,
  '서로 다른 GUEST 계정은 같은 정규화 전화번호를 사용할 수 없다'
);
insert into public.workspace_permissions
  (user_id, workspace_key, permission_level, scope_type, expires_at)
values
  ('97000000-0000-0000-0000-000000000001', 'startup', 'read', 'global', null),
  ('97000000-0000-0000-0000-000000000002', 'startup', 'read', 'global', null),
  ('97000000-0000-0000-0000-000000000002', 'mna', 'read', 'global', null);

-- M&A 워크스페이스 권한만으로 당사자 본문이 열리지는 않는다. 명시 열람자로 지정된 계정만
-- 아래 M&A 인격과 그 인격만 가진 GUEST 계정을 볼 수 있다.
update public.ma_sellers
   set viewer_ids = array['97000000-0000-0000-0000-000000000002'::uuid]
 where id = '95000000-0000-0000-0000-000000000001';

insert into public.guest_identities (master_table, master_id, user_id)
values
  ('ma_sellers', '95000000-0000-0000-0000-000000000001',
   '97000000-0000-0000-0000-000000000003'),
  ('startups', '94000000-0000-0000-0000-000000000001',
   '97000000-0000-0000-0000-000000000004'),
  ('ma_sellers', '95000000-0000-0000-0000-000000000001',
   '97000000-0000-0000-0000-000000000004');

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"app_user_id":"97000000-0000-0000-0000-000000000001","session_version":1}',
  true
);
select is(
  (select count(*)::int
     from public.guest_accounts_list(null, 50, 0, null, null, false)
    where user_id = '97000000-0000-0000-0000-000000000003'),
  0,
  'M&A 권한이 없으면 M&A 전용 GUEST 계정 자체가 목록에 서지 않는다'
);

select is(
  (select count(*)::int from public.guest_accounts_list(null, 50, 0, null, null, false)),
  1,
  'M&A 권한이 없어도 일반 원장을 함께 가진 혼합 GUEST 계정은 목록에 선다'
);

select is(
  (select identities -> 0 ->> 'master_table'
     from public.guest_accounts_list(null, 50, 0, null, null, false)
    where user_id = '97000000-0000-0000-0000-000000000004'),
  'startups',
  '혼합 계정에서도 권한 없는 M&A 인격은 응답에서 빠진다'
);

select set_config(
  'request.jwt.claims',
  '{"app_user_id":"97000000-0000-0000-0000-000000000002","session_version":1}',
  true
);
select is(
  (select count(*)::int from public.guest_accounts_list(null, 50, 0, null, null, false)),
  2,
  'M&A 당사자 명시 열람자는 M&A 전용 계정과 혼합 계정을 모두 볼 수 있다'
);

select * from finish();
rollback;
