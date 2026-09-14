\if false
-- =====================================================================
-- public.create_guest_accounts(jsonb) — 엄격 일괄 생성
--
-- 확인하는 것:
--   · 부분 성공(유효한 행은 다른 행의 실패와 무관하게 생긴다)
--   · 필수 칸 셋(이름·이메일·소속)과 **선택 칸이 된 연락처**(2026-09-14)
--   · 정규화된 기존 충돌(이메일)과 정지 계정도 이메일 자리를 지킨다는 사실
--   · 배치 안 중복은 승자를 고르지 않고 관련 행 전부를 실패시킨다(축은 이메일·key 둘뿐)
--   · 게스트·미인증 호출 거절, 권한 누출 없음(anon 닫힘, 내부 조립 함수는 앱 롤에 닫힘)
--   · 원장 연결의 인가(M&A는 존재를 답하지 않는다)와 흡수된 원장 행 거절
--     (스타트업·M&A 모두 — M&A는 읽을 수 있는 사용자에게도 막힌다)
--   · 동시성 방벽 — 이 RPC가 기대는 유일 인덱스는 이제 uq_users_email_live 하나이며
--     uq_users_guest_phone은 철회되었다(20260914210000)
-- =====================================================================

begin;
select plan(55);

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
  jsonb_build_object('key', 'r1', 'name', '일괄 게스트 A', 'affiliation', '일괄 기관 A',
                     'email', 'batch-a@example.test', 'phone', '010-2000-0001'),
  jsonb_build_object('key', 'r2', 'name', '   ', 'affiliation', '일괄 기관 B',
                     'email', 'batch-b@example.test', 'phone', '01020000002'),
  jsonb_build_object('key', 'r3', 'name', '일괄 게스트 C', 'affiliation', '일괄 기관 C',
                     'email', 'not-an-email', 'phone', '01020000003'),
  jsonb_build_object('key', 'r4', 'name', '원장 담당자', 'affiliation', '일괄 생성 원장 기업',
                     'email', 'batch-ledger@example.test', 'phone', '01020000004',
                     'master_table', 'startups',
                     'master_id', '98600000-0000-0000-0000-000000000001'),
  jsonb_build_object('key', 'r5', 'name', '내부 충돌', 'affiliation', '일괄 기관 E',
                     'email', 'internal-staff-batch@example.test', 'phone', '01020000005'),
  jsonb_build_object('key', 'r6', 'name', '엠앤에이 담당자', 'affiliation', '일괄 기관 F',
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
-- (2) 기존 충돌 — 정지된 계정도 **이메일** 자리는 지키지만 연락처 자리는 지키지 않는다
--
--     연락처는 2026-09-14부터 자격증명이 아니므로 이미 쓰이는 번호도 막지 않는다
--     (uq_users_guest_phone 철회, PHONE_TAKEN_GUEST 폐지).
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
  jsonb_build_object('key', 'e1', 'name', '다시 시도', 'affiliation', '재시도 기관',
                     'email', 'BATCH-A@example.test', 'phone', '01029990001'),
  -- 이미 쓰이는 연락처(형식만 다르다) — 이제 막지 않는다
  jsonb_build_object('key', 'e2', 'name', '번호 공유', 'affiliation', '대표번호 기관',
                     'email', 'batch-phone-dup@example.test', 'phone', '01020000001')
));

select is(pg_temp.batch_num('existing', 'created'), 1,
  '이메일이 겹친 행만 실패하고 연락처가 겹친 행은 생성된다');
select is(pg_temp.batch_codes('existing', 0), 'EMAIL_TAKEN_GUEST',
  '정지된 계정의 이메일도 EMAIL_TAKEN_GUEST로 거절한다(정규화 비교)');
select is(pg_temp.batch_status('existing', 1), 'CREATED',
  '이미 다른 계정이 쓰는 연락처는 더 이상 자리를 막지 않는다');
select is(
  (select count(*)::integer from public.users where lower(email) = 'batch-a@example.test'),
  1,
  '이메일 충돌 거절 뒤에도 기존 계정은 한 건이며 새 계정이 생기지 않는다');

