-- =====================================================================
-- public.create_guest_accounts(jsonb) — 엄격 일괄 생성
--
-- 확인하는 것:
--   · 부분 성공(유효한 행은 다른 행의 실패와 무관하게 생긴다)
--   · 정규화된 두 종류의 기존 충돌(이메일·연락처)과 정지 계정도 자리를 지킨다는 사실
--   · 배치 안 중복은 승자를 고르지 않고 관련 행 전부를 실패시킨다
--   · 게스트·미인증 호출 거절, 권한 누출 없음(anon 닫힘, 내부 조립 함수는 앱 롤에 닫힘)
--   · 원장 연결의 인가(M&A는 존재를 답하지 않는다)와 흡수된 원장 행 거절
--     (스타트업·M&A 모두 — M&A는 읽을 수 있는 사용자에게도 막힌다)
--   · 동시성 방벽 — 이 RPC가 기대는 유일 인덱스 둘(uq_users_email_live,
--     uq_users_guest_phone)이 실재하고 함수 밖의 중복도 막는다는 사실
-- =====================================================================

begin;
select plan(42);

-- ---------------------------------------------------------------------
-- 셋업
-- ---------------------------------------------------------------------
insert into public.users (id, user_type, name, email, session_version) values
  ('98500000-0000-0000-0000-000000000001', 'read_only',   '일괄 담당자',   null, 1),
  ('98500000-0000-0000-0000-000000000002', 'super_admin', '시스템 관리자', null, 1),
  ('98500000-0000-0000-0000-000000000003', 'read_only',   '내부 임직원',
   'internal-staff-batch@example.test', 1);

insert into public.workspace_permissions
  (user_id, workspace_key, permission_level, scope_type)
values
  ('98500000-0000-0000-0000-000000000001', 'startup', 'read', 'global');

insert into public.startups (id, name, representative, email, phone)
values (
  '98600000-0000-0000-0000-000000000001',
  '일괄 생성 원장 기업', '원장 담당자', 'batch-ledger-startup@example.test', '01099990001'
);

-- 흡수된 원장 행(정본이 아님). 병합 트리거는 update에 달려 있으므로 처음부터 값을 넣어
-- 만든다 — 이 테스트가 보려는 것은 병합 절차가 아니라 "흡수된 행은 고를 수 없다"이다.
insert into public.startups (id, name, representative, merged_into_id)
values (
  '98600000-0000-0000-0000-000000000002',
  '흡수된 원장 기업', '흡수 담당자', '98600000-0000-0000-0000-000000000001'
);

insert into public.ma_sellers (id, name, created_by)
values (
  '98700000-0000-0000-0000-000000000001', '매각 정본 기업',
  '98500000-0000-0000-0000-000000000002'
);
insert into public.ma_sellers (id, name, created_by, merged_into_id)
values (
  '98700000-0000-0000-0000-000000000002', '흡수된 매각 기업',
  '98500000-0000-0000-0000-000000000002', '98700000-0000-0000-0000-000000000001'
);

create temporary table guest_batch_result (
  label   text primary key,
  payload jsonb not null
);
grant select, insert on guest_batch_result to authenticated;

create function pg_temp.batch_row(p_label text, p_index integer)
returns jsonb language sql stable as $$
  select r.elem
    from pg_temp.guest_batch_result b,
         jsonb_array_elements(b.payload -> 'rows') as r(elem)
   where b.label = p_label
     and (r.elem ->> 'index')::integer = p_index;
$$;

create function pg_temp.batch_num(p_label text, p_field text)
returns integer language sql stable as $$
  select (b.payload ->> p_field)::integer
    from pg_temp.guest_batch_result b where b.label = p_label;
$$;

create function pg_temp.batch_status(p_label text, p_index integer)
returns text language sql stable as $$
  select pg_temp.batch_row(p_label, p_index) ->> 'status';
$$;

create function pg_temp.batch_codes(p_label text, p_index integer)
returns text language sql stable as $$
  select coalesce(string_agg(t.e ->> 'code', ',' order by t.e ->> 'code'), '')
    from jsonb_array_elements(pg_temp.batch_row(p_label, p_index) -> 'errors') as t(e);
$$;

create function pg_temp.batch_fields(p_label text, p_index integer)
returns text language sql stable as $$
  select coalesce(string_agg(t.e ->> 'field', ',' order by t.e ->> 'field'), '')
    from jsonb_array_elements(pg_temp.batch_row(p_label, p_index) -> 'errors') as t(e);
