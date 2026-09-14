begin;
select plan(45);

select ok(to_regclass('public.guest_identities') is null,
  'guest_identities is removed');
select ok(to_regprocedure('public.issue_guest_account(text,uuid,text,text,text,text)') is null,
  'ledger-account issue RPC is removed');
select ok(
  to_regprocedure('public.create_guest_account(text,text,text)') is not null
  and to_regprocedure('public.create_guest_account(text,text,text,text,uuid,text)') is not null,
  'canonical create RPC and ignored-legacy rollout wrapper both exist');
select ok(
  to_regprocedure('public.admin_update_guest_contact(uuid,text,text,text,text,text)') is not null
  and to_regprocedure('public.admin_update_guest_contact(uuid,text,text,text,text)') is not null,
  'ADMIN profile edit exposes canonical and exact legacy signatures');
select ok(
  to_regprocedure('public.guest_accounts_list(text,integer,integer,text,boolean)') is not null
  and to_regprocedure('public.guest_accounts_list(text,integer,integer,text,text[],boolean,text)') is not null,
  'canonical list RPC and old-filter rollout wrapper both exist');
select ok(to_regprocedure('public.reset_program_guest_password(uuid[])') is null,
  'invitation-local legacy password reset RPC is removed');
select ok(
  to_regclass('public.idx_guest_inv_phone') is null
  and to_regclass('public.idx_guest_inv_email') is null,
  'obsolete invitation contact indexes are removed');
select is(
  pg_get_function_result('public.open_program_guest_access(uuid[])'::regprocedure),
  'TABLE(participant_id uuid, program_code text, target_name text, email text, account_is_new boolean)',
  'open access response contains no phone or ledger relation');
select ok(
  to_regprocedure('public.guest_account_ledger_candidates(text,integer,integer,text)') is not null,
  'narrow NETWORKS candidate RPC exists');

select ok(
  not has_function_privilege('anon', 'public.create_guest_account(text,text,text)', 'EXECUTE')
  and has_function_privilege('authenticated', 'public.create_guest_account(text,text,text)', 'EXECUTE')
  and not has_function_privilege('service_role', 'public.create_guest_account(text,text,text)', 'EXECUTE'),
  'canonical create RPC has minimum explicit ACLs');
select ok(
  not has_function_privilege('anon', 'public.create_guest_accounts(jsonb)', 'EXECUTE')
  and has_function_privilege('authenticated', 'public.create_guest_accounts(jsonb)', 'EXECUTE')
  and not has_function_privilege('service_role', 'public.create_guest_accounts(jsonb)', 'EXECUTE'),
  'batch create RPC has minimum explicit ACLs');
select ok(
  not has_function_privilege('anon', 'public.admin_update_guest_contact(uuid,text,text,text,text,text)', 'EXECUTE')
  and has_function_privilege('authenticated', 'public.admin_update_guest_contact(uuid,text,text,text,text,text)', 'EXECUTE')
  and not has_function_privilege('service_role', 'public.admin_update_guest_contact(uuid,text,text,text,text,text)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.admin_update_guest_contact(uuid,text,text,text,text)', 'EXECUTE')
  and has_function_privilege('authenticated', 'public.admin_update_guest_contact(uuid,text,text,text,text)', 'EXECUTE')
  and not has_function_privilege('service_role', 'public.admin_update_guest_contact(uuid,text,text,text,text)', 'EXECUTE'),
  'ADMIN profile RPC has minimum explicit ACLs');
select ok(
  not has_function_privilege('anon', 'public.guest_accounts_list(text,integer,integer,text,boolean)', 'EXECUTE')
  and has_function_privilege('authenticated', 'public.guest_accounts_list(text,integer,integer,text,boolean)', 'EXECUTE')
  and not has_function_privilege('service_role', 'public.guest_accounts_list(text,integer,integer,text,boolean)', 'EXECUTE'),
  'canonical list RPC has minimum explicit ACLs');
select ok(
  not has_function_privilege('anon', 'public.guest_account_ledger_candidates(text,integer,integer,text)', 'EXECUTE')
  and has_function_privilege('authenticated', 'public.guest_account_ledger_candidates(text,integer,integer,text)', 'EXECUTE')
  and not has_function_privilege('service_role', 'public.guest_account_ledger_candidates(text,integer,integer,text)', 'EXECUTE'),
  'candidate RPC has minimum explicit ACLs');
select ok(
  (select p.prosecdef and p.proconfig @> array['search_path=""']
     from pg_proc p
    where p.oid = 'public.create_guest_account(text,text,text)'::regprocedure),
  'privileged create RPC is DEFINER with empty fixed search_path');

