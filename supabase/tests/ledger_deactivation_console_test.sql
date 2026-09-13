-- 비활성 원장 콘솔 — 7종 비활성화·조회·복구·영구 삭제
--
-- 20260912170000_ledger_deactivation_console.sql이 정한 계약을 검사한다.
--   · deactivate_entities가 funds에서도 entity_contributions.note에 사유를 남기는가(회귀).
--   · admin_inactive_ledger_entities와 restore_entity가 7종 모두를 받는가.
--   · 최고관리자는 생성자가 아닌 업무 원장도 비활성화할 수 있는가.
--   · 7종 모두 capability가 영구 삭제를 열고, 연결 데이터가 없으면 삭제되는가.
-- 트랜잭션을 롤백하므로 다른 테스트의 픽스처와 섞이지 않는다.

begin;
select plan(50);

-- ── 픽스처 ────────────────────────────────────────────────────────────
insert into public.users (id, user_type, name, session_version)
values
  ('96000000-0000-0000-0000-000000000001', 'super_admin', '콘솔 테스트 관리자', 1),
  ('96000000-0000-0000-0000-000000000002', 'management_support', '콘솔 테스트 사용자', 1);

insert into public.startups (id, name, representative, email, phone)
values (
  '96100000-0000-0000-0000-000000000001',
  '콘솔 스타트업',
  '대표자',
  'console-startup@example.test',
  '010-9600-0001'
);

insert into public.networks (id, name, affiliation, email, phone, category, country_tag_id)
select
  '96200000-0000-0000-0000-000000000001',
  '콘솔 네트워크',
  '검증 기관',
  'console-network@example.test',
  '010-9600-0002',
  'experts',
  c.id
from (
  select id from public.country_tags
   where deleted_at is null order by sort_order, name limit 1
) c;

insert into public.programs (id, title, category, host_organization, created_by)
values (
  '96300000-0000-0000-0000-000000000001',
  '콘솔 사업',
  'PUBLIC',
  '주관 기관',
  '96000000-0000-0000-0000-000000000002'
);

insert into public.ma_programs (id, title, category, host_organization, created_by)
values (
  '96400000-0000-0000-0000-000000000001',
  '콘솔 딜',
  'SELL',
  '주관 기관',
  '96000000-0000-0000-0000-000000000002'
);

insert into public.ma_buyers (id, name, contact_name, created_by)
values (
  '96500000-0000-0000-0000-000000000001',
  '콘솔 매수자',
  '담당자',
  '96000000-0000-0000-0000-000000000002'
);

insert into public.ma_sellers (id, name, contact_name, created_by)
values (
  '96600000-0000-0000-0000-000000000001',
  '콘솔 매도자',
  '담당자',
  '96000000-0000-0000-0000-000000000002'
);

-- code는 trg_funds_assign_code가 채운다. 손으로 넣지 않는다.
insert into public.funds (id, name, created_by)
values
  ('96700000-0000-0000-0000-000000000001', '콘솔 조합 첫째',
   '96000000-0000-0000-0000-000000000002'),
  ('96700000-0000-0000-0000-000000000002', '콘솔 조합 둘째',
   '96000000-0000-0000-0000-000000000002');