$$;

create function pg_temp.batch_keys(p_label text)
returns text language sql stable as $$
  select string_agg(r.elem ->> 'key', ',' order by (r.elem ->> 'index')::integer)
    from pg_temp.guest_batch_result b,
         jsonb_array_elements(b.payload -> 'rows') as r(elem)
   where b.label = p_label;
$$;

grant execute on function pg_temp.batch_row(text, integer)    to authenticated;
grant execute on function pg_temp.batch_num(text, text)       to authenticated;
grant execute on function pg_temp.batch_status(text, integer) to authenticated;
grant execute on function pg_temp.batch_codes(text, integer)  to authenticated;
grant execute on function pg_temp.batch_fields(text, integer) to authenticated;
grant execute on function pg_temp.batch_keys(text)            to authenticated;

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"app_user_id":"98500000-0000-0000-0000-000000000001","session_version":1}',
  true
);

-- ---------------------------------------------------------------------
-- (1) 부분 성공 — 유효한 두 행만 생기고 나머지는 칸별 사유로 실패한다
-- ---------------------------------------------------------------------
insert into guest_batch_result (label, payload)
select 'partial', public.create_guest_accounts(jsonb_build_array(
  jsonb_build_object('key', 'r1', 'name', '일괄 게스트 A',
                     'email', 'batch-a@example.test', 'phone', '010-2000-0001'),
  jsonb_build_object('key', 'r2', 'name', '   ',
                     'email', 'batch-b@example.test', 'phone', '01020000002'),
  jsonb_build_object('key', 'r3', 'name', '일괄 게스트 C',
                     'email', 'not-an-email', 'phone', '01020000003'),
  jsonb_build_object('key', 'r4', 'name', '원장 담당자',
                     'email', 'batch-ledger@example.test', 'phone', '01020000004',
                     'master_table', 'startups',
                     'master_id', '98600000-0000-0000-0000-000000000001'),
  jsonb_build_object('key', 'r5', 'name', '내부 충돌',
                     'email', 'internal-staff-batch@example.test', 'phone', '01020000005'),
  jsonb_build_object('key', 'r6', 'name', '엠앤에이 담당자',
                     'email', 'batch-ma@example.test', 'phone', '01020000006',
                     'master_table', 'ma_sellers',
                     'master_id', '98600000-0000-0000-0000-0000000000ff')
));

select is(pg_temp.batch_num('partial', 'created'), 2, '유효한 두 행만 생성된다');
select is(pg_temp.batch_num('partial', 'failed'),  4, '나머지 네 행은 실패로 돌아온다');
select is(pg_temp.batch_num('partial', 'total'),   6, '결과는 입력 행 수를 그대로 센다');
select is(pg_temp.batch_keys('partial'), 'r1,r2,r3,r4,r5,r6',
  '결과는 입력 순서와 호출자 key를 그대로 돌려준다');

select is(pg_temp.batch_status('partial', 0), 'CREATED', '첫 행은 생성된다');
select is(
  (select count(*)::integer from public.users
    where email = 'batch-a@example.test' and user_type = 'temporary_guest'),
  1,
  '원장을 지정하지 않은 행은 temporary_guest 계정 한 건이 된다');

select is(pg_temp.batch_status('partial', 1), 'FAILED', '이름이 빈 행은 실패한다');
select is(pg_temp.batch_codes('partial', 1), 'NAME_REQUIRED', '이름 누락은 NAME_REQUIRED다');
select is(pg_temp.batch_fields('partial', 1), 'name', '실패 사유는 칸(name)을 가리킨다');
select is(pg_temp.batch_codes('partial', 2), 'EMAIL_INVALID', '이메일 형식 오류는 EMAIL_INVALID다');

select is(pg_temp.batch_status('partial', 3), 'CREATED', '원장을 연결한 행도 생성된다');
select is(pg_temp.batch_row('partial', 3) ->> 'user_type', 'external_startup',
  '스타트업 원장 연결 계정의 유형은 external_startup이다');
select is(
  (select count(*)::integer
     from public.guest_identities gi
     join public.users u on u.id = gi.user_id
    where gi.master_table = 'startups'
      and gi.master_id = '98600000-0000-0000-0000-000000000001'
      and u.email = 'batch-ledger@example.test'),
  1,
  '원장 연결 결과로 guest_identities가 정확히 한 건 생긴다');

