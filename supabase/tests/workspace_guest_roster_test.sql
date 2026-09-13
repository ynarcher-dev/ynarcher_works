-- =====================================================================
-- 워크스페이스 GUEST 명부 — public.add_program_guest_accounts 와 그 이웃들
--
-- 확인하는 것:
--   · 허용: PROJECT·M&A·FUND 담당자가 기존 계정을 자기 사업 명부에 담는다
--   · 거절: 비담당 내부 사용자 · GUEST · 미인증 · 원장 키와 id의 짝 불일치
--   · 기밀: 보이지 않는 M&A 딜의 게스트는 담을 수도 검색할 수도 없고,
--           "없다"와 "권한이 없다"를 갈라 답하지 않는다
--   · 멱등: 같은 계정을 다시 담으면 ALREADY_PRESENT이고 기존 줄(원장 연결 포함)은 그대로다
--   · 개방: 원장 연결이 없는 줄도 열리지만 **계정은 만들어지지 않는다**
--   · 빼기: 계정·다른 사업 줄·참가 명부·인격이 남고 목록의 건수만 줄어든다
--   · 부작용 없음: users · guest_identities · program_participant_entries에 쓰지 않는다
-- =====================================================================

begin;
select plan(46);

-- ---------------------------------------------------------------------
-- 셋업 — 내부 사용자 여섯, 게스트 넷, 원장 다섯
-- ---------------------------------------------------------------------
insert into public.users (id, user_type, name, email, session_version) values
  ('99100000-0000-0000-0000-000000000001', 'read_only',   '사업 담당자',    null, 1),
  ('99100000-0000-0000-0000-000000000002', 'read_only',   'M&A 담당자',     null, 1),
  ('99100000-0000-0000-0000-000000000003', 'read_only',   '조합 운용역',    null, 1),
  ('99100000-0000-0000-0000-000000000004', 'read_only',   '비담당 내부',    null, 1),
  ('99100000-0000-0000-0000-000000000006', 'read_only',   '숨은 딜 담당자', null, 1),
  ('99100000-0000-0000-0000-000000000009', 'super_admin', '시스템 관리자',  null, 1);

insert into public.workspace_permissions
  (user_id, workspace_key, permission_level, scope_type)
values
  ('99100000-0000-0000-0000-000000000001', 'project', 'write', 'global'),
  ('99100000-0000-0000-0000-000000000002', 'mna',     'write', 'global'),
  ('99100000-0000-0000-0000-000000000003', 'fund',    'write', 'global'),
  ('99100000-0000-0000-0000-000000000004', 'project', 'write', 'global'),
  ('99100000-0000-0000-0000-000000000006', 'mna',     'write', 'global');

insert into public.users (id, user_type, name, email, phone, session_version) values
  ('99200000-0000-0000-0000-000000000001', 'temporary_guest',  '담을 게스트',
   'roster-add-1@example.test', '01051000001', 1),
  ('99200000-0000-0000-0000-000000000002', 'temporary_guest',  '숨은 딜 게스트',
   'roster-add-2@example.test', '01051000002', 1),
  ('99200000-0000-0000-0000-000000000004', 'temporary_guest',  '중복 요청 게스트',
   'roster-add-4@example.test', '01051000004', 1),
  ('99200000-0000-0000-0000-000000000005', 'temporary_guest',  'M&A 명부 게스트',
   'roster-add-5@example.test', '01051000005', 1),
  ('99200000-0000-0000-0000-000000000006', 'temporary_guest',  '조합 명부 게스트',
   'roster-add-6@example.test', '01051000006', 1);

insert into public.startups (id, name, representative, email, phone)
values ('99600000-0000-0000-0000-000000000001', '명부 원장 기업', '원장 대표',
        'roster-ledger@example.test', '01051000009');

insert into public.users (id, user_type, name, email, phone, company_id, session_version)
values ('99200000-0000-0000-0000-000000000003', 'external_startup', '원장 연결 게스트',
        'roster-add-3@example.test', '01051000003',
        '99600000-0000-0000-0000-000000000001', 1);