-- ---------------------------------------------------------------------
-- (3) 배치 안 중복 — 먼저 온 행을 살리지 않고 관련 행 전부를 실패시킨다
--
--     세는 축은 이메일과 호출자 key 둘뿐이다(2026-09-14). 같은 연락처를 적은 두 행은
--     오입력이 아니라 같은 대표번호를 쓰는 두 담당자이므로 둘 다 만든다.
-- ---------------------------------------------------------------------
insert into guest_batch_result (label, payload)
select 'batchdup', public.create_guest_accounts(jsonb_build_array(
  jsonb_build_object('key', 'd1', 'name', '중복 이메일 1', 'affiliation', '중복 기관 1',
                     'email', 'dup-email@example.test', 'phone', '01031000001'),
  jsonb_build_object('key', 'd2', 'name', '중복 이메일 2', 'affiliation', '중복 기관 2',
                     'email', 'DUP-EMAIL@example.test', 'phone', '01031000002'),
  jsonb_build_object('key', 'd3', 'name', '같은 번호 1', 'affiliation', '대표번호 기관',
                     'email', 'dup-phone-1@example.test', 'phone', '010-3200-0001'),
  jsonb_build_object('key', 'd4', 'name', '같은 번호 2', 'affiliation', '대표번호 기관',
                     'email', 'dup-phone-2@example.test', 'phone', '01032000001')
));

select is(pg_temp.batch_num('batchdup', 'created'), 2,
  '배치 안 이메일 중복만 실패하고 연락처가 같은 두 행은 모두 생성된다');
select is(pg_temp.batch_codes('batchdup', 0), 'EMAIL_DUPLICATE_IN_BATCH',
  '중복 이메일 첫 행도 실패한다');
select is(pg_temp.batch_codes('batchdup', 1), 'EMAIL_DUPLICATE_IN_BATCH',
  '중복 이메일 두 번째 행도 실패한다');
select is(pg_temp.batch_status('batchdup', 2), 'CREATED',
  '같은 연락처를 적은 첫 행은 그대로 생성된다');
select is(pg_temp.batch_status('batchdup', 3), 'CREATED',
  '같은 연락처를 적은 두 번째 행도 그대로 생성된다');
select is(
  (select count(*)::integer from public.users
    where lower(email) = 'dup-email@example.test'),
  0,
  '배치 안 이메일 중복 행의 계정은 하나도 남지 않는다');
select is(
  (select count(*)::integer from public.users
    where phone in ('010-3200-0001', '01032000001')),
  2,
  '같은 번호를 나눠 쓰는 두 계정이 나란히 남는다');

-- ---------------------------------------------------------------------
-- (3-1) 연락처는 선택 칸이다 — 없어도 만들고, 적었을 때만 형식을 본다
-- ---------------------------------------------------------------------
insert into guest_batch_result (label, payload)
select 'phoneopt', public.create_guest_accounts(jsonb_build_array(
  -- phone 키 자체가 없다
  jsonb_build_object('key', 'p1', 'name', '번호 없는 게스트', 'affiliation', '무번호 기관',
                     'email', 'phone-none@example.test'),
  -- phone 키는 있으나 공백뿐이다
  jsonb_build_object('key', 'p2', 'name', '빈 번호 게스트', 'affiliation', '빈번호 기관',
                     'email', 'phone-blank@example.test', 'phone', '   '),
  -- 적었으면 형식은 본다
  jsonb_build_object('key', 'p3', 'name', '짧은 번호 게스트', 'affiliation', '짧은번호 기관',
                     'email', 'phone-short@example.test', 'phone', '0103')
));

select is(pg_temp.batch_num('phoneopt', 'created'), 2,
  '연락처를 비운 두 행은 모두 생성된다');
select is(pg_temp.batch_status('phoneopt', 0), 'CREATED',
  'phone 칸이 아예 없어도 계정이 선다');
select is(pg_temp.batch_status('phoneopt', 1), 'CREATED',
  'phone 칸이 공백뿐이어도 계정이 선다');
select is(pg_temp.batch_codes('phoneopt', 2), 'PHONE_INVALID',
  '연락처를 적었는데 숫자 9~15자리가 아니면 PHONE_INVALID다');
select is(pg_temp.batch_fields('phoneopt', 2), 'phone',
  '형식 사유는 칸(phone)을 가리킨다');
select is(
  (select phone from public.users where email = 'phone-none@example.test'),
  null::text,
  '비운 연락처는 빈 문자열이 아니라 null로 남는다');

-- ---------------------------------------------------------------------
-- (3-2) 소속은 필수 칸이다 — 연락처가 비운 자리를 소속이 대신 채운다
-- ---------------------------------------------------------------------
insert into guest_batch_result (label, payload)
select 'affil', public.create_guest_accounts(jsonb_build_array(
  -- affiliation 키 자체가 없다
  jsonb_build_object('key', 'a1', 'name', '소속 없는 게스트',
                     'email', 'affil-none@example.test', 'phone', '01036000001'),
  -- 200자를 넘는다
  jsonb_build_object('key', 'a2', 'name', '긴 소속 게스트', 'affiliation', repeat('가', 201),
                     'email', 'affil-long@example.test', 'phone', '01036000002'),
  -- 공백뿐인 값은 적지 않은 것과 같다
  jsonb_build_object('key', 'a3', 'name', '공백 소속 게스트', 'affiliation', '   ',
                     'email', 'affil-blank@example.test', 'phone', '01036000003')
));