select is(pg_temp.batch_codes('partial', 4), 'EMAIL_TAKEN_INTERNAL',
  '내부 임직원 이메일은 EMAIL_TAKEN_INTERNAL로 거절한다');

-- M&A 원장은 권한이 없으면 존재 여부를 답하지 않는다 — MASTER_NOT_FOUND가 아니라 FORBIDDEN이다.
select is(pg_temp.batch_codes('partial', 5), 'MASTER_FORBIDDEN',
  'M&A 원장 연결은 권한 없는 사용자에게 존재 여부를 알려 주지 않는다');
-- 거절된 M&A 행이 아무것도 남기지 않았다는 사실은 RLS 밖(아래 (7))에서 확인한다 —
-- 인격 표는 M&A 읽기 권한이 없는 이 사용자에게 애초에 보이지 않으므로, 여기서 센 0은
-- "없다"가 아니라 "안 보인다"일 수 있다.

-- ---------------------------------------------------------------------
-- (2) 기존 충돌 두 종류 — 정지된 계정도 이메일·연락처 자리를 지킨다
-- ---------------------------------------------------------------------
reset role;
update public.users set is_active = false where email = 'batch-a@example.test';

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"app_user_id":"98500000-0000-0000-0000-000000000001","session_version":1}',
  true
);

insert into guest_batch_result (label, payload)
select 'existing', public.create_guest_accounts(jsonb_build_array(
  -- 같은 이메일(대문자 표기) — 정지 상태여도 재사용하지 않는다
  jsonb_build_object('key', 'e1', 'name', '다시 시도',
                     'email', 'BATCH-A@example.test', 'phone', '01029990001'),
  -- 같은 연락처(형식만 다르다)
  jsonb_build_object('key', 'e2', 'name', '연락처 충돌',
                     'email', 'batch-phone-dup@example.test', 'phone', '01020000001')
));

select is(pg_temp.batch_num('existing', 'created'), 0, '기존 충돌 행은 아무것도 생성하지 않는다');
select is(pg_temp.batch_codes('existing', 0), 'EMAIL_TAKEN_GUEST',
  '정지된 계정의 이메일도 EMAIL_TAKEN_GUEST로 거절한다(정규화 비교)');
select is(pg_temp.batch_codes('existing', 1), 'PHONE_TAKEN_GUEST',
  '표기만 다른 같은 연락처도 PHONE_TAKEN_GUEST로 거절한다');
select is(
  (select count(*)::integer from public.users where lower(email) = 'batch-a@example.test'),
  1,
  '충돌 거절 뒤에도 기존 계정은 한 건이며 새 계정이 생기지 않는다');

-- ---------------------------------------------------------------------
-- (3) 배치 안 중복 — 먼저 온 행을 살리지 않고 관련 행 전부를 실패시킨다
-- ---------------------------------------------------------------------
insert into guest_batch_result (label, payload)
select 'batchdup', public.create_guest_accounts(jsonb_build_array(
  jsonb_build_object('key', 'd1', 'name', '중복 이메일 1',
                     'email', 'dup-email@example.test', 'phone', '01031000001'),
  jsonb_build_object('key', 'd2', 'name', '중복 이메일 2',
                     'email', 'DUP-EMAIL@example.test', 'phone', '01031000002'),
  jsonb_build_object('key', 'd3', 'name', '중복 연락처 1',
                     'email', 'dup-phone-1@example.test', 'phone', '010-3200-0001'),
  jsonb_build_object('key', 'd4', 'name', '중복 연락처 2',
                     'email', 'dup-phone-2@example.test', 'phone', '01032000001')
));

select is(pg_temp.batch_num('batchdup', 'created'), 0, '배치 안 중복은 한 건도 만들지 않는다');
select is(pg_temp.batch_codes('batchdup', 0), 'EMAIL_DUPLICATE_IN_BATCH',
  '중복 이메일 첫 행도 실패한다');
select is(pg_temp.batch_codes('batchdup', 1), 'EMAIL_DUPLICATE_IN_BATCH',
  '중복 이메일 두 번째 행도 실패한다');
select is(pg_temp.batch_codes('batchdup', 2), 'PHONE_DUPLICATE_IN_BATCH',
  '중복 연락처 첫 행도 실패한다');
select is(pg_temp.batch_codes('batchdup', 3), 'PHONE_DUPLICATE_IN_BATCH',
  '중복 연락처 두 번째 행도 실패한다');