insert into public.guest_identities (master_table, master_id, user_id)
values ('startups', '99600000-0000-0000-0000-000000000001',
        '99200000-0000-0000-0000-000000000003');

-- M&A 워크스페이스 권한만으로는 보이면 안 되는 딜 당사자 인격. 담당자 6만 생성자이고,
-- 담당자 2는 같은 M&A 워크스페이스 사용자지만 이 당사자의 열람자는 아니다.
insert into public.ma_sellers (id, name, created_by)
values ('99600000-0000-0000-0000-000000000002', '비공개 매각 기업',
        '99100000-0000-0000-0000-000000000006');
insert into public.guest_identities (master_table, master_id, user_id)
values ('ma_sellers', '99600000-0000-0000-0000-000000000002',
        '99200000-0000-0000-0000-000000000002');

insert into public.programs (id, title) values
  ('99300000-0000-0000-0000-000000000001', '명부 사업');
insert into public.ma_programs (id, title, created_by) values
  ('99400000-0000-0000-0000-000000000001', '보이는 딜',
   '99100000-0000-0000-0000-000000000002'),
  ('99400000-0000-0000-0000-000000000002', '숨은 딜',
   '99100000-0000-0000-0000-000000000006');
insert into public.funds (id, name) values
  ('99500000-0000-0000-0000-000000000001', '명부 조합');

insert into public.program_managers
  (program_id, user_id, role, allocation_rate, start_date, end_date)
values
  ('99300000-0000-0000-0000-000000000001', '99100000-0000-0000-0000-000000000001',
   'PM', 100, current_date, current_date + 365);

insert into public.ma_program_managers
  (program_id, user_id, role, allocation_rate, start_date, end_date)
values
  ('99400000-0000-0000-0000-000000000001', '99100000-0000-0000-0000-000000000002',
   'PM', 100, current_date, current_date + 365),
  ('99400000-0000-0000-0000-000000000002', '99100000-0000-0000-0000-000000000006',
   'PM', 100, current_date, current_date + 365);

insert into public.fund_managers (fund_id, user_id, is_lead) values
  ('99500000-0000-0000-0000-000000000001', '99100000-0000-0000-0000-000000000003', true);

-- 숨은 딜의 참가 줄. 이 줄이 보이는 사람은 숨은 딜 담당자뿐이어야 한다.
insert into public.program_participants
  (id, entity_key, program_id, user_id, master_table, master_id)
values
  ('99700000-0000-0000-0000-000000000002', 'ma_program',
   '99400000-0000-0000-0000-000000000002', '99200000-0000-0000-0000-000000000002', null, null);

-- 원장 연결 줄(참가 명부 + 인격 + GUEST 연결). 담기를 다시 눌러도 이 줄은 그대로여야 한다.
insert into public.program_participant_entries
  (entity_key, program_id, master_table, master_id)
values
  ('program', '99300000-0000-0000-0000-000000000001',
   'startups', '99600000-0000-0000-0000-000000000001');

insert into public.program_participants
  (id, entity_key, program_id, user_id, master_table, master_id)
values
  ('99700000-0000-0000-0000-000000000003', 'program',
   '99300000-0000-0000-0000-000000000001', '99200000-0000-0000-0000-000000000003',
   'startups', '99600000-0000-0000-0000-000000000001');

-- 계정이 붙지 않은 옛 줄. 개방은 이 줄을 거절해야 한다(계정을 만들어 메우지 않는다).
insert into public.program_participants
  (id, entity_key, program_id, user_id, master_table, master_id)
values
  ('99700000-0000-0000-0000-000000000009', 'program',
   '99300000-0000-0000-0000-000000000001', null, null, null);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"app_user_id":"99100000-0000-0000-0000-000000000001","session_version":1}',
  true
);

