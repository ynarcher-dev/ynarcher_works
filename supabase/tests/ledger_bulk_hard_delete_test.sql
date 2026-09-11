begin;
select plan(21);

insert into public.users (id, user_type, name, session_version)
values
  ('95000000-0000-0000-0000-000000000001', 'super_admin', '원장 삭제 테스트 관리자', 1),
  ('95000000-0000-0000-0000-000000000002', 'management_support', '원장 삭제 테스트 사용자', 1);

insert into public.workspace_permissions
  (user_id, workspace_key, permission_level, scope_type, expires_at)
values
  ('95000000-0000-0000-0000-000000000002', 'startup', 'write', 'global', null),
  ('95000000-0000-0000-0000-000000000002', 'networks', 'write', 'global', null);

insert into public.startups (id, name, representative, email, phone)
values (
  '95100000-0000-0000-0000-000000000001',
  '일괄 비활성 일반 사용자 대상',
  '대표자',
  'bulk-writer@example.test',
  '010-1111-3333'
);

insert into public.networks (id, name, affiliation, email, phone, category, country_tag_id)
select x.id::uuid, x.name, '검증 기관', x.email, x.phone, 'experts', c.id
from (
  values
    ('95200000-0000-0000-0000-000000000001', '영구 삭제 가능 대상', 'hard-a@example.test', '010-2222-0001'),
    ('95200000-0000-0000-0000-000000000002', '영구 삭제 차단 대상', 'hard-b@example.test', '010-2222-0002'),
    ('95200000-0000-0000-0000-000000000004', '다중 복구 첫째', 'bulk-r1@example.test', '010-2222-0004'),
    ('95200000-0000-0000-0000-000000000005', '다중 복구 둘째', 'bulk-r2@example.test', '010-2222-0005')
) x(id, name, email, phone)
cross join lateral (
  select id from public.country_tags
  where deleted_at is null order by sort_order, name limit 1
) c;

insert into public.networks (
  id, name, affiliation, category, country_tag_id, merged_into_id, deleted_at
)
select
  '95200000-0000-0000-0000-000000000003',
  '병합된 원본',
  '검증 기관',
  'experts',
  country_tag_id,
  '95200000-0000-0000-0000-000000000002',
  now()
from public.networks
where id = '95200000-0000-0000-0000-000000000002';

select ok(
  not has_function_privilege('anon', 'public.deactivate_entities(text,uuid[],text)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.admin_entity_delete_blockers(text,uuid)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.admin_hard_delete_entity(text,uuid,text,text)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.restore_entities(text,uuid[],text)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.admin_entities_delete_blockers(text,uuid[])', 'EXECUTE')
  and not has_function_privilege('anon', 'public.admin_hard_delete_entities(text,uuid[],text,text)', 'EXECUTE'),
  '익명 사용자는 일괄 비활성화·영구 삭제 RPC를 실행할 수 없다'
);
select ok(
  has_function_privilege('authenticated', 'public.deactivate_entities(text,uuid[],text)', 'EXECUTE')
  and has_function_privilege('authenticated', 'public.restore_entities(text,uuid[],text)', 'EXECUTE')
  and has_function_privilege('authenticated', 'public.admin_hard_delete_entities(text,uuid[],text,text)', 'EXECUTE'),
  '인증 사용자는 일괄 비활성화 RPC에 진입하고 함수 내부 RLS 판정을 받는다'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"app_user_id":"95000000-0000-0000-0000-000000000001","session_version":1}',
  true
);

select lives_ok(
  $$select public.deactivate_entities(
    'networks',
    array[
      '95200000-0000-0000-0000-000000000001'::uuid,
      '95200000-0000-0000-0000-000000000002'::uuid
    ],
    '일괄 비활성화 검증'
  )$$,
  '선택한 NETWORKS 두 건을 한 요청으로 비활성화한다'
);
select is(
  (select count(*)::integer from public.networks
    where id in (
      '95200000-0000-0000-0000-000000000001',
      '95200000-0000-0000-0000-000000000002'
    ) and deleted_at is not null),
  2,
  '일괄 비활성화 대상 두 건이 모두 비활성 상태가 된다'
);
select is(
  (select count(*)::integer from public.entity_contributions
    where entity_table = 'networks'
      and entity_id in (
        '95200000-0000-0000-0000-000000000001',
        '95200000-0000-0000-0000-000000000002'
      )
      and action = 'deactivated'
      and note = '일괄 비활성화 검증'),
  2,
  '각 행의 비활성화 이력에 같은 사유가 남는다'
);
select is(
  (select count(*)::integer from public.admin_entity_delete_blockers(
    'networks', '95200000-0000-0000-0000-000000000002')),
  1,
  '병합 원본이 가리키는 비활성 원장은 영구 삭제 차단 사유를 돌려준다'
);
select throws_ok(
  $$select public.admin_hard_delete_entity(
    'networks',
    '95200000-0000-0000-0000-000000000002',
    '연결 데이터가 있어도 삭제 시도',
    '삭제합니다'
  )$$,
  '23001',
  'dependent_records_exist: 병합 원본 1건',
  '연결 데이터가 있는 비활성 원장은 영구 삭제되지 않는다'
);
select lives_ok(
  $$select public.admin_hard_delete_entity(
    'networks',
    '95200000-0000-0000-0000-000000000001',
    '관리자 확인 후 영구 삭제',
    '삭제합니다'
  )$$,
  '연결 데이터가 없는 비활성 원장은 관리자가 영구 삭제할 수 있다'
);
select is(
  (select count(*)::integer from public.networks
    where id = '95200000-0000-0000-0000-000000000001'),
  0,
  '영구 삭제된 NETWORKS 행은 원장에서 사라진다'
);
select is(
  (select count(*)::integer from public.entity_contributions
    where entity_table = 'networks'
      and entity_id = '95200000-0000-0000-0000-000000000001'),
  0,
  '영구 삭제된 행의 기여 이력도 함께 제거된다'
);
select is(
  (select count(*)::integer from public.audit_logs
    where action = 'LEDGER_HARD_DELETE'
      and before_data->>'entity_id' = '95200000-0000-0000-0000-000000000001'
      and reason = '관리자 확인 후 영구 삭제'),
  1,
  '영구 삭제 전 대상 스냅샷과 사유는 감사 로그에 남는다'
);