insert into public.startups(id, name)
values ('91100000-0000-0000-0000-000000000001', '독립 계정 테스트 기업');
insert into public.users(id, user_type, name, email, phone, company_id, session_version)
values
  ('91200000-0000-0000-0000-000000000001', 'super_admin', '독립 계정 관리자',
   'independent-admin@example.test', '01011112222',
   '91100000-0000-0000-0000-000000000001', 1),
  ('91200000-0000-0000-0000-000000000002', 'read_only', '독립 계정 담당자',
   'independent-staff@example.test', null, null, 1);

insert into public.networks(
  id, name, email, affiliation, category, country_tag_id, deleted_at, merged_into_id
)
select x.id::uuid, x.name, x.email, x.affiliation, x.category, c.id,
       x.deleted_at, x.merged_into_id::uuid
  from (values
    ('91600000-0000-0000-0000-000000000001', '동일 후보', 'expert-candidate@example.test', '후보 소속', 'experts', null::timestamptz, null::text),
    ('91600000-0000-0000-0000-000000000002', '미분류 후보', 'unset-candidate@example.test', '미분류 소속', null, null::timestamptz, null::text),
    ('91600000-0000-0000-0000-000000000003', '삭제 후보', 'deleted-candidate@example.test', '삭제 소속', 'experts', now(), null::text),
    ('91600000-0000-0000-0000-000000000004', '병합 후보', 'merged-candidate@example.test', '병합 소속', 'experts', null::timestamptz, '91600000-0000-0000-0000-000000000001')
  ) x(id, name, email, affiliation, category, deleted_at, merged_into_id)
  cross join lateral (
    select id from public.country_tags where deleted_at is null
     order by sort_order, name limit 1
  ) c;

select is(
  (select phone || ':' || company_id::text from public.users
    where id = '91200000-0000-0000-0000-000000000001'),
  '01011112222:91100000-0000-0000-0000-000000000001',
  'non-GUEST employee contact/company data remains supported');
select throws_ok(
  $$insert into public.users(user_type, name, email, affiliation, phone)
    values ('temporary_guest', '금지 전화', 'blocked-phone@example.test', '테스트', '01099998888')$$,
  '23514', null, 'users CHECK rejects a recurring GUEST phone');
select throws_ok(
  $$insert into public.users(user_type, name, email, affiliation, company_id)
    values ('external_startup', '금지 회사 FK', 'blocked-company@example.test', '테스트',
            '91100000-0000-0000-0000-000000000001')$$,
  '23514', null,
  'users CHECK rejects a recurring GUEST company relation without changing its role');
select lives_ok(
  $$insert into public.users(user_type, name, email, affiliation)
    values ('external_startup', 'Preserved role guest',
            'preserved-role@example.test', 'Independent affiliation')$$,
  'an existing GUEST authorization role remains valid when relation fields are empty');

set local role authenticated;
select set_config('request.jwt.claims',
  '{"app_user_id":"91200000-0000-0000-0000-000000000002","session_version":1}', true);
select lives_ok(
  $$select public.create_guest_account('독립 게스트', 'independent-guest@example.test', '독립 소속')$$,
  'internal user creates a three-field GUEST account');
select ok(
  (select u.user_type = 'temporary_guest' and u.name = '독립 게스트'
          and u.email = 'independent-guest@example.test' and u.affiliation = '독립 소속'
          and u.phone is null and u.company_id is null
     from public.users u where u.email = 'independent-guest@example.test'),
  'canonical create stores only name/email/affiliation and preserves the role');
reset role;
select ok(
  exists(select 1 from public.guest_credentials gc join public.users u on u.id = gc.user_id
         where u.email = 'independent-guest@example.test')
  and exists(select 1 from public.workspace_permissions wp join public.users u on u.id = wp.user_id
             where u.email = 'independent-guest@example.test' and wp.workspace_key = 'guest'),
  'credential and workspace bookkeeping are preserved');
set local role authenticated;
select lives_ok(
  $$select public.create_guest_account(
      '호환 게스트', 'legacy-wrapper@example.test', '01033334444',
      'startups', '91100000-0000-0000-0000-000000000001', '호환 소속')$$,
  'old six-argument creation call remains deploy-order compatible');
select ok(
  (select phone is null and company_id is null and user_type = 'temporary_guest'
     from public.users where email = 'legacy-wrapper@example.test'),
  'legacy create wrapper ignores phone/ledger values and does not derive a ledger role');