-- ---------------------------------------------------------------------
-- (1) 허용 — 사업 담당자가 기존 계정을 명부에 담는다
-- ---------------------------------------------------------------------
select is(
  (select string_agg(t.status || ':' || coalesce(t.reason, ''), ',' order by t.ord)
     from public.add_program_guest_accounts(
            'program', '99300000-0000-0000-0000-000000000001',
            array['99200000-0000-0000-0000-000000000001'::uuid])
          with ordinality as t(user_id, status, reason, ord)),
  'ADDED:',
  '사업 담당자는 기존 GUEST 계정을 명부에 담는다'
);

select ok(
  exists (
    select 1 from public.program_participants pp
     where pp.entity_key = 'program'
       and pp.program_id = '99300000-0000-0000-0000-000000000001'
       and pp.user_id    = '99200000-0000-0000-0000-000000000001'
       and pp.master_table is null
       and pp.master_id    is null
       and pp.login_status = 'NOT_ALLOWED'
       and pp.created_by   = '99100000-0000-0000-0000-000000000001'
  ),
  '담긴 줄은 원장 참조가 없고 문은 닫힌 채이며 담은 사람이 찍혀 있다'
);

select is(
  (select string_agg(t.status || ':' || coalesce(t.reason, ''), ',' order by t.ord)
     from public.add_program_guest_accounts(
            'program', '99300000-0000-0000-0000-000000000001',
            array['99200000-0000-0000-0000-000000000001'::uuid])
          with ordinality as t(user_id, status, reason, ord)),
  'ALREADY_PRESENT:',
  '같은 계정을 다시 담으면 ALREADY_PRESENT다'
);

select is(
  (select count(*)::int from public.program_participants pp
    where pp.entity_key = 'program'
      and pp.program_id = '99300000-0000-0000-0000-000000000001'
      and pp.user_id    = '99200000-0000-0000-0000-000000000001'),
  1,
  '다시 담아도 줄은 하나뿐이다'
);

select is(
  (select string_agg(t.status || ':' || coalesce(t.reason, ''), ',' order by t.ord)
     from public.add_program_guest_accounts(
            'program', '99300000-0000-0000-0000-000000000001',
            array['99200000-0000-0000-0000-000000000004'::uuid,
                  '99200000-0000-0000-0000-000000000004'::uuid])
          with ordinality as t(user_id, status, reason, ord)),
  'ADDED:,ALREADY_PRESENT:DUPLICATE_IN_REQUEST',
  '한 요청에 같은 계정이 두 번 오면 둘째는 사유와 함께 ALREADY_PRESENT다'
);

select is(
  (select count(*)::int from public.program_participants pp
    where pp.entity_key = 'program'
      and pp.program_id = '99300000-0000-0000-0000-000000000001'
      and pp.user_id    = '99200000-0000-0000-0000-000000000004'),
  1,
  '요청 안 중복은 줄을 둘로 만들지 않는다'
);

-- RPC를 비켜 직접 쓰더라도 숨은 계정이 새 줄을 근거로 보이게 만들 수 없다.
select throws_ok(
  $$insert into public.program_participants
      (id, entity_key, program_id, user_id, master_table, master_id)
    values
      ('99700000-0000-0000-0000-000000000008', 'program',
       '99300000-0000-0000-0000-000000000001',
       '99200000-0000-0000-0000-000000000002', null, null)$$,
  '42501', null,
  '직접 INSERT도 보이지 않는 GUEST 계정 배정을 막는다'
);

select throws_ok(
  $$update public.program_participants
       set user_id = '99200000-0000-0000-0000-000000000002'
     where id = '99700000-0000-0000-0000-000000000009'$$,
  '42501', null,
  '직접 UPDATE도 보이지 않는 GUEST 계정 배정을 막는다'
);

-- ---------------------------------------------------------------------
-- (2) 허용 — M&A 딜 담당자와 조합 운용역도 같은 경로를 쓴다
-- ---------------------------------------------------------------------
select set_config(
  'request.jwt.claims',
  '{"app_user_id":"99100000-0000-0000-0000-000000000002","session_version":1}',
  true
);
select is(
  (select string_agg(t.status || ':' || coalesce(t.reason, ''), ',' order by t.ord)
     from public.add_program_guest_accounts(
            'ma_program', '99400000-0000-0000-0000-000000000001',
            array['99200000-0000-0000-0000-000000000005'::uuid])
          with ordinality as t(user_id, status, reason, ord)),
  'ADDED:',
  'M&A 딜 담당자는 자기 딜 명부에 계정을 담는다'
);