select is(
  (select count(*)::integer from public.users
    where lower(email) in (
      'dup-email@example.test', 'dup-phone-1@example.test', 'dup-phone-2@example.test')),
  0,
  '배치 안 중복 행의 계정은 하나도 남지 않는다');

-- ---------------------------------------------------------------------
-- (4) 입력 형태·원장 지정 오류
-- ---------------------------------------------------------------------
insert into guest_batch_result (label, payload)
select 'shape', public.create_guest_accounts(jsonb_build_array(
  jsonb_build_object('key', 'm1', 'name', '원장 반쪽',
                     'email', 'shape-1@example.test', 'phone', '01033000001',
                     'master_table', 'startups'),
  jsonb_build_object('key', 'm2', 'name', '모르는 원장',
                     'email', 'shape-2@example.test', 'phone', '01033000002',
                     'master_table', 'employees',
                     'master_id', '98600000-0000-0000-0000-000000000001'),
  jsonb_build_object('key', 'm3', 'name', '원장 id 형식',
                     'email', 'shape-3@example.test', 'phone', '01033000003',
                     'master_table', 'startups', 'master_id', 'abc'),
  jsonb_build_object('key', 'm4', 'name', '없는 원장 행',
                     'email', 'shape-4@example.test', 'phone', '01033000004',
                     'master_table', 'startups',
                     'master_id', '98600000-0000-0000-0000-0000000000aa'),
  '"행이 아닌 값"'::jsonb
));

select is(pg_temp.batch_num('shape', 'created'), 0, '형태·원장 오류 행은 하나도 만들지 않는다');
select is(pg_temp.batch_codes('shape', 0), 'MASTER_PAIR_REQUIRED',
  '원장 종류만 준 행은 MASTER_PAIR_REQUIRED다');
select is(pg_temp.batch_codes('shape', 1), 'MASTER_TABLE_UNKNOWN',
  '허용 목록에 없는 원장은 MASTER_TABLE_UNKNOWN이다');
select is(pg_temp.batch_codes('shape', 2), 'MASTER_ID_INVALID',
  'uuid가 아닌 master_id는 MASTER_ID_INVALID다');
select is(pg_temp.batch_codes('shape', 3), 'MASTER_NOT_FOUND',
  '읽을 수 있는 원장의 없는 행은 MASTER_NOT_FOUND다');
select is(pg_temp.batch_codes('shape', 4), 'ROW_NOT_OBJECT',
  '객체가 아닌 요소는 ROW_NOT_OBJECT로 그 행만 실패한다');

-- ---------------------------------------------------------------------
-- (4-1) 흡수된 원장 행은 고를 수 없다 — 화면의 원장 선택창과 같은 기준
-- ---------------------------------------------------------------------
insert into guest_batch_result (label, payload)
select 'mergedstartup', public.create_guest_accounts(jsonb_build_array(
  jsonb_build_object('key', 'g1', 'name', '흡수 원장 담당자',
                     'email', 'merged-startup@example.test', 'phone', '01035000001',
                     'master_table', 'startups',
                     'master_id', '98600000-0000-0000-0000-000000000002')
));

select is(pg_temp.batch_codes('mergedstartup', 0), 'MASTER_NOT_FOUND',
  '흡수된 스타트업 원장 행에는 계정을 연결할 수 없다');

-- M&A는 읽을 수 있는 사용자에게도 흡수된 행이 막히는지 봐야 한다 — 권한 판정
-- (can_read_ma_party)은 병합을 보지 않기 때문이다. 최고관리자로 갈아타 확인한다.
select set_config(
  'request.jwt.claims',
  '{"app_user_id":"98500000-0000-0000-0000-000000000002","session_version":1}',
  true
);
insert into guest_batch_result (label, payload)
select 'mergedma', public.create_guest_accounts(jsonb_build_array(
  jsonb_build_object('key', 'g2', 'name', '흡수 매각 담당자',
                     'email', 'merged-ma@example.test', 'phone', '01035000002',
                     'master_table', 'ma_sellers',
                     'master_id', '98700000-0000-0000-0000-000000000002'),
  jsonb_build_object('key', 'g3', 'name', '정본 매각 담당자',
                     'email', 'canonical-ma@example.test', 'phone', '01035000003',
                     'master_table', 'ma_sellers',
                     'master_id', '98700000-0000-0000-0000-000000000001')
));

select is(pg_temp.batch_codes('mergedma', 0), 'MASTER_NOT_FOUND',
  '원장을 읽을 수 있는 사용자에게도 흡수된 M&A 행은 MASTER_NOT_FOUND다');