select set_config('request.jwt.claims',
  '{"app_user_id":"91200000-0000-0000-0000-000000000001","session_version":1}', true);
select is(
  (select string_agg(k, ',' order by k)
     from public.guest_account_ledger_candidates('expert-candidate', 10, 0, 'experts') r
     cross join lateral jsonb_object_keys(to_jsonb(r)) k),
  'affiliation,email,name,source_id,total_count',
  'candidate RPC returns only the narrow picker schema');
select is(
  (select source_id::text || ':' || total_count::text
     from public.guest_account_ledger_candidates('후보', 10, 0, 'experts')),
  '91600000-0000-0000-0000-000000000001:1',
  'candidate search/category excludes deleted and merged NETWORKS rows');

create temporary table independent_batch_result(payload jsonb not null);
grant select, insert on independent_batch_result to authenticated;
insert into independent_batch_result
select public.create_guest_accounts(jsonb_build_array(jsonb_build_object(
  'key', 'legacy-extra', 'name', '배치 독립 게스트',
  'email', 'independent-batch@example.test', 'affiliation', '배치 소속',
  'phone', '01055556666', 'master_table', 'startups',
  'master_id', '91100000-0000-0000-0000-000000000001')));
select is((select payload ->> 'created' from independent_batch_result), '1',
  'batch creation accepts rollout payloads with ignored legacy keys');
select ok(
  (select u.phone is null and u.company_id is null and u.user_type = 'temporary_guest'
     from public.users u where u.email = 'independent-batch@example.test')
  and not ((select payload -> 'rows' -> 0 from independent_batch_result)
           ?| array['phone','master_table','master_id']),
  'batch stores and returns no phone or ledger relation');

select set_config('request.jwt.claims', jsonb_build_object(
  'app_user_id', (select id from public.users where email = 'independent-guest@example.test'),
  'session_version', 1)::text, true);
select throws_ok(
  $$select public.create_guest_account('중첩 게스트', 'nested@example.test', '중첩 소속')$$,
  '42501', null, 'GUEST cannot create another GUEST account');
select throws_ok(
  $$select * from public.guest_account_ledger_candidates(null, 10, 0, null)$$,
  '42501', null, 'GUEST cannot browse internal NETWORKS candidates');

reset role;
insert into public.programs(id, code, title, created_by)
values ('91300000-0000-0000-0000-000000000001', 'INDEPENDENT', '독립 참여 사업',
        '91200000-0000-0000-0000-000000000001');
insert into public.program_participants(
  id, entity_key, program_id, user_id, master_table, master_id, login_status)
select '91400000-0000-0000-0000-000000000001', 'program',
       '91300000-0000-0000-0000-000000000001', u.id, null, null, 'ACTIVE'
  from public.users u where u.email = 'independent-guest@example.test';
select throws_ok(
  $$update public.program_participants
       set master_table = 'startups', master_id = '91100000-0000-0000-0000-000000000001'
     where id = '91400000-0000-0000-0000-000000000001'$$,
  '23514', null,
  'participant trigger rejects a recurring ledger key on a GUEST participation');
insert into public.program_participant_entries(
  entity_key, program_id, master_table, master_id
) values (
  'program', '91300000-0000-0000-0000-000000000001',
  'startups', '91100000-0000-0000-0000-000000000001'
);
select lives_ok(
  $$insert into public.program_participants(
      id, entity_key, program_id, user_id, master_table, master_id)
    values ('91400000-0000-0000-0000-000000000002', 'program',
      '91300000-0000-0000-0000-000000000001', null,
      'startups', '91100000-0000-0000-0000-000000000001')$$,
  'legacy non-account/business participant row is not blocked');
select ok(to_regclass('public.program_participant_entries') is not null,
  'business roster SSOT remains present');

insert into public.guest_invitations(
  id, business_code, name, email, phone, company_id, app_user_id,
  target_type, target_id, participant_id, otp_hash, password_hash)
select '91500000-0000-0000-0000-000000000001', 'INDEPENDENT',
       '복사 이름', 'copy@example.test', '01077778888',
       '91100000-0000-0000-0000-000000000001', u.id,
       'startup', '91100000-0000-0000-0000-000000000001',
       '91400000-0000-0000-0000-000000000001', 'otp-copy', 'password-copy'
  from public.users u where u.email = 'independent-guest@example.test';
select ok(
  (select name is null and email is null and phone is null and company_id is null
          and target_type is null and target_id is null
          and otp_hash is null and password_hash is null
          and app_user_id is not null and participant_id is not null
     from public.guest_invitations
    where id = '91500000-0000-0000-0000-000000000001'),
  'invitation trigger removes copies and keeps bookkeeping');