select is(
  (select string_agg(o.account_is_new::text, ',')
     from public.open_program_guest_access(
            array(select pp.id from public.program_participants pp
                   where pp.entity_key = 'ma_program'
                     and pp.program_id = '99400000-0000-0000-0000-000000000001'
                     and pp.user_id = '99200000-0000-0000-0000-000000000005')) o),
  'false',
  'M&A 권한만 가진 딜 담당자도 원장 미연결 계정의 로그인을 연다'
);

select is(
  (select pp.login_status::text from public.program_participants pp
    where pp.entity_key = 'ma_program'
      and pp.program_id = '99400000-0000-0000-0000-000000000001'
      and pp.user_id = '99200000-0000-0000-0000-000000000005'),
  'INVITED',
  'M&A 개방 결과는 명부에 INVITED로 남는다'
);

-- 보이지 않는 딜의 게스트는 담을 수 없다. 사유는 다른 실패와 같은 한 값이라
-- "그 계정이 있긴 하다"는 사실조차 되짚을 수 없다.
select is(
  (select string_agg(t.status || ':' || coalesce(t.reason, ''), ',' order by t.ord)
     from public.add_program_guest_accounts(
            'ma_program', '99400000-0000-0000-0000-000000000001',
            array['99200000-0000-0000-0000-000000000002'::uuid])
          with ordinality as t(user_id, status, reason, ord)),
  'FAILED:ACCOUNT_NOT_AVAILABLE',
  '보이지 않는 M&A 딜의 게스트는 담기지 않는다'
);

select is(
  (select count(*)::int
     from public.guest_accounts_list('숨은 딜 게스트', 50, 0, null, null, false)),
  0,
  '보이지 않는 딜의 게스트는 계정 검색에도 나오지 않는다'
);

select is(
  (select count(*)::int
     from public.guest_accounts_list(
       '숨은 딜 게스트', 50, 0, null, null, false, 'unlinked')),
  0,
  '숨은 SELLER 인격이 있는 계정을 미연결로 오인해 노출하지 않는다'
);

select is(
  (select count(*)::int from public.guest_identities gi
    where gi.user_id = '99200000-0000-0000-0000-000000000002'
      and gi.master_table = 'ma_sellers'),
  0,
  'M&A 워크스페이스 권한만으로 비공개 SELLER 인격을 직접 읽을 수 없다'
);

select is(
  (select count(*)::int
     from public.guest_accounts_list(
       '숨은 딜 게스트', 50, 0, null, array['ma_sellers'], false)),
  0,
  '인격 필터로도 비공개 SELLER 계정의 존재를 탐색할 수 없다'
);

select set_config(
  'request.jwt.claims',
  '{"app_user_id":"99100000-0000-0000-0000-000000000006","session_version":1}',
  true
);
select is(
  (select count(*)::int
     from public.guest_accounts_list('숨은 딜 게스트', 50, 0, null, null, false)),
  1,
  '그 딜의 담당자에게는 같은 계정이 보인다'
);

select set_config(
  'request.jwt.claims',
  '{"app_user_id":"99100000-0000-0000-0000-000000000003","session_version":1}',
  true
);
select is(
  (select string_agg(t.status || ':' || coalesce(t.reason, ''), ',' order by t.ord)
     from public.add_program_guest_accounts(
            'fund', '99500000-0000-0000-0000-000000000001',
            array['99200000-0000-0000-0000-000000000006'::uuid])
          with ordinality as t(user_id, status, reason, ord)),
  'ADDED:',
  '조합 운용역은 조합 명부에 계정을 담는다'
);

