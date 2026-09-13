-- =====================================================================
-- GUEST 계정 관리 탭
--   · 스타트업/전문가/BUYER/SELLER는 인격 연결로 분류한다.
--   · FUND는 실제 조합 참여로 분류한다.
--   · 미연결은 앞의 다섯 분류 어디에도 속하지 않는 계정을 빠짐없이 받는다.
--   · 복수 분류 계정은 각 탭에 중복 노출된다.
-- =====================================================================

begin;
select plan(12);

insert into public.users (id, user_type, name, email, session_version) values
  ('98100000-0000-0000-0000-000000000001', 'super_admin',     '탭 테스트 관리자', 'facet-admin@example.test', 1),
  ('98200000-0000-0000-0000-000000000001', 'temporary_guest', '스타트업 계정',      'facet-startup@example.test', 1),
  ('98200000-0000-0000-0000-000000000002', 'temporary_guest', '전문가 계정',        'facet-network@example.test', 1),
  ('98200000-0000-0000-0000-000000000003', 'temporary_guest', 'BUYER 계정',         'facet-buyer@example.test', 1),
  ('98200000-0000-0000-0000-000000000004', 'temporary_guest', 'SELLER 계정',        'facet-seller@example.test', 1),
  ('98200000-0000-0000-0000-000000000005', 'temporary_guest', 'FUND 계정',          'facet-fund@example.test', 1),
  ('98200000-0000-0000-0000-000000000006', 'temporary_guest', '복수 분류 계정',     'facet-multi@example.test', 1),
  ('98200000-0000-0000-0000-000000000007', 'temporary_guest', '완전 미연결 계정',   'facet-unlinked@example.test', 1),
  ('98200000-0000-0000-0000-000000000008', 'temporary_guest', '사업만 연결 계정',   'facet-program-only@example.test', 1);

insert into public.startups (id, name) values
  ('98300000-0000-0000-0000-000000000001', '탭 스타트업'),
  ('98300000-0000-0000-0000-000000000002', '탭 복수 스타트업');

insert into public.networks (id, name, country_tag_id)
select n.id::uuid, n.name, c.id
  from (values
    ('98400000-0000-0000-0000-000000000001', '탭 전문가'),
    ('98400000-0000-0000-0000-000000000002', '탭 복수 전문가')
  ) n(id, name)
  cross join lateral (
    select id from public.country_tags
     where deleted_at is null
     order by sort_order, name
     limit 1
  ) c;

insert into public.ma_buyers (id, name, created_by) values
  ('98500000-0000-0000-0000-000000000001', '탭 BUYER', '98100000-0000-0000-0000-000000000001');
insert into public.ma_sellers (id, name, created_by) values
  ('98600000-0000-0000-0000-000000000001', '탭 SELLER', '98100000-0000-0000-0000-000000000001');

insert into public.funds (id, name, created_by) values
  ('98700000-0000-0000-0000-000000000001', '탭 FUND', '98100000-0000-0000-0000-000000000001');
insert into public.programs (id, title, created_by) values
  ('98800000-0000-0000-0000-000000000001', '탭 일반 사업', '98100000-0000-0000-0000-000000000001');

insert into public.guest_identities (master_table, master_id, user_id, created_by) values
  ('startups',   '98300000-0000-0000-0000-000000000001', '98200000-0000-0000-0000-000000000001', '98100000-0000-0000-0000-000000000001'),
  ('networks',   '98400000-0000-0000-0000-000000000001', '98200000-0000-0000-0000-000000000002', '98100000-0000-0000-0000-000000000001'),
  ('ma_buyers',  '98500000-0000-0000-0000-000000000001', '98200000-0000-0000-0000-000000000003', '98100000-0000-0000-0000-000000000001'),
  ('ma_sellers', '98600000-0000-0000-0000-000000000001', '98200000-0000-0000-0000-000000000004', '98100000-0000-0000-0000-000000000001'),
  ('startups',   '98300000-0000-0000-0000-000000000002', '98200000-0000-0000-0000-000000000006', '98100000-0000-0000-0000-000000000001'),
  ('networks',   '98400000-0000-0000-0000-000000000002', '98200000-0000-0000-0000-000000000006', '98100000-0000-0000-0000-000000000001');

insert into public.program_participants
  (id, entity_key, program_id, user_id, master_table, master_id, created_by)
