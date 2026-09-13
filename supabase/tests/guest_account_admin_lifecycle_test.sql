begin;
select plan(24);

insert into public.users (id, user_type, name, email, session_version) values
  ('98100000-0000-0000-0000-000000000001', 'read_only', '일반 사용자', null, 1),
  ('98100000-0000-0000-0000-000000000002', 'super_admin', '시스템 관리자', null, 1);

insert into public.workspace_permissions
  (user_id, workspace_key, permission_level, scope_type)
values
  ('98100000-0000-0000-0000-000000000001', 'startup', 'read', 'global');

insert into public.startups (id, name, representative, email, phone)
values (
  '98200000-0000-0000-0000-000000000001',
  '중앙 생성 원장 기업', '원장 대표', 'ledger-guest@example.test', '01020000001'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"app_user_id":"98100000-0000-0000-0000-000000000001","session_version":1}',
  true
);

select lives_ok(
  $$select public.create_guest_account(
      '수동 게스트', 'manual-guest@example.test', '01020000002', null, null
    )$$,
  '일반 내부 사용자는 원장 연결 없이 GUEST 계정을 생성할 수 있다'
);

select is(
  (select count(*)::int from public.users
    where email = 'manual-guest@example.test' and user_type = 'temporary_guest'),
  1,
  '수동 생성은 temporary_guest 계정 한 건을 만든다'
);

select is(
  (select count(*)::int
     from public.guest_accounts_list(null, 50, 0, null, null, false)
    where name = '수동 게스트'),
  1,
  '일반 사용자는 방금 생성한 미연결 임시 계정을 목록에서 조회한다'
);

select lives_ok(
  $$select public.create_guest_account(
      '수동 게스트', 'MANUAL-GUEST@example.test', '01020000002', null, null
    )$$,
  '같은 이메일과 같은 이름의 재시도는 기존 계정을 재사용한다'
);

select is(
  (select count(*)::int from public.users where lower(email) = 'manual-guest@example.test'),
  1,
  '멱등 재시도 뒤에도 계정은 한 건이다'
);

select throws_ok(
  $$select public.create_guest_account(
      '다른 사람', 'manual-guest@example.test', '01020000003', null, null
    )$$,
  '23505', null,
  '같은 이메일인데 이름이 다른 계정 생성은 거부한다'
);

select lives_ok(
  $$select public.create_guest_account(
      '원장 대표', 'ledger-guest@example.test', '01020000001',
      'startups', '98200000-0000-0000-0000-000000000001'
    )$$,
  '워크스페이스 생성도 같은 중앙 함수에서 원장 인격을 연결한다'
);

select is(
  (select count(*)::int
     from public.guest_identities gi
     join public.users u on u.id = gi.user_id
    where gi.master_table = 'startups'
      and gi.master_id = '98200000-0000-0000-0000-000000000001'
      and u.email = 'ledger-guest@example.test'),
  1,
  '원장 기반 생성 결과에 guest_identities가 정확히 한 건 생긴다'
);

select set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'app_user_id', (select id from public.users where email = 'manual-guest@example.test'),
    'session_version', 1
  )::text,
  true
);
select throws_ok(
  $$select public.create_guest_account(
      '게스트가 만든 계정', 'nested-guest@example.test', '01020000004', null, null
    )$$,
  '42501', null,
  'GUEST는 다른 GUEST 계정을 만들 수 없다'
);

select set_config(
  'request.jwt.claims',
  '{"app_user_id":"98100000-0000-0000-0000-000000000001","session_version":1}',
  true
);
select throws_ok(
  $$select public.hard_delete_guest_account(
      (select id from public.users where email = 'manual-guest@example.test'), '권한 검사'
    )$$,
  '42501', null,
  '일반 사용자는 GUEST 계정을 영구 삭제할 수 없다'
);

reset role;
insert into public.attachments
  (id, target_type, target_id, file_name, storage_path, uploaded_by)
values (
  '98300000-0000-0000-0000-000000000001', 'TEST',
  '98300000-0000-0000-0000-000000000002', '보존.txt', 'test/keep.txt',
  (select id from public.users where email = 'manual-guest@example.test')
);
insert into public.notifications
  (id, recipient_id, actor_id, target_type, target_id)
values
  (
    '98400000-0000-0000-0000-000000000001',
    '98100000-0000-0000-0000-000000000002',
    (select id from public.users where email = 'manual-guest@example.test'),
    'TEST', '98400000-0000-0000-0000-000000000011'
  ),
  (
    '98400000-0000-0000-0000-000000000002',
    (select id from public.users where email = 'manual-guest@example.test'),
    '98100000-0000-0000-0000-000000000002',
    'TEST', '98400000-0000-0000-0000-000000000012'
  );

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"app_user_id":"98100000-0000-0000-0000-000000000002","session_version":1}',
  true
);