select is(
  (select string_agg(o.account_is_new::text, ',')
     from public.open_program_guest_access(
            array(select pp.id from public.program_participants pp
                   where pp.entity_key = 'fund'
                     and pp.program_id = '99500000-0000-0000-0000-000000000001'
                     and pp.user_id = '99200000-0000-0000-0000-000000000006')) o),
  'false',
  'FUND 권한만 가진 운용역도 원장 미연결 계정의 로그인을 연다'
);

select is(
  (select pp.login_status::text from public.program_participants pp
    where pp.entity_key = 'fund'
      and pp.program_id = '99500000-0000-0000-0000-000000000001'
      and pp.user_id = '99200000-0000-0000-0000-000000000006'),
  'INVITED',
  'FUND 개방 결과는 명부에 INVITED로 남는다'
);

-- ---------------------------------------------------------------------
-- (3) 거절 경로
-- ---------------------------------------------------------------------
select set_config(
  'request.jwt.claims',
  '{"app_user_id":"99100000-0000-0000-0000-000000000004","session_version":1}',
  true
);
select throws_ok(
  $$select * from public.add_program_guest_accounts(
      'program', '99300000-0000-0000-0000-000000000001',
      array['99200000-0000-0000-0000-000000000001'::uuid])$$,
  '42501', null,
  '워크스페이스 쓰기 권한만 있는 비담당자는 남의 명부를 고칠 수 없다'
);

select set_config(
  'request.jwt.claims',
  '{"app_user_id":"99200000-0000-0000-0000-000000000001","session_version":1}',
  true
);
select throws_ok(
  $$select * from public.add_program_guest_accounts(
      'program', '99300000-0000-0000-0000-000000000001',
      array['99200000-0000-0000-0000-000000000004'::uuid])$$,
  '42501', null,
  'GUEST는 명부에 계정을 담을 수 없다'
);

select set_config('request.jwt.claims', '{}', true);
select throws_ok(
  $$select * from public.add_program_guest_accounts(
      'program', '99300000-0000-0000-0000-000000000001',
      array['99200000-0000-0000-0000-000000000004'::uuid])$$,
  '42501', null,
  '미인증 호출은 명부에 계정을 담을 수 없다'
);

select set_config(
  'request.jwt.claims',
  '{"app_user_id":"99100000-0000-0000-0000-000000000001","session_version":1}',
  true
);
select throws_ok(
  $$select * from public.add_program_guest_accounts(
      'ma_program', '99300000-0000-0000-0000-000000000001',
      array['99200000-0000-0000-0000-000000000001'::uuid])$$,
  '22023', null,
  '원장 키와 사업 id의 짝이 맞지 않으면 거절한다'
);

select throws_ok(
  $$select * from public.add_program_guest_accounts(
      'startups', '99300000-0000-0000-0000-000000000001',
      array['99200000-0000-0000-0000-000000000001'::uuid])$$,
  '22023', null,
  '사업 원장이 아닌 키는 거절한다'
);

-- 담당자 판정이 실재 확인보다 먼저다 — 볼 수 없는 딜은 "없다"가 아니라 "권한 없다"로 막힌다.
select throws_ok(
  $$select * from public.add_program_guest_accounts(
      'ma_program', '99400000-0000-0000-0000-000000000002',
      array['99200000-0000-0000-0000-000000000001'::uuid])$$,
  '42501', null,
  '담당자가 아닌 M&A 딜은 실재 여부를 답하지 않고 권한으로 막는다'
);

-- ---------------------------------------------------------------------
-- (4) 원장 연결 줄은 그대로 둔다
-- ---------------------------------------------------------------------
select is(
  (select string_agg(t.status || ':' || coalesce(t.reason, ''), ',' order by t.ord)
     from public.add_program_guest_accounts(
            'program', '99300000-0000-0000-0000-000000000001',
            array['99200000-0000-0000-0000-000000000003'::uuid])
          with ordinality as t(user_id, status, reason, ord)),
  'ALREADY_PRESENT:',
  '이미 원장 연결로 담긴 계정은 다시 담기지 않는다'
);