-- ── 함수 권한 ─────────────────────────────────────────────────────────
select ok(
  not has_function_privilege('anon', 'public.admin_ledger_console_capabilities(text)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.admin_inactive_ledger_entities(text,text,integer,integer)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.restore_entity(text,uuid,text)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.deactivate_entity(text,uuid,text)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.deactivate_entities(text,uuid[],text)', 'EXECUTE')
  and not has_function_privilege('anon', 'app.admin_inactive_ma_party_page(text,text,integer,integer)', 'EXECUTE')
  and not has_function_privilege('anon', 'app.admin_restore_ma_party(text,uuid,text)', 'EXECUTE'),
  '익명 사용자는 비활성 원장 콘솔 함수와 그 내부 헬퍼를 실행할 수 없다'
);
select ok(
  has_function_privilege('authenticated', 'public.admin_ledger_console_capabilities(text)', 'EXECUTE')
  and has_function_privilege('authenticated', 'public.admin_inactive_ledger_entities(text,text,integer,integer)', 'EXECUTE')
  and has_function_privilege('authenticated', 'public.restore_entity(text,uuid,text)', 'EXECUTE')
  and has_function_privilege('authenticated', 'public.deactivate_entity(text,uuid,text)', 'EXECUTE')
  and has_function_privilege('authenticated', 'public.deactivate_entities(text,uuid[],text)', 'EXECUTE')
  and has_function_privilege('authenticated', 'app.admin_inactive_ma_party_page(text,text,integer,integer)', 'EXECUTE')
  and has_function_privilege('authenticated', 'app.admin_restore_ma_party(text,uuid,text)', 'EXECUTE'),
  '인증 사용자는 콘솔 함수에 진입하고 함수 안의 super_admin 검사를 받는다'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"app_user_id":"96000000-0000-0000-0000-000000000001","session_version":1}',
  true
);

-- ── 7종 일괄 비활성화 ─────────────────────────────────────────────────
select lives_ok(
  $$select public.deactivate_entities(
    'startups', array['96100000-0000-0000-0000-000000000001'::uuid], '콘솔 비활성 사유')$$,
  'STARTUP 원장을 일괄 비활성화한다'
);
select lives_ok(
  $$select public.deactivate_entities(
    'networks', array['96200000-0000-0000-0000-000000000001'::uuid], '콘솔 비활성 사유')$$,
  'NETWORKS 원장을 일괄 비활성화한다'
);
select lives_ok(
  $$select public.deactivate_entities(
    'programs', array['96300000-0000-0000-0000-000000000001'::uuid], '콘솔 비활성 사유')$$,
  'PROJECT 사업을 일괄 비활성화한다'
);
select lives_ok(
  $$select public.deactivate_entities(
    'ma_programs', array['96400000-0000-0000-0000-000000000001'::uuid], '콘솔 비활성 사유')$$,
  'M&A 딜을 일괄 비활성화한다'
);
select lives_ok(
  $$select public.deactivate_entities(
    'ma_buyers', array['96500000-0000-0000-0000-000000000001'::uuid], '콘솔 비활성 사유')$$,
  'M&A 매수자를 일괄 비활성화한다'
);
select lives_ok(
  $$select public.deactivate_entities(
    'ma_sellers', array['96600000-0000-0000-0000-000000000001'::uuid], '콘솔 비활성 사유')$$,
  'M&A 매도자를 일괄 비활성화한다'
);
select lives_ok(
  $$select public.deactivate_entities(
    'funds',
    array[
      '96700000-0000-0000-0000-000000000001'::uuid,
      '96700000-0000-0000-0000-000000000002'::uuid
    ],
    '콘솔 비활성 사유')$$,
  'FUND 조합 두 건을 일괄 비활성화한다'
);