select is(pg_temp.batch_status('mergedma', 1), 'CREATED',
  '같은 배치의 살아 있는 정본 M&A 행은 그대로 생성된다');

select set_config(
  'request.jwt.claims',
  '{"app_user_id":"98500000-0000-0000-0000-000000000001","session_version":1}',
  true
);

-- ---------------------------------------------------------------------
-- (5) 거절 경로 — 게스트, 미인증, 빈 입력
-- ---------------------------------------------------------------------
select set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'app_user_id', (select id from public.users where email = 'batch-ledger@example.test'),
    'session_version', 1
  )::text,
  true
);
select throws_ok(
  $$select public.create_guest_accounts(
      jsonb_build_array(jsonb_build_object(
        'name', '게스트가 만든 계정',
        'email', 'guest-made@example.test',
        'phone', '01034000001'))
    )$$,
  '42501', null,
  'GUEST는 일괄 생성을 호출할 수 없다'
);

select set_config('request.jwt.claims', '{}', true);
select throws_ok(
  $$select public.create_guest_accounts(
      jsonb_build_array(jsonb_build_object(
        'name', '미인증 생성',
        'email', 'anon-made@example.test',
        'phone', '01034000002'))
    )$$,
  '42501', null,
  '미인증 호출은 일괄 생성을 할 수 없다'
);

select set_config(
  'request.jwt.claims',
  '{"app_user_id":"98500000-0000-0000-0000-000000000001","session_version":1}',
  true
);
select throws_ok(
  $$select public.create_guest_accounts('[]'::jsonb)$$,
  '22023', null,
  '빈 입력은 호출 자체를 거절한다'
);

-- ---------------------------------------------------------------------
-- (6) 권한 누출 없음
-- ---------------------------------------------------------------------
select ok(
  not has_function_privilege('anon', 'public.create_guest_accounts(jsonb)', 'EXECUTE')
  and has_function_privilege('authenticated', 'public.create_guest_accounts(jsonb)', 'EXECUTE')
  and not has_function_privilege('anon', 'app.guest_batch_error(text,text,text)', 'EXECUTE')
  and not has_function_privilege('authenticated', 'app.guest_batch_error(text,text,text)', 'EXECUTE'),
  '일괄 생성 RPC는 authenticated에만 열리고 내부 조립 함수는 앱 롤 전부에 닫혀 있다'
);

-- ---------------------------------------------------------------------
-- (7) 동시성 방벽 — 판정이 아니라 인덱스가 마지막을 막는다
-- ---------------------------------------------------------------------
reset role;

select throws_ok(
  $$insert into public.users (user_type, name, email, phone) values
      ('temporary_guest', '직접 A', 'direct-a@example.test', '010-4000-0001'),
      ('external_startup', '직접 B', 'direct-b@example.test', '01040000001')$$,
  '23505', null,
  'GUEST 연락처 유일 인덱스가 함수 밖의 중복 삽입도 막는다(검사가 아니라 원장이 최종 판정)'
);

-- 이 RPC가 기대는 두 인덱스는 이 파일이 만들지 않는다 — 있어야 동시성 보장이 성립한다.
select ok(
  (select count(*) from pg_catalog.pg_indexes
    where schemaname = 'public'
      and indexname in ('uq_users_email_live', 'uq_users_guest_phone')) = 2,
  '이메일·연락처 유일 인덱스가 둘 다 존재한다'
);

-- 권한으로 거절한 M&A 행은 계정도 인격도 남기지 않는다(RLS 밖에서 센다).
select ok(
  (select count(*) from public.users where email = 'batch-ma@example.test') = 0
  and (select count(*) from public.guest_identities
        where master_table = 'ma_sellers'
          and master_id = '98600000-0000-0000-0000-0000000000ff') = 0,
  '거절된 M&A 행은 계정도 인격도 남기지 않는다'
);

-- ---------------------------------------------------------------------
-- (8) 감사 로그 — 생성된 계정만 적재된다
-- ---------------------------------------------------------------------
select is(
  (select count(*)::integer from public.audit_logs
    where action = 'GUEST_ACCOUNT_ISSUE'
      and after_data ->> 'source' = 'batch'),
  3,
  '일괄 생성 감사 로그는 실제로 생긴 세 계정에만 남는다(실패 행은 남기지 않는다)'
);

select * from finish();
rollback;