select ok(
  exists (
    select 1 from public.program_participants pp
     where pp.id = '99700000-0000-0000-0000-000000000003'
       and pp.master_table = 'startups'
       and pp.master_id    = '99600000-0000-0000-0000-000000000001'
  )
  and (select count(*)::int from public.program_participants pp
        where pp.entity_key = 'program'
          and pp.program_id = '99300000-0000-0000-0000-000000000001'
          and pp.user_id    = '99200000-0000-0000-0000-000000000003') = 1,
  '기존 원장 연결 줄의 인격은 지워지지 않고 줄이 늘지도 않는다'
);

-- ---------------------------------------------------------------------
-- (5) 개방 — 원장 연결이 없는 줄도 열리고, 계정은 만들어지지 않는다
-- ---------------------------------------------------------------------
select is(
  (select string_agg(o.account_is_new::text, ',')
     from public.open_program_guest_access(
            array(select pp.id from public.program_participants pp
                   where pp.entity_key = 'program'
                     and pp.program_id = '99300000-0000-0000-0000-000000000001'
                     and pp.user_id    = '99200000-0000-0000-0000-000000000001')) o),
  'false',
  '원장 연결이 없는 줄도 열리며 계정을 새로 만들지 않았다고 답한다'
);

select is(
  (select pp.login_status::text from public.program_participants pp
    where pp.entity_key = 'program'
      and pp.program_id = '99300000-0000-0000-0000-000000000001'
      and pp.user_id    = '99200000-0000-0000-0000-000000000001'),
  'INVITED',
  '개방은 그 줄의 문을 INVITED로 연다'
);

select is(
  (select count(*)::int from public.guest_invitations gi
    where gi.app_user_id = '99200000-0000-0000-0000-000000000001'),
  1,
  '개방은 그 줄에 초대 레코드 한 건을 남긴다'
);

select throws_ok(
  $$select * from public.open_program_guest_access(
      array['99700000-0000-0000-0000-000000000009'::uuid])$$,
  '22023', null,
  '계정이 붙지 않은 줄은 열리지 않는다(개방이 계정을 만들지 않는다)'
);

-- ---------------------------------------------------------------------
-- (6) 빼기 — 계정·다른 사업 줄·참가 명부·인격은 남는다
-- ---------------------------------------------------------------------
select is(
  public.remove_program_participants(
    array(select pp.id from public.program_participants pp
           where pp.entity_key = 'program'
             and pp.program_id = '99300000-0000-0000-0000-000000000001'
             and pp.user_id    = '99200000-0000-0000-0000-000000000001'),
    '테스트 정리'),
  1,
  '담당자는 담은 줄을 다시 뺄 수 있다'
);

select is(
  public.remove_program_participants(
    array['99700000-0000-0000-0000-000000000003'::uuid], '테스트 정리'),
  1,
  '원장 연결 줄도 같은 경로로 뺀다'
);

-- 보존 여부는 현재 담당자가 그 인격을 볼 수 있는지와 다른 사실이다. RLS 때문에 숨은 것을
-- 삭제로 오인하지 않도록 DB 정본에서 확인한다.
reset role;
select ok(
  exists (select 1 from public.program_participant_entries e
           where e.entity_key = 'program'
             and e.program_id = '99300000-0000-0000-0000-000000000001'
             and e.master_id  = '99600000-0000-0000-0000-000000000001'
             and e.deleted_at is null)
  and exists (select 1 from public.guest_identities gi
               where gi.user_id = '99200000-0000-0000-0000-000000000003'),
  '빼기는 참가 명부 행과 인격을 지우지 않는다'
);

-- 목록의 건수는 추정이 아니라 실제 명부를 읽으므로, 뺀 즉시 줄어든다.
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"app_user_id":"99100000-0000-0000-0000-000000000009","session_version":1}',
  true
);
select is(
  (select l.program_count
     from public.guest_accounts_list('담을 게스트', 50, 0, null, null, false) l),
  0,
  '사업에서 뺀 뒤 그 계정의 실제 참여가 없으면 0건으로 센다'
);