select is(pg_temp.batch_num('affil', 'created'), 0, '소속이 없거나 너무 긴 행은 만들지 않는다');
select is(pg_temp.batch_codes('affil', 0), 'AFFILIATION_REQUIRED',
  '소속 누락은 AFFILIATION_REQUIRED다');
select is(pg_temp.batch_fields('affil', 0), 'affiliation',
  '실패 사유는 칸(affiliation)을 가리킨다');
select is(pg_temp.batch_codes('affil', 1), 'AFFILIATION_TOO_LONG',
  '200자를 넘는 소속은 AFFILIATION_TOO_LONG이다');
select is(pg_temp.batch_codes('affil', 2), 'AFFILIATION_REQUIRED',
  '공백뿐인 소속은 적지 않은 것과 같다');

-- ---------------------------------------------------------------------
-- (4) 입력 형태·원장 지정 오류
-- ---------------------------------------------------------------------
insert into guest_batch_result (label, payload)
select 'shape', public.create_guest_accounts(jsonb_build_array(
  jsonb_build_object('key', 'm1', 'name', '원장 반쪽', 'affiliation', '형태 기관 1',
                     'email', 'shape-1@example.test', 'phone', '01033000001',
                     'master_table', 'startups'),
  jsonb_build_object('key', 'm2', 'name', '모르는 원장', 'affiliation', '형태 기관 2',
                     'email', 'shape-2@example.test', 'phone', '01033000002',
                     'master_table', 'employees',
                     'master_id', '98600000-0000-0000-0000-000000000001'),
  jsonb_build_object('key', 'm3', 'name', '원장 id 형식', 'affiliation', '형태 기관 3',
                     'email', 'shape-3@example.test', 'phone', '01033000003',
                     'master_table', 'startups', 'master_id', 'abc'),
  jsonb_build_object('key', 'm4', 'name', '없는 원장 행', 'affiliation', '형태 기관 4',
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
  jsonb_build_object('key', 'g1', 'name', '흡수 원장 담당자', 'affiliation', '흡수된 원장 기업',
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
  jsonb_build_object('key', 'g2', 'name', '흡수 매각 담당자', 'affiliation', '흡수된 매각 기업',
                     'email', 'merged-ma@example.test', 'phone', '01035000002',
                     'master_table', 'ma_sellers',
                     'master_id', '98700000-0000-0000-0000-000000000002'),
  jsonb_build_object('key', 'g3', 'name', '정본 매각 담당자', 'affiliation', '매각 정본 기업',
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
        'affiliation', '게스트 기관',
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
        'affiliation', '미인증 기관',
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
      ('external_startup', '직접 B', 'DIRECT-A@example.test', '01040000002')$$,
  '23505', null,
  '이메일 유일 인덱스가 함수 밖의 중복 삽입도 막는다(검사가 아니라 원장이 최종 판정)'
);

-- 연락처는 반대다. 자격증명이 아니게 된 값이라 표 차원에서도 막지 않는다.
select lives_ok(
  $$insert into public.users (user_type, name, email, phone) values
      ('temporary_guest', '직접 C', 'direct-c@example.test', '010-4100-0001'),
      ('external_startup', '직접 D', 'direct-d@example.test', '01041000001')$$,
  '같은 연락처를 가진 GUEST 계정 둘이 표에 나란히 들어간다'
);

-- 이 RPC가 기대는 인덱스는 이 파일이 만들지 않는다 — 있어야 동시성 보장이 성립한다.
-- 연락처 인덱스는 20260914210000이 철회했으므로 **없어야** 한다.
select ok(
  (select count(*) from pg_catalog.pg_indexes
    where schemaname = 'public' and indexname = 'uq_users_email_live') = 1
  and (select count(*) from pg_catalog.pg_indexes
        where schemaname = 'public' and indexname = 'uq_users_guest_phone') = 0,
  '이메일 유일 인덱스만 남고 연락처 유일 인덱스는 철회되었다'
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
  8,
  '일괄 생성 감사 로그는 실제로 생긴 여덟 계정에만 남는다(실패 행은 남기지 않는다)'
);

select * from finish();
rollback;
\endif

-- Superseded by guest_independent_account_test.sql: phone and ledger-key
-- validation are intentionally no longer part of GUEST batch creation.
begin;
select plan(1);
select pass('legacy relation-aware batch contract is superseded');
select * from finish();
rollback;