values
  ('98900000-0000-0000-0000-000000000001', 'fund',
   '98700000-0000-0000-0000-000000000001', '98200000-0000-0000-0000-000000000005',
   null, null, '98100000-0000-0000-0000-000000000001'),
  ('98900000-0000-0000-0000-000000000002', 'fund',
   '98700000-0000-0000-0000-000000000001', '98200000-0000-0000-0000-000000000006',
   null, null, '98100000-0000-0000-0000-000000000001'),
  ('98900000-0000-0000-0000-000000000003', 'program',
   '98800000-0000-0000-0000-000000000001', '98200000-0000-0000-0000-000000000008',
   null, null, '98100000-0000-0000-0000-000000000001');

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"app_user_id":"98100000-0000-0000-0000-000000000001","session_version":1}',
  true
);

select ok(
  to_regprocedure('public.guest_accounts_list(text,integer,integer,text,text[],boolean,text)') is not null,
  '탭 인자가 있는 guest_accounts_list 한 벌이 존재한다'
);
select ok(
  to_regprocedure('public.guest_accounts_list(text,integer,integer,text,text[],boolean)') is null,
  '기본 인자와 충돌할 옛 6인자 오버로드는 남지 않는다'
);

select is(
  (select string_agg(name, ',' order by name)
     from public.guest_accounts_list(null, 50, 0, null, null, false, 'startups')),
  '복수 분류 계정,스타트업 계정',
  '스타트업 탭은 스타트업 인격 계정만 세운다'
);
select is(
  (select string_agg(name, ',' order by name)
     from public.guest_accounts_list(null, 50, 0, null, null, false, 'networks')),
  '복수 분류 계정,전문가 계정',
  '전문가 탭은 NETWORKS 인격 계정만 세운다'
);
select is(
  (select string_agg(name, ',' order by name)
     from public.guest_accounts_list(null, 50, 0, null, null, false, 'ma_buyers')),
  'BUYER 계정',
  'BUYER 탭은 BUYER 인격 계정만 세운다'
);
select is(
  (select string_agg(name, ',' order by name)
     from public.guest_accounts_list(null, 50, 0, null, null, false, 'ma_sellers')),
  'SELLER 계정',
  'SELLER 탭은 SELLER 인격 계정만 세운다'
);
select is(
  (select string_agg(name, ',' order by name)
     from public.guest_accounts_list(null, 50, 0, null, null, false, 'fund')),
  'FUND 계정,복수 분류 계정',
  'FUND 탭은 실제 FUND 참여 계정만 세운다'
);
select is(
  (select string_agg(name, ',' order by name)
     from public.guest_accounts_list(null, 50, 0, null, null, false, 'unlinked')),
  '사업만 연결 계정,완전 미연결 계정',
  '미연결 탭은 다른 다섯 분류가 없는 계정을 빠짐없이 받는다'
);

select is(
  (select count(*)::int
     from (
       select user_id from public.guest_accounts_list(null, 50, 0, null, null, false, 'startups')
       union all
       select user_id from public.guest_accounts_list(null, 50, 0, null, null, false, 'networks')
       union all
       select user_id from public.guest_accounts_list(null, 50, 0, null, null, false, 'fund')
     ) t
    where user_id = '98200000-0000-0000-0000-000000000006'),
  3,
  '복수 분류 계정은 해당하는 세 탭에 각각 나타난다'
);

select is(
  (select count(distinct user_id)::int
     from (
       select user_id from public.guest_accounts_list(null, 50, 0, null, null, false, 'startups')
       union all select user_id from public.guest_accounts_list(null, 50, 0, null, null, false, 'networks')
       union all select user_id from public.guest_accounts_list(null, 50, 0, null, null, false, 'ma_buyers')
       union all select user_id from public.guest_accounts_list(null, 50, 0, null, null, false, 'ma_sellers')
       union all select user_id from public.guest_accounts_list(null, 50, 0, null, null, false, 'fund')
       union all select user_id from public.guest_accounts_list(null, 50, 0, null, null, false, 'unlinked')
     ) t),
  8,
  '전체 탭을 없애도 모든 GUEST 계정은 적어도 한 탭에서 찾을 수 있다'
);

select is(
  (select total_count::int
     from public.guest_accounts_list(null, 1, 0, null, null, false, 'startups')),
  2,
  '탭 필터는 LIMIT 전에 적용되어 페이지 전체 건수도 정확하다'
);

select throws_ok(
  $$select * from public.guest_accounts_list(null, 50, 0, null, null, false, 'unknown')$$,
  '22023', null,
  '허용하지 않은 탭 키는 서버가 거절한다'
);

select * from finish();
rollback;