select is(
  (select l.program_count
     from public.guest_accounts_list('원장 연결 게스트', 50, 0, null, null, false) l),
  0,
  '마지막 줄까지 빠진 계정은 참여 0건으로 나온다(참가 명부가 남아 있어도 추정하지 않는다)'
);

select is(
  (select count(*)::int
     from public.guest_accounts_list('01051000001', 50, 0, null, null, false)),
  1,
  '검색은 연락처(숫자만)로도 계정을 찾는다'
);

-- ---------------------------------------------------------------------
-- (7) 권한 — 문이 authenticated에만 열려 있는가
-- ---------------------------------------------------------------------
select ok(
  not has_function_privilege('anon', 'public.add_program_guest_accounts(text,uuid,uuid[])', 'EXECUTE')
  and has_function_privilege('authenticated', 'public.add_program_guest_accounts(text,uuid,uuid[])', 'EXECUTE')
  and not has_function_privilege('anon', 'app.guest_account_visible(uuid)', 'EXECUTE')
  and has_function_privilege('authenticated', 'app.guest_account_visible(uuid)', 'EXECUTE')
  and not has_function_privilege('anon', 'app.guest_account_visible_for_assignment(uuid,uuid)', 'EXECUTE')
  and has_function_privilege('authenticated', 'app.guest_account_visible_for_assignment(uuid,uuid)', 'EXECUTE')
  and not has_function_privilege('anon', 'app.guest_account_has_other_participation(uuid,uuid)', 'EXECUTE')
  and has_function_privilege('authenticated', 'app.guest_account_has_other_participation(uuid,uuid)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.open_program_guest_access(uuid[])', 'EXECUTE'),
  '신규 RPC와 헬퍼는 authenticated에만 열리고 anon에는 닫혀 있다'
);

select ok(
  not exists (
    select 1 from pg_policy p
     where p.polrelid = 'public.program_participants'::regclass
       and p.polcmd = 'd'
  ),
  '명부에는 DELETE 정책이 없다(물리 삭제는 자체 인가하는 RPC만 연다)'
);

-- ---------------------------------------------------------------------
-- (8) 부작용 없음 — RLS 밖에서 센다
-- ---------------------------------------------------------------------
reset role;

select is(
  (select count(*)::int from public.users u
    where app.is_guest_user_type(u.user_type)
      and u.email like 'roster-add-%@example.test'),
  6,
  '명부 작업은 GUEST 계정을 만들지도 지우지도 않는다'
);

select is(
  (select count(*)::int from public.guest_identities gi
    where gi.master_id = '99600000-0000-0000-0000-000000000001'),
  1,
  '명부 작업은 인격(guest_identities)을 만들지 않는다'
);

select is(
  (select count(*)::int from public.program_participant_entries e
    where e.program_id = '99300000-0000-0000-0000-000000000001'),
  1,
  '명부 작업은 참가 명부(program_participant_entries)에 쓰지 않는다'
);

select is(
  (select count(*)::int from public.program_participants pp
    where pp.entity_key = 'ma_program'
      and pp.program_id = '99400000-0000-0000-0000-000000000001'
      and pp.user_id    = '99200000-0000-0000-0000-000000000002'),
  0,
  '거절된 숨은 딜 게스트는 줄을 남기지 않는다'
);

select is(
  (select count(*)::int from public.audit_logs a
    where a.action = 'GUEST_ROSTER_ADD'
      and a.after_data ->> 'source' = 'workspace_guest_menu'),
  4,
  '실제로 담은 네 건만 감사 로그에 남는다(ALREADY_PRESENT·FAILED는 남기지 않는다)'
);

select is(
  (select count(*)::int from public.audit_logs a
    where a.action = 'GUEST_ACCESS_REMOVE'),
  2,
  '뺀 두 줄은 종전 그대로 GUEST_ACCESS_REMOVE로 남는다'
);

select * from finish();
rollback;