update public.guest_credentials set password_hash = 'preserved-password-hash'
 where user_id = (select id from public.users where email = 'independent-guest@example.test');
set local role authenticated;
select set_config('request.jwt.claims',
  '{"app_user_id":"91200000-0000-0000-0000-000000000001","session_version":1}', true);
create temporary table independent_admin_result(payload jsonb not null);
grant select, insert on independent_admin_result to authenticated;
insert into independent_admin_result
select public.admin_update_guest_contact(
  p_user_id => (select id from public.users where email = 'independent-guest@example.test'),
  p_name => '독립 게스트 수정', p_email => 'independent-guest@example.test',
  p_affiliation => '독립 소속 수정', p_reason => '프로필 계약 검증');
select ok(
  (select (payload ->> 'name_changed')::boolean
          and (payload ->> 'affiliation_changed')::boolean
          and not (payload ->> 'email_changed')::boolean
          and (payload ->> 'session_version')::integer = 1
          and payload -> 'applied' = jsonb_build_object(
            'name', '독립 게스트 수정', 'email', 'independent-guest@example.test',
            'affiliation', '독립 소속 수정')
     from independent_admin_result),
  'name/affiliation edit returns applied profile without a session bump');
reset role;
select ok(
  (select password_hash = 'preserved-password-hash' from public.guest_credentials
    where user_id = (select id from public.users where email = 'independent-guest@example.test'))
  and exists(select 1 from public.program_participants pp join public.users u on u.id = pp.user_id
             where pp.id = '91400000-0000-0000-0000-000000000001'
               and u.email = 'independent-guest@example.test')
  and exists(select 1 from public.guest_invitations gi
             where gi.id = '91500000-0000-0000-0000-000000000001'),
  'profile edit preserves password hash, participation and invitation bookkeeping');
set local role authenticated;
select lives_ok(
  $$select public.admin_update_guest_contact(
      p_user_id => (select id from public.users where email = 'legacy-wrapper@example.test'),
      p_email => 'legacy-wrapper@example.test', p_phone => '01000000000',
      p_affiliation => 'Required affiliation', p_reason => 'Required profile check')$$,
  'legacy five-key named call resolves to its exact overload');
select is(
  (select name from public.users where email = 'legacy-wrapper@example.test'),
  '호환 게스트',
  'legacy overload preserves the current required name');
select throws_ok(
  $$select public.admin_update_guest_contact(
      p_user_id => (select id from public.users where email = 'legacy-wrapper@example.test'),
      p_name => 'Required name', p_email => 'legacy-wrapper@example.test',
      p_affiliation => '   ', p_reason => 'Required affiliation check')$$,
  '22023', 'Affiliation is required.',
  'ADMIN edit rejects a blank affiliation');
select lives_ok(
  $$select public.admin_update_guest_contact(
      p_user_id => (select id from public.users where email = 'legacy-wrapper@example.test'),
      p_name => 'Legacy rollout guest',
      p_email => 'legacy-wrapper@example.test', p_phone => '01000000000',
      p_affiliation => '호환 소속', p_reason => '구형 호출 호환 검증')$$,
  'rollout p_phone is accepted only with the full required profile');
select is((select phone from public.users where email = 'legacy-wrapper@example.test'),
  null, 'old ADMIN p_phone cannot restore a GUEST phone');

select is(
  (select string_agg(k, ',' order by k)
     from public.guest_accounts_list('독립 게스트 수정', 50, 0, null, false) r
     cross join lateral jsonb_object_keys(to_jsonb(r)) k),
  'affiliation,created_at,email,has_password,is_active,last_login_at,name,open_count,program_count,programs,total_count,user_id,user_type',
  'list response exposes exactly the relation-free schema');
select ok(
  (select not (programs::text ilike '%master_table%')
          and not (programs::text ilike '%master_id%')
     from public.guest_accounts_list('독립 게스트 수정', 50, 0, null, false)),
  'participation JSON contains no ledger key');
select ok(
  (select count(*) = 0 from app.merge_ref_tables('startups')
    where rel_name in ('guest_identities', 'program_participants')),
  'ledger merge inventory excludes GUEST account/access tables');
select is(
  (select count(*)::integer
     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname in ('app', 'public') and p.prokind = 'f'
      and p.prosrc ilike '%guest_identities%'),
  0, 'no live function body references guest_identities');

select * from finish();
rollback;