select lives_ok(
  $$select public.deactivate_entities(
    'networks',
    array[
      '95200000-0000-0000-0000-000000000004'::uuid,
      '95200000-0000-0000-0000-000000000005'::uuid
    ],
    '일괄삭제'
  )$$,
  '다중 복구 대상 두 건을 먼저 일괄 비활성화한다'
);
select lives_ok(
  $$select public.restore_entities(
    'networks',
    array[
      '95200000-0000-0000-0000-000000000004'::uuid,
      '95200000-0000-0000-0000-000000000005'::uuid
    ],
    '일괄복구'
  )$$,
  '선택한 비활성 원장 두 건을 한 요청으로 복구한다'
);
select is(
  (select count(*)::integer from public.entity_contributions
    where entity_table = 'networks'
      and entity_id in (
        '95200000-0000-0000-0000-000000000004',
        '95200000-0000-0000-0000-000000000005'
      )
      and action = 'reactivated'
      and note = '일괄복구'),
  2,
  '다중 복구 이력 사유는 일괄복구로 남는다'
);
select is(
  (select count(*)::integer from public.networks
    where id in (
      '95200000-0000-0000-0000-000000000004',
      '95200000-0000-0000-0000-000000000005'
    ) and deleted_at is null),
  2,
  '선택한 두 행이 모두 활성 원장으로 돌아온다'
);
select lives_ok(
  $$select public.deactivate_entities(
    'networks',
    array[
      '95200000-0000-0000-0000-000000000004'::uuid,
      '95200000-0000-0000-0000-000000000005'::uuid
    ],
    '일괄삭제'
  )$$,
  '다중 영구 삭제 대상을 다시 비활성화한다'
);
select lives_ok(
  $$select public.admin_hard_delete_entities(
    'networks',
    array[
      '95200000-0000-0000-0000-000000000004'::uuid,
      '95200000-0000-0000-0000-000000000005'::uuid
    ],
    '일괄삭제',
    '삭제합니다'
  )$$,
  '연결 데이터가 없는 선택 행 두 건을 한 요청으로 영구 삭제한다'
);
select is(
  (select count(*)::integer from public.networks
    where id in (
      '95200000-0000-0000-0000-000000000004',
      '95200000-0000-0000-0000-000000000005'
    )),
  0,
  '다중 영구 삭제된 행이 모두 원장에서 사라진다'
);
select is(
  (select count(*)::integer from public.audit_logs
    where action = 'LEDGER_HARD_DELETE'
      and before_data->>'entity_id' in (
        '95200000-0000-0000-0000-000000000004',
        '95200000-0000-0000-0000-000000000005'
      )
      and reason = '일괄삭제'),
  2,
  '다중 영구 삭제 감사 사유는 각 행에 일괄삭제로 남는다'
);

select set_config(
  'request.jwt.claims',
  '{"app_user_id":"95000000-0000-0000-0000-000000000002","session_version":1}',
  true
);
select lives_ok(
  $$select public.deactivate_entities(
    'startups',
    array['95100000-0000-0000-0000-000000000001'::uuid],
    '쓰기 사용자 일괄 비활성화'
  )$$,
  '원장 쓰기 권한자는 일괄 비활성화할 수 있다'
);
select throws_ok(
  $$select * from public.admin_entity_delete_blockers(
    'startups', '95100000-0000-0000-0000-000000000001')$$,
  '42501',
  'admin_required',
  '일반 사용자는 영구 삭제 차단 정보를 조회할 수 없다'
);
select throws_ok(
  $$select public.admin_hard_delete_entity(
    'startups',
    '95100000-0000-0000-0000-000000000001',
    '권한 없는 영구 삭제',
    '삭제합니다'
  )$$,
  '42501',
  'admin_required',
  '일반 사용자는 비활성 원장을 영구 삭제할 수 없다'
);

reset role;
select * from finish();
rollback;