-- 이 한 건은 RPC 계약이 아니라 저장된 행 자체를 보는 불변식이다. authenticated로
-- entity_contributions를 직접 읽으면 M&A 매수자·매도자 행은 RLS가 가린다 — 참조하는
-- 당사자 행이 방금 비활성이 되었기 때문이며, 비활성화 자체는 성공한 상태다(아래
-- SECURITY DEFINER 목록 단언이 같은 사유를 읽어낸다). 그래서 이 단언 동안만 역할을
-- 세션 기본값으로 되돌려 RLS 없이 원장을 확인하고, 곧바로 authenticated와 같은 JWT
-- 클레임으로 복귀해 이후 RPC 테스트가 동일한 맥락에서 실행되게 한다.
reset role;
select is(
  (select (select count(*) from public.programs
            where id = '96300000-0000-0000-0000-000000000001' and deleted_at is not null)
        + (select count(*) from public.ma_programs
            where id = '96400000-0000-0000-0000-000000000001' and deleted_at is not null)
        + (select count(*) from public.ma_buyers
            where id = '96500000-0000-0000-0000-000000000001' and deleted_at is not null)
        + (select count(*) from public.ma_sellers
            where id = '96600000-0000-0000-0000-000000000001' and deleted_at is not null)
        + (select count(*) from public.funds
            where id in ('96700000-0000-0000-0000-000000000001',
                         '96700000-0000-0000-0000-000000000002')
              and deleted_at is not null))::integer,
  6,
  '최고관리자는 생성자가 아닌 업무 원장 여섯 행을 모두 비활성화한다'
);
select is(
  (select count(*)::integer from public.entity_contributions
    where action = 'deactivated'
      and note = '콘솔 비활성 사유'
      and (entity_table, entity_id) in (
        ('startups',   '96100000-0000-0000-0000-000000000001'::uuid),
        ('networks',   '96200000-0000-0000-0000-000000000001'::uuid),
        ('program',    '96300000-0000-0000-0000-000000000001'::uuid),
        ('ma_program', '96400000-0000-0000-0000-000000000001'::uuid),
        ('ma_buyers',  '96500000-0000-0000-0000-000000000001'::uuid),
        ('ma_sellers', '96600000-0000-0000-0000-000000000001'::uuid),
        ('fund',       '96700000-0000-0000-0000-000000000001'::uuid),
        ('fund',       '96700000-0000-0000-0000-000000000002'::uuid)
      )),
  8,
  '7종 원장 여덟 행 모두 각자의 기여 이력 키로 비활성화 사유를 남긴다'
);
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"app_user_id":"96000000-0000-0000-0000-000000000001","session_version":1}',
  true
);
-- 회귀: funds는 직접 UPDATE 특례로 사유가 비어 있었다(20260911105139).
select is(
  (select count(*)::integer from public.entity_contributions
    where entity_table = 'fund'
      and action = 'deactivated'
      and note = '콘솔 비활성 사유'
      and entity_id in (
        '96700000-0000-0000-0000-000000000001',
        '96700000-0000-0000-0000-000000000002'
      )),
  2,
  'FUND 일괄 비활성화도 전달한 사유를 entity_contributions.note에 남긴다'
);

-- ── 7종 비활성 목록 조회 ──────────────────────────────────────────────
select is(
  (select count(*)::integer from public.admin_inactive_ledger_entities('startups')),
  1,
  'STARTUP 비활성 목록이 대상을 돌려준다'
);
select is(
  (select count(*)::integer from public.admin_inactive_ledger_entities('networks')),
  1,
  'NETWORKS 비활성 목록이 대상을 돌려준다'
);
select is(
  (select count(*)::integer from public.admin_inactive_ledger_entities('programs')),
  1,
  'PROJECT 사업 비활성 목록이 대상을 돌려준다'
);
select is(
  (select count(*)::integer from public.admin_inactive_ledger_entities('ma_programs')),
  1,
  'M&A 딜 비활성 목록이 대상을 돌려준다'
);
select is(
  (select count(*)::integer from public.admin_inactive_ledger_entities('ma_buyers')),
  1,
  'M&A 매수자 비활성 목록이 대상을 돌려준다'
);
select is(
  (select count(*)::integer from public.admin_inactive_ledger_entities('ma_sellers')),
  1,
  'M&A 매도자 비활성 목록이 대상을 돌려준다'
);
select is(
  (select count(*)::integer from public.admin_inactive_ledger_entities('funds')),
  2,
  'FUND 비활성 목록이 두 건을 모두 돌려준다'
);
select is(
  (select e.entity_name || '/' || coalesce(e.category, '') || '/' || coalesce(e.deactivation_reason, '')
     from public.admin_inactive_ledger_entities('programs') e),
  '콘솔 사업/PUBLIC/콘솔 비활성 사유',
  'PROJECT 사업 행의 이름·구분·사유가 표시 계약대로 채워진다'
);
select is(
  (select coalesce(e.deactivation_reason, '') || '/' || coalesce(e.deactivated_by, '')
     from public.admin_inactive_ledger_entities('ma_buyers') e),
  '콘솔 비활성 사유/콘솔 테스트 관리자',
  'M&A 매수자는 비활성 행이라도 사유와 처리자를 함께 읽는다'
);