select throws_ok(
  $$select public.hard_delete_guest_account(
      (select id from public.users where email = 'manual-guest@example.test'), '   '
    )$$,
  '22023', null,
  '관리자도 삭제 사유 없이는 영구 삭제할 수 없다'
);

select throws_ok(
  $$select public.hard_delete_guest_account(
      '98100000-0000-0000-0000-000000000001', '잘못 고른 대상'
    )$$,
  '22023', null,
  '내부 임직원 계정은 GUEST 삭제 경로가 거부한다'
);

select lives_ok(
  $$select public.create_guest_account(
      '일괄 계정 A', 'bulk-guest-a@example.test', '01020000005', null, null
    )
    union all
    select public.create_guest_account(
      '일괄 계정 B', 'bulk-guest-b@example.test', '01020000006', null, null
    )$$,
  '관리자는 일괄 작업용 GUEST 계정을 생성할 수 있다'
);

select is(
  (select public.set_guest_accounts_active(
    array(select id from public.users where email like 'bulk-guest-%@example.test'),
    false,
    '일괄 정지 테스트'
  )),
  2,
  '일괄 정지는 선택한 두 계정을 한 번에 처리한다'
);

select is(
  (select count(*)::int from public.users
    where email like 'bulk-guest-%@example.test' and not is_active),
  2,
  '일괄 정지 뒤 두 계정이 모두 정지 상태다'
);

select is(
  (select public.set_guest_accounts_active(
    array(select id from public.users where email like 'bulk-guest-%@example.test'),
    true,
    null
  )),
  2,
  '일괄 정지 해제도 선택 전체에 적용한다'
);

select is(
  (select public.hard_delete_guest_accounts(
    array(select id from public.users where email like 'bulk-guest-%@example.test'),
    '일괄 삭제 테스트'
  )),
  2,
  '일괄 영구 삭제는 선택한 두 계정을 한 트랜잭션에서 처리한다'
);

select is(
  (select count(*)::int from public.users where email like 'bulk-guest-%@example.test'),
  0,
  '일괄 영구 삭제 뒤 선택 계정이 남지 않는다'
);

select lives_ok(
  $$select public.hard_delete_guest_account(
      (select id from public.users where email = 'manual-guest@example.test'), '테스트 계정 정리'
    )$$,
  '관리자는 사유를 남기고 GUEST 계정을 영구 삭제할 수 있다'
);

select is(
  (select count(*)::int from public.users where email = 'manual-guest@example.test'),
  0,
  '영구 삭제 뒤 users 계정이 남지 않는다'
);

select ok(
  (select uploaded_by is null from public.attachments
    where id = '98300000-0000-0000-0000-000000000001')
  and (select actor_id is null from public.notifications
    where id = '98400000-0000-0000-0000-000000000001'),
  '업무 기록은 보존하고 삭제 계정을 가리키던 nullable 사용자 참조만 익명화한다'
);

select is(
  (select count(*)::int from public.notifications
    where id = '98400000-0000-0000-0000-000000000002'),
  0,
  '삭제 계정 개인에게 전달된 알림 사본은 함께 제거한다'
);

select is(
  (select count(*)::int from public.audit_logs
    where target_user_id is not null
      and action = 'GUEST_ACCOUNT_HARD_DELETE'
      and reason = '테스트 계정 정리'),
  1,
  '계정이 사라져도 영구 삭제 감사 로그는 남는다'
);

select ok(
  not has_function_privilege(
    'anon', 'public.hard_delete_guest_account(uuid,text)', 'EXECUTE'
  )
  and has_function_privilege(
    'authenticated', 'public.hard_delete_guest_account(uuid,text)', 'EXECUTE'
  )
  and not has_function_privilege(
    'anon', 'public.hard_delete_guest_accounts(uuid[],text)', 'EXECUTE'
  )
  and has_function_privilege(
    'authenticated', 'public.hard_delete_guest_accounts(uuid[],text)', 'EXECUTE'
  )
  and not has_function_privilege(
    'anon', 'public.set_guest_accounts_active(uuid[],boolean,text)', 'EXECUTE'
  )
  and has_function_privilege(
    'authenticated', 'public.set_guest_accounts_active(uuid[],boolean,text)', 'EXECUTE'
  ),
  '영구 삭제 RPC는 anon에 닫히고 authenticated에만 열려 있다'
);

select * from finish();
rollback;
