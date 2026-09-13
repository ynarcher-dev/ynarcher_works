begin;
select plan(12);

insert into public.users (id, user_type, name, session_version)
values
  ('96000000-0000-0000-0000-000000000001', 'management_support', '워크스페이스 생성자', 1),
  ('96000000-0000-0000-0000-000000000002', 'management_support', '다른 사용자', 1);

insert into public.workspace_permissions
  (user_id, workspace_key, permission_level, scope_type, expires_at)
values
  ('96000000-0000-0000-0000-000000000001', 'project', 'write', 'global', null),
  ('96000000-0000-0000-0000-000000000001', 'mna', 'write', 'global', null),
  ('96000000-0000-0000-0000-000000000001', 'fund', 'write', 'global', null),
  ('96000000-0000-0000-0000-000000000002', 'project', 'write', 'global', null),
  ('96000000-0000-0000-0000-000000000002', 'mna', 'write', 'global', null),
  ('96000000-0000-0000-0000-000000000002', 'fund', 'write', 'global', null);

insert into public.programs (id, title, created_by)
values ('96100000-0000-0000-0000-000000000001', '생성자 제한 사업', '96000000-0000-0000-0000-000000000001');
insert into public.ma_programs (id, title, created_by)
values ('96200000-0000-0000-0000-000000000001', '생성자 제한 딜', '96000000-0000-0000-0000-000000000001');
insert into public.ma_buyers (id, name, created_by)
values ('96300000-0000-0000-0000-000000000001', '생성자 제한 바이어', '96000000-0000-0000-0000-000000000001');
insert into public.ma_sellers (id, name, created_by)
values ('96400000-0000-0000-0000-000000000001', '생성자 제한 셀러', '96000000-0000-0000-0000-000000000001');
insert into public.funds (id, name, created_by)
values ('96500000-0000-0000-0000-000000000001', '생성자 제한 펀드', '96000000-0000-0000-0000-000000000001');

select ok(
  not has_function_privilege('anon', 'public.deactivate_entities(text,uuid[],text)', 'EXECUTE')
  and has_function_privilege('authenticated', 'public.deactivate_entities(text,uuid[],text)', 'EXECUTE'),
  '일괄 비활성화 RPC는 인증 사용자에게만 열린다'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"app_user_id":"96000000-0000-0000-0000-000000000002","session_version":1}',
  true
);

select throws_ok(
  $$update public.programs set deleted_at = now() where id = '96100000-0000-0000-0000-000000000001'$$,
  '42501', 'creator_required', '다른 사용자는 사업을 직접 비활성화할 수 없다'
);
with updated as (
  update public.ma_programs set deleted_at = now()
   where id = '96200000-0000-0000-0000-000000000001'
   returning 1
)
select is(
  (select count(*)::integer from updated), 0,
  '다른 사용자는 접근 정책에 따라 M&A 딜을 직접 비활성화할 수 없다'
);
with updated as (
  update public.ma_buyers set deleted_at = now()
   where id = '96300000-0000-0000-0000-000000000001'
   returning 1
)
select is(
  (select count(*)::integer from updated), 0,
  '다른 사용자는 접근 정책에 따라 바이어를 직접 비활성화할 수 없다'
);
with updated as (
  update public.ma_sellers set deleted_at = now()
   where id = '96400000-0000-0000-0000-000000000001'
   returning 1
)
select is(
  (select count(*)::integer from updated), 0,
  '다른 사용자는 접근 정책에 따라 셀러를 직접 비활성화할 수 없다'
);
select throws_ok(
  $$update public.funds set deleted_at = now() where id = '96500000-0000-0000-0000-000000000001'$$,
  '42501', 'creator_required', '다른 사용자는 펀드를 직접 비활성화할 수 없다'
);

select set_config(
  'request.jwt.claims',
  '{"app_user_id":"96000000-0000-0000-0000-000000000001","session_version":1}',
  true
);

select is(
  public.deactivate_entities('programs', array['96100000-0000-0000-0000-000000000001'::uuid], '목록 선택'),
  1,
  '생성자는 사업을 목록에서 비활성화할 수 있다'
);
select is(
  public.deactivate_entities('ma_programs', array['96200000-0000-0000-0000-000000000001'::uuid], '목록 선택'),
  1,
  '생성자는 M&A 딜을 목록에서 비활성화할 수 있다'
);
select is(
  public.deactivate_entities('ma_buyers', array['96300000-0000-0000-0000-000000000001'::uuid], '목록 선택'),
  1,
  '생성자는 바이어를 목록에서 비활성화할 수 있다'
);
select is(
  public.deactivate_entities('ma_sellers', array['96400000-0000-0000-0000-000000000001'::uuid], '목록 선택'),
  1,
  '생성자는 셀러를 목록에서 비활성화할 수 있다'
);
select is(
  public.deactivate_entities('funds', array['96500000-0000-0000-0000-000000000001'::uuid], '목록 선택'),
  1,
  '생성자는 펀드를 목록에서 비활성화할 수 있다'
);

reset role;
select is(
  (
    select count(*)::integer
    from (
      select deleted_at from public.programs where id = '96100000-0000-0000-0000-000000000001'
      union all
      select deleted_at from public.ma_programs where id = '96200000-0000-0000-0000-000000000001'
      union all
      select deleted_at from public.ma_buyers where id = '96300000-0000-0000-0000-000000000001'
      union all
      select deleted_at from public.ma_sellers where id = '96400000-0000-0000-0000-000000000001'
      union all
      select deleted_at from public.funds where id = '96500000-0000-0000-0000-000000000001'
    ) deactivated
    where deleted_at is not null
  ),
  5,
  '선택한 워크스페이스 원장 다섯 건이 모두 비활성 상태가 된다'
);

select * from finish();
rollback;