-- ── 7종 복구 ──────────────────────────────────────────────────────────
select lives_ok(
  $$select public.restore_entity(
    'startups', '96100000-0000-0000-0000-000000000001', '콘솔 복구 사유')$$,
  'STARTUP 비활성 행을 복구한다'
);
select lives_ok(
  $$select public.restore_entity(
    'networks', '96200000-0000-0000-0000-000000000001', '콘솔 복구 사유')$$,
  'NETWORKS 비활성 행을 복구한다'
);
select lives_ok(
  $$select public.restore_entity(
    'programs', '96300000-0000-0000-0000-000000000001', '콘솔 복구 사유')$$,
  'PROJECT 사업 비활성 행을 복구한다'
);
select lives_ok(
  $$select public.restore_entity(
    'ma_programs', '96400000-0000-0000-0000-000000000001', '콘솔 복구 사유')$$,
  'M&A 딜 비활성 행을 복구한다'
);
select lives_ok(
  $$select public.restore_entity(
    'ma_buyers', '96500000-0000-0000-0000-000000000001', '콘솔 복구 사유')$$,
  'M&A 매수자 비활성 행을 복구한다'
);
select lives_ok(
  $$select public.restore_entity(
    'ma_sellers', '96600000-0000-0000-0000-000000000001', '콘솔 복구 사유')$$,
  'M&A 매도자 비활성 행을 복구한다'
);
select lives_ok(
  $$select public.restore_entities(
    'funds',
    array[
      '96700000-0000-0000-0000-000000000001'::uuid,
      '96700000-0000-0000-0000-000000000002'::uuid
    ],
    '콘솔 복구 사유')$$,
  'FUND 비활성 두 건을 한 요청으로 복구한다'
);

select is(
  (select (select count(*) from public.startups
            where id = '96100000-0000-0000-0000-000000000001' and deleted_at is null)
        + (select count(*) from public.networks
            where id = '96200000-0000-0000-0000-000000000001' and deleted_at is null)
        + (select count(*) from public.programs
            where id = '96300000-0000-0000-0000-000000000001' and deleted_at is null)
        + (select count(*) from public.ma_programs
            where id = '96400000-0000-0000-0000-000000000001' and deleted_at is null)
        + (select count(*) from public.ma_buyers
            where id = '96500000-0000-0000-0000-000000000001' and deleted_at is null)
        + (select count(*) from public.ma_sellers
            where id = '96600000-0000-0000-0000-000000000001' and deleted_at is null)
        + (select count(*) from public.funds
            where id in ('96700000-0000-0000-0000-000000000001',
                         '96700000-0000-0000-0000-000000000002')
              and deleted_at is null))::integer,
  8,
  '복구한 여덟 행이 모두 활성 원장으로 돌아온다'
);
select is(
  (select count(*)::integer from public.entity_contributions
    where action = 'reactivated'
      and note = '콘솔 복구 사유'
      and entity_table in (
        'startups', 'networks', 'program', 'ma_program', 'ma_buyers', 'ma_sellers', 'fund'
      )),
  8,
  '복구 이력도 각 원장의 기여 이력 키로 사유와 함께 남는다'
);
select is(
  (select count(*)::integer from public.admin_inactive_ledger_entities('programs')),
  0,
  '복구된 사업은 비활성 목록에서 사라진다'
);

