begin;
select plan(14);

insert into public.users (id, user_type, name, session_version)
values
  ('94000000-0000-0000-0000-000000000001', 'super_admin', '비활성 원장 테스트 관리자', 1),
  ('94000000-0000-0000-0000-000000000002', 'management_support', '비활성 원장 일반 사용자', 1);

insert into public.workspace_permissions
  (user_id, workspace_key, permission_level, scope_type, expires_at)
values
  ('94000000-0000-0000-0000-000000000002', 'startup', 'write', 'global', null),
  ('94000000-0000-0000-0000-000000000002', 'networks', 'write', 'global', null);

insert into public.startups (id, name, representative, email, phone)
values (
  '94100000-0000-0000-0000-000000000001',
  '복구 대상 스타트업',
  '김대표',
  'restore-startup@example.test',
  '010-1111-2222'
);

insert into public.networks (id, name, affiliation, email, phone, category, country_tag_id)
select
  '94200000-0000-0000-0000-000000000001',
  '복구 대상 네트워크',
  '테스트 기관',
  'restore-network@example.test',
  '010-3333-4444',
  'experts',
  c.id
from public.country_tags c
where c.deleted_at is null
order by c.sort_order, c.name
limit 1;

-- 활성 중복 차단 픽스처(이름·이메일 두 칸 일치).
insert into public.startups (id, name, email, phone)
values
  ('94100000-0000-0000-0000-000000000002', '중복 스타트업', 'duplicate@example.test', '010-5555-0001'),
  ('94100000-0000-0000-0000-000000000003', '중복 스타트업', 'duplicate@example.test', '010-5555-0002');
update public.startups
   set deleted_at = now()
 where id = '94100000-0000-0000-0000-000000000003';

-- 활성 NETWORKS 국가 필수 제약을 복구 시에도 지키는지 확인할 삭제 이력.
insert into public.networks (id, name, category, deleted_at)
values (
  '94200000-0000-0000-0000-000000000002',
  '국가 누락 네트워크',
  'experts',
  now()
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"app_user_id":"94000000-0000-0000-0000-000000000001","session_version":1}',
  true
);
select public.deactivate_entity(
  'startups',
  '94100000-0000-0000-0000-000000000001',
  '복구 기능 테스트'
);
select public.deactivate_entity(
  'networks',
  '94200000-0000-0000-0000-000000000001',
  '네트워크 복구 테스트'
);
reset role;

select ok(
  not has_function_privilege('anon', 'public.admin_inactive_ledger_entities(text,text,integer,integer)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.restore_entity(text,uuid,text)', 'EXECUTE'),
  '익명 사용자는 비활성 원장 RPC를 실행할 수 없다'
);
select ok(
  has_function_privilege('authenticated', 'public.admin_inactive_ledger_entities(text,text,integer,integer)', 'EXECUTE'),
  '인증 사용자는 RPC에 진입하고 함수 내부 ADMIN 판정을 받는다'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"app_user_id":"94000000-0000-0000-0000-000000000002","session_version":1}',
  true
);
select throws_ok(
  $$select * from public.admin_inactive_ledger_entities('startups', null, 20, 0)$$,
  '42501',
  'admin_required',
  '원장 쓰기 권한이 있어도 ADMIN이 아니면 비활성 목록을 열 수 없다'
);
select throws_ok(
  $$select public.restore_entity('startups', '94100000-0000-0000-0000-000000000001', '권한 우회')$$,
  '42501',
  'admin_required',
  '원장 쓰기 권한이 있어도 ADMIN이 아니면 복구할 수 없다'
);
reset role;

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"app_user_id":"94000000-0000-0000-0000-000000000001","session_version":1}',
  true
);

select is(
  (select count(*)::integer
     from public.admin_inactive_ledger_entities('startups', '복구 대상', 20, 0)),
  1,
  'ADMIN은 검색어에 맞는 비활성 스타트업을 조회한다'
);
select is(
  (select count(*)::integer
     from public.admin_inactive_ledger_entities('networks', '테스트 기관', 20, 0)),
  1,
  'ADMIN은 소속으로 비활성 네트워크를 검색한다'
);
select is(
  (select deactivation_reason
     from public.admin_inactive_ledger_entities('startups', '복구 대상', 20, 0)),
  '복구 기능 테스트',
  '비활성 목록은 가장 최근 비활성 사유를 함께 돌려준다'
);

select lives_ok(
  $$select public.restore_entity('startups', '94100000-0000-0000-0000-000000000001', '관리자 확인 후 복구')$$,
  'ADMIN은 비활성 스타트업을 복구할 수 있다'
);
select is(
  (select deleted_at from public.startups where id = '94100000-0000-0000-0000-000000000001'),
  null::timestamptz,
  '복구된 스타트업의 deleted_at이 비워진다'
);
select is(
  (select action
     from public.entity_contributions
    where entity_table = 'startups'
      and entity_id = '94100000-0000-0000-0000-000000000001'
    order by created_at desc, id desc
    limit 1),
  'reactivated',
  '복구 행위는 reactivated 이력으로 기록된다'
);
select is(
  (select note
     from public.entity_contributions
    where entity_table = 'startups'
      and entity_id = '94100000-0000-0000-0000-000000000001'
    order by created_at desc, id desc
    limit 1),
  '관리자 확인 후 복구',
  '복구 사유가 원장 변경과 같은 트랜잭션에서 기록된다'
);

select throws_ok(
  $$select public.restore_entity('startups', '94100000-0000-0000-0000-000000000003', '중복인데 복구')$$,
  '23505',
  'active_duplicate_exists',
  '활성 데이터와 두 칸 이상 일치하면 복구를 차단한다'
);
select throws_ok(
  $$select public.restore_entity('networks', '94200000-0000-0000-0000-000000000002', '국가 없이 복구')$$,
  '23514',
  'restore_required_fields_missing',
  '필수 국가가 없는 NETWORKS 삭제 이력은 복구하지 않는다'
);

select is(
  (select count(*)::integer
     from public.admin_inactive_ledger_entities('startups', '복구 대상', 20, 0)),
  0,
  '복구된 행은 비활성 목록에서 즉시 빠진다'
);

reset role;
select * from finish();
rollback;