-- ── 거절 경로 ─────────────────────────────────────────────────────────
select throws_ok(
  $$select * from public.admin_inactive_ledger_entities('users')$$,
  '22023', 'unsupported_entity',
  '허용 목록 밖 원장은 비활성 목록을 돌려주지 않는다'
);
select throws_ok(
  $$select public.restore_entity(
    'users', '96100000-0000-0000-0000-000000000001', '사유')$$,
  '22023', 'unsupported_entity',
  '허용 목록 밖 원장은 복구되지 않는다'
);
select throws_ok(
  $$select public.restore_entities(
    'users', array['96100000-0000-0000-0000-000000000001'::uuid], '사유')$$,
  '22023', 'unsupported_entity',
  '허용 목록 밖 원장은 다중 복구되지 않는다'
);
select throws_ok(
  $$select public.deactivate_entities(
    'users', array['96100000-0000-0000-0000-000000000001'::uuid], '사유')$$,
  '22023', 'unsupported_entity',
  '허용 목록 밖 원장은 일괄 비활성화되지 않는다'
);
select throws_ok(
  $$select public.restore_entity(
    'programs', '96300000-0000-0000-0000-000000000001', '   ')$$,
  '23514', 'reason_required',
  '사유가 비면 복구하지 않는다'
);
select throws_ok(
  $$select public.restore_entities(
    'funds', array['96700000-0000-0000-0000-000000000001'::uuid], '')$$,
  '23514', 'reason_required',
  '사유가 비면 다중 복구하지 않는다'
);
select throws_ok(
  $$select public.restore_entity(
    'programs', '96300000-0000-0000-0000-000000000001', '이미 활성인 행 복구')$$,
  '42501', 'not_found_or_forbidden',
  '활성 상태인 사업은 복구 대상이 아니다'
);
select throws_ok(
  $$select public.restore_entity(
    'ma_buyers', '96500000-0000-0000-0000-000000000001', '이미 활성인 행 복구')$$,
  '42501', 'not_found_or_forbidden',
  '활성 상태인 M&A 매수자는 복구 대상이 아니다'
);

-- ── 원장별 기능 표와 7종 영구 삭제 ────────────────────────────────────
select is(
  (select count(*)::integer from public.admin_ledger_console_capabilities()),
  7,
  '기능 표는 7종 원장을 모두 답한다'
);
select is(
  (select string_agg(c.entity_key, ',' order by c.entity_key)
     from public.admin_ledger_console_capabilities() c
    where c.can_hard_delete),
  'funds,ma_buyers,ma_programs,ma_sellers,networks,programs,startups',
  '7종 원장 모두 영구 삭제 capability를 연다'
);
select ok(
  (select bool_and(
      c.can_list and c.can_restore and c.can_hard_delete and c.unsupported_note is null
    ) from public.admin_ledger_console_capabilities() c),
  '조회·복구·영구 삭제 capability가 7종 모두 일관되게 참이다'
);
select throws_ok(
  $$select public.admin_ledger_console_capabilities('users')$$,
  '22023', 'unsupported_entity',
  '허용 목록 밖 원장은 기능 표에도 없다'
);
select lives_ok(
  $sql$select
    public.deactivate_entities('startups', array['96100000-0000-0000-0000-000000000001'::uuid], '영구 삭제 준비'),
    public.deactivate_entities('networks', array['96200000-0000-0000-0000-000000000001'::uuid], '영구 삭제 준비'),
    public.deactivate_entities('programs', array['96300000-0000-0000-0000-000000000001'::uuid], '영구 삭제 준비'),
    public.deactivate_entities('ma_programs', array['96400000-0000-0000-0000-000000000001'::uuid], '영구 삭제 준비'),
    public.deactivate_entities('ma_buyers', array['96500000-0000-0000-0000-000000000001'::uuid], '영구 삭제 준비'),
    public.deactivate_entities('ma_sellers', array['96600000-0000-0000-0000-000000000001'::uuid], '영구 삭제 준비'),
    public.deactivate_entities('funds', array[
      '96700000-0000-0000-0000-000000000001'::uuid,
      '96700000-0000-0000-0000-000000000002'::uuid
    ], '영구 삭제 준비')$sql$,
  '복구한 7종 원장을 영구 삭제 대상으로 다시 비활성화한다'
);
select lives_ok(
  $sql$select
    public.admin_hard_delete_entities('startups', array['96100000-0000-0000-0000-000000000001'::uuid], '콘솔 영구 삭제', '삭제합니다'),
    public.admin_hard_delete_entities('networks', array['96200000-0000-0000-0000-000000000001'::uuid], '콘솔 영구 삭제', '삭제합니다'),
    public.admin_hard_delete_entities('programs', array['96300000-0000-0000-0000-000000000001'::uuid], '콘솔 영구 삭제', '삭제합니다'),
    public.admin_hard_delete_entities('ma_programs', array['96400000-0000-0000-0000-000000000001'::uuid], '콘솔 영구 삭제', '삭제합니다'),
    public.admin_hard_delete_entities('ma_buyers', array['96500000-0000-0000-0000-000000000001'::uuid], '콘솔 영구 삭제', '삭제합니다'),
    public.admin_hard_delete_entities('ma_sellers', array['96600000-0000-0000-0000-000000000001'::uuid], '콘솔 영구 삭제', '삭제합니다'),
    public.admin_hard_delete_entities('funds', array[
      '96700000-0000-0000-0000-000000000001'::uuid,
      '96700000-0000-0000-0000-000000000002'::uuid
    ], '콘솔 영구 삭제', '삭제합니다')$sql$,
  '연결 데이터가 없는 7종 원장 여덟 행을 영구 삭제한다'
);
select is(
  (select (select count(*) from public.startups where id = '96100000-0000-0000-0000-000000000001')
        + (select count(*) from public.networks where id = '96200000-0000-0000-0000-000000000001')
        + (select count(*) from public.programs where id = '96300000-0000-0000-0000-000000000001')
        + (select count(*) from public.ma_programs where id = '96400000-0000-0000-0000-000000000001')
        + (select count(*) from public.ma_buyers where id = '96500000-0000-0000-0000-000000000001')
        + (select count(*) from public.ma_sellers where id = '96600000-0000-0000-0000-000000000001')
        + (select count(*) from public.funds where id in (
            '96700000-0000-0000-0000-000000000001',
            '96700000-0000-0000-0000-000000000002'
          )))::integer,
  0,
  '영구 삭제한 7종 원장 여덟 행이 부모 원장에 남지 않는다'
);
select is(
  (select count(*)::integer from public.audit_logs
    where action = 'LEDGER_HARD_DELETE'
      and reason = '콘솔 영구 삭제'),
  8,
  '영구 삭제 감사 로그를 원장 행마다 남긴다'
);

-- ── 최고관리자가 아닌 사용자 ──────────────────────────────────────────
select set_config(
  'request.jwt.claims',
  '{"app_user_id":"96000000-0000-0000-0000-000000000002","session_version":1}',
  true
);
select throws_ok(
  $$select * from public.admin_inactive_ledger_entities('funds')$$,
  '42501', 'admin_required',
  '최고관리자가 아니면 비활성 원장 목록을 볼 수 없다'
);
select throws_ok(
  $$select public.restore_entity(
    'programs', '96300000-0000-0000-0000-000000000001', '권한 없는 복구')$$,
  '42501', 'admin_required',
  '최고관리자가 아니면 비활성 원장을 복구할 수 없다'
);
select throws_ok(
  $$select public.admin_ledger_console_capabilities()$$,
  '42501', 'admin_required',
  '최고관리자가 아니면 기능 표도 볼 수 없다'
);

reset role;
select * from finish();
rollback;
