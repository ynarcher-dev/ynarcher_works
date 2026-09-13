-- ADMIN GUEST 연락처 수정·비밀번호 초기화(20260913130000).
--
-- 허용 한 쌍과 거절 한 쌍을 함께 본다: 누가 부를 수 있는가(ADMIN만), 무엇을 대상으로
-- 할 수 있는가(GUEST 계정만), 무엇을 고치는가(users만 — 원장은 그대로), 무엇이 함께
-- 일어나는가(감사 로그 변경 전/후 · 세션 판 상승 · is_active 유지 · 자격증명 비우기).
begin;
select plan(58);

-- ── 원장 ────────────────────────────────────────────────────────────────
insert into public.users (id, user_type, name, email, phone, session_version) values
  ('97100000-0000-0000-0000-000000000001', 'read_only',   '일반 사용자',  'staff@example.test', '01030000001', 1),
  ('97100000-0000-0000-0000-000000000002', 'super_admin', '시스템 관리자', 'admin@example.test', '01030000002', 1);

insert into public.startups (id, name, representative, email, phone)
values (
  '97200000-0000-0000-0000-000000000001',
  '연락처 수정 원장기업', '원장 대표', 'ledger@example.test', '01031000001'
);

-- 대상 GUEST 계정(원장 인격 연결) + 비밀번호가 서 있는 상태.
insert into public.users (id, user_type, name, email, phone, session_version)
values ('97300000-0000-0000-0000-000000000001', 'external_startup', '원장 대표',
        'guest-target@example.test', '01031000001', 3);
insert into public.guest_identities (user_id, master_table, master_id)
values ('97300000-0000-0000-0000-000000000001', 'startups',
        '97200000-0000-0000-0000-000000000001');
insert into public.guest_credentials
  (user_id, password_hash, password_set_at, login_attempts, locked_until,
   reset_token_hash, reset_expires_at)
values ('97300000-0000-0000-0000-000000000001', 'pbkdf2$sha256$1$c2FsdA==$aGFzaA==',
        now() - interval '1 day', 4, now() + interval '10 minutes',
        'deadbeef', now() + interval '20 minutes');

-- 정지된 GUEST 계정 — 중복 판정이 정지 계정까지 보는지 확인하는 상대.
insert into public.users (id, user_type, name, email, phone, is_active, session_version)
values ('97300000-0000-0000-0000-000000000002', 'temporary_guest', '정지된 게스트',
        'suspended-guest@example.test', '01031000002', false, 1);

-- 연락처가 없는 GUEST 계정 — 초기화가 로그인 불가 계정을 만들지 않는지 확인하는 상대.
insert into public.users (id, user_type, name, email, phone, session_version)
values ('97300000-0000-0000-0000-000000000003', 'temporary_guest', '연락처 없는 게스트',
        'nophone-guest@example.test', null, 1);

-- ── 거절: 권한 ──────────────────────────────────────────────────────────
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"app_user_id":"97100000-0000-0000-0000-000000000001","session_version":1}',
  true
);

select throws_ok(
  $$select public.admin_update_guest_contact(
      '97300000-0000-0000-0000-000000000001',
      'moved@example.test', '01031009999', '연락처 변경 요청'
    )$$,
  '42501', null,
  '일반 내부 사용자는 GUEST 연락처를 수정할 수 없다'
);

select throws_ok(
  $$select public.admin_reset_guest_password(
      '97300000-0000-0000-0000-000000000001', '본인 요청'
    )$$,
  '42501', null,
  '일반 내부 사용자는 GUEST 비밀번호를 초기화할 수 없다'
);

select set_config(
  'request.jwt.claims',
  '{"app_user_id":"97300000-0000-0000-0000-000000000001","session_version":3}',
  true
);
select throws_ok(
  $$select public.admin_update_guest_contact(
      '97300000-0000-0000-0000-000000000001',
      'self@example.test', '01031009999', '내가 내 걸 고친다'
    )$$,
  '42501', null,
  'GUEST 본인도 자기 연락처를 이 창구로 고칠 수 없다'
);
select throws_ok(
  $$select public.admin_reset_guest_password(
      '97300000-0000-0000-0000-000000000001', '내가 내 걸 초기화한다'
    )$$,
  '42501', null,
  'GUEST 본인도 이 창구로 초기화할 수 없다'
);

-- ── ADMIN 세션 ──────────────────────────────────────────────────────────
select set_config(
  'request.jwt.claims',
  '{"app_user_id":"97100000-0000-0000-0000-000000000002","session_version":1}',
  true
);

-- ── 거절: 입력 ──────────────────────────────────────────────────────────
select throws_ok(
  $$select public.admin_update_guest_contact(
      '97300000-0000-0000-0000-000000000001', 'moved@example.test', '01031009999', '   '
    )$$,
  '22023', null,
  '수정 사유가 비어 있으면 거부한다'
);

select throws_ok(
  $$select public.admin_update_guest_contact(
      '97300000-0000-0000-0000-000000000001', '  ', '01031009999', '사유 있음'
    )$$,
  '22023', null,
  '이메일이 비어 있으면 거부한다(빈 값은 유지가 아니다)'
);

select throws_ok(
  $$select public.admin_update_guest_contact(
      '97300000-0000-0000-0000-000000000001', 'moved@example.test', null, '사유 있음'
    )$$,
  '22023', null,
  '연락처가 비어 있으면 거부한다'
);

select throws_ok(
  $$select public.admin_update_guest_contact(
      '97300000-0000-0000-0000-000000000001', 'not-an-email', '01031009999', '사유 있음'
    )$$,
  '22023', null,
  '이메일 형식이 아니면 거부한다'
);

select throws_ok(
  $$select public.admin_update_guest_contact(
      '97300000-0000-0000-0000-000000000001', 'a b@example.test', '01031009999', '사유 있음'
    )$$,
  '22023', null,
  '공백이 섞인 이메일은 거부한다'
);

select throws_ok(
  $$select public.admin_update_guest_contact(
      '97300000-0000-0000-0000-000000000001', 'moved@example.test', '0103', '사유 있음'
    )$$,
  '22023', null,
  '숫자 9자리 미만 연락처는 거부한다(초기 비밀번호가 되는 값이다)'
);

select throws_ok(
  $$select public.admin_update_guest_contact(
      '97100000-0000-0000-0000-000000000001', 'moved@example.test', '01031009999', '사유 있음'
    )$$,
  '22023', null,
  '임직원 계정은 이 창구의 대상이 아니다'
);

select throws_ok(
  $$select public.admin_update_guest_contact(
      '97399999-0000-0000-0000-000000000009', 'moved@example.test', '01031009999', '사유 있음'
    )$$,
  'P0002', null,
  '없는 계정은 찾을 수 없다고 답한다'
);

-- ── 거절: 중복 (정지 계정까지 본다) ─────────────────────────────────────
select throws_ok(
  $$select public.admin_update_guest_contact(
      '97300000-0000-0000-0000-000000000001',
      'SUSPENDED-GUEST@example.test', '01031009999', '사유 있음'
    )$$,
  '23505', null,
  '정지된 GUEST 계정의 이메일로는 바꿀 수 없다(대소문자 무시)'
);

select throws_ok(
  $$select public.admin_update_guest_contact(
      '97300000-0000-0000-0000-000000000001',
      'moved@example.test', '010-3100-0002', '사유 있음'
    )$$,
  '23505', null,
  '정지된 GUEST 계정의 연락처로는 바꿀 수 없다(하이픈 무시)'
);

select throws_ok(
  $$select public.admin_update_guest_contact(
      '97300000-0000-0000-0000-000000000001',
      'admin@example.test', '01031009999', '사유 있음'
    )$$,
  '23505', null,
  '내부 임직원이 쓰는 이메일로는 바꿀 수 없다'
);

-- ── 허용: 표기만 다른 재전송은 아무 일도 하지 않는다 ────────────────────
select is(
  (select (public.admin_update_guest_contact(
      '97300000-0000-0000-0000-000000000001',
      'GUEST-TARGET@example.test', '010-3100-0001', '변경 없음 확인'
    ) ->> 'changed')),
  'false',
  '값이 같으면(대소문자·하이픈 차이) changed=false로 답한다'
);

select is(
  (select session_version from public.users
    where id = '97300000-0000-0000-0000-000000000001'),
  3,
  '변경이 없으면 세션 판을 올리지 않는다'
);

select is(
  (select count(*)::int from public.audit_logs where action = 'GUEST_CONTACT_UPDATE'),
  0,
  '변경이 없으면 감사 로그에 빈 줄을 남기지 않는다'
);

-- guest_credentials는 어느 앱 롤에도 열려 있지 않은 Secret 원장이다(정책 없음 + REVOKE).
-- 그래서 **역할을 되돌린 뒤** 값을 본다 — authenticated 안에서 세면 42501로 죽고, 설령
-- 죽지 않더라도 "안 바뀐 것"과 "안 보이는 것"이 같은 0으로 보인다. 확인이 끝나면 다시
-- ADMIN 세션으로 돌아간다(이 테스트가 권한을 넓히는 일은 없다).
reset role;
select is(
  (select count(*)::int from public.guest_credentials
    where user_id = '97300000-0000-0000-0000-000000000001'
      and reset_token_hash = 'deadbeef'),
  1,
  '변경이 없으면 살아 있는 재설정 링크도 그대로 둔다'
);
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"app_user_id":"97100000-0000-0000-0000-000000000002","session_version":1}',
  true
);

-- ── 허용: 실제 수정 ────────────────────────────────────────────────────
-- 응답을 두 번 보기 위해 트랜잭션 로컬 설정에 담는다(임시 표를 만들지 않는 이유: 역할을
-- 바꿔 가며 도는 테스트에서 표 소유자와 권한이 또 하나의 변수가 된다).
select set_config(
  'test.contact_result',
  public.admin_update_guest_contact(
    '97300000-0000-0000-0000-000000000001',
    'moved@example.test', '010-3100-9999', '담당자 교체로 연락처 변경'
  )::text,
  true
);

select is(
  (current_setting('test.contact_result')::jsonb ->> 'changed'),
  'true',
  '이메일·연락처를 실제로 바꾸면 changed=true로 답한다'
);

select is(
  (current_setting('test.contact_result')::jsonb ->> 'reset_link_cleared'),
  'true',
  '살아 있던 재설정 링크를 함께 비웠다고 답한다'
);

select results_eq(
  $$select email, phone, is_active, session_version
      from public.users where id = '97300000-0000-0000-0000-000000000001'$$,
  $$values ('moved@example.test'::text, '010-3100-9999'::text, true, 4)$$,
  '계정의 이메일·연락처가 바뀌고 세션 판이 오르며 is_active는 유지된다'
);

select results_eq(
  $$select email, phone from public.startups
     where id = '97200000-0000-0000-0000-000000000001'$$,
  $$values ('ledger@example.test'::text, '01031000001'::text)$$,
  '원장(startups)의 연락처는 그대로다 — 이 창구는 계정만 고친다'
);

select results_eq(
  $$select (before_data ->> 'email'), (before_data ->> 'phone'),
           (after_data ->> 'email'),  (after_data ->> 'phone'), reason
      from public.audit_logs
     where action = 'GUEST_CONTACT_UPDATE'$$,
  $$values ('guest-target@example.test'::text, '01031000001'::text,
            'moved@example.test'::text, '010-3100-9999'::text,
            '담당자 교체로 연락처 변경'::text)$$,
  '감사 로그가 변경 전과 후의 연락처를 함께 남긴다'
);

select is(
  (select actor_user_id from public.audit_logs where action = 'GUEST_CONTACT_UPDATE'),
  '97100000-0000-0000-0000-000000000002'::uuid,
  '감사 로그의 행위자는 호출한 ADMIN이다'
);

reset role;
select results_eq(
  $$select password_hash is not null, reset_token_hash, reset_expires_at,
           login_attempts, locked_until is not null
      from public.guest_credentials
     where user_id = '97300000-0000-0000-0000-000000000001'$$,
  $$values (true, null::text, null::timestamptz, 4, true)$$,
  '연락처 수정은 비밀번호·잠금은 남기고 살아 있는 재설정 링크만 비운다'
);
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"app_user_id":"97100000-0000-0000-0000-000000000002","session_version":1}',
  true
);

-- ── 거절: 초기화 입력 ──────────────────────────────────────────────────
select throws_ok(
  $$select public.admin_reset_guest_password(
      '97300000-0000-0000-0000-000000000001', null
    )$$,
  '22023', null,
  '초기화 사유가 없으면 거부한다'
);

select throws_ok(
  $$select public.admin_reset_guest_password(
      '97100000-0000-0000-0000-000000000001', '임직원 초기화'
    )$$,
  '22023', null,
  '임직원 계정은 초기화 대상이 아니다'
);

select throws_ok(
  $$select public.admin_reset_guest_password(
      '97300000-0000-0000-0000-000000000003', '연락처 없는 계정'
    )$$,
  '22023', null,
  '연락처가 없으면 초기화하지 않는다 — 로그인할 수 없는 계정이 된다'
);

-- ── 허용: 초기화 ───────────────────────────────────────────────────────
select is(
  (select (public.admin_reset_guest_password(
      '97300000-0000-0000-0000-000000000001', '본인 요청으로 초기화'
    ) ->> 'had_password')),
  'true',
  '초기화 응답은 비밀번호가 서 있었는지만 알린다(값은 돌려주지 않는다)'
);

reset role;
select results_eq(
  $$select password_hash, password_set_at, login_attempts, locked_until,
           reset_token_hash, reset_expires_at
      from public.guest_credentials
     where user_id = '97300000-0000-0000-0000-000000000001'$$,
  $$values (null::text, null::timestamptz, 0, null::timestamptz,
            null::text, null::timestamptz)$$,
  '해시·설정시각·재설정 토큰·잠금이 한 번에 비워진다(살아 있던 링크도 죽는다)'
);
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"app_user_id":"97100000-0000-0000-0000-000000000002","session_version":1}',
  true
);

select results_eq(
  $$select is_active, session_version from public.users
     where id = '97300000-0000-0000-0000-000000000001'$$,
  $$values (true, 5)$$,
  '초기화는 세션 판을 올리고 is_active는 건드리지 않는다'
);

select results_eq(
  $$select (before_data ->> 'has_password'), (after_data ->> 'has_password'),
           (after_data ->> 'initial_password'), reason
      from public.audit_logs where action = 'GUEST_PASSWORD_RESET'$$,
  $$values ('true'::text, 'false'::text, 'users.phone'::text, '본인 요청으로 초기화'::text)$$,
  '초기화 감사 로그가 전/후 상태와 사유를 남긴다'
);

select is(
  (select app.guest_has_password('97300000-0000-0000-0000-000000000001')),
  false,
  '목록이 보는 비밀번호 플래그도 개시 상태로 돌아간다'
);

select is(
  (select (public.admin_reset_guest_password(
      '97300000-0000-0000-0000-000000000001', '두 번째 초기화'
    ) ->> 'had_password')),
  'false',
  '이미 개시 상태인 계정을 다시 초기화해도 멈추지 않고 had_password=false로 답한다'
);

-- 정지 계정도 초기화할 수 있고, 초기화가 정지를 풀지는 않는다.
select is(
  (select (public.admin_reset_guest_password(
      '97300000-0000-0000-0000-000000000002', '정지 계정 초기화'
    ) ->> 'sessions_invalidated')),
  'true',
  '정지된 계정도 초기화할 수 있다(세션 무효화는 함께 일어난다)'
);

select is(
  (select is_active from public.users
    where id = '97300000-0000-0000-0000-000000000002'),
  false,
  '초기화는 정지를 풀지 않는다'
);

-- ── 비밀번호 커밋(비교 후 교체) ─────────────────────────────────────────
--
-- 호출자는 Edge Function의 service_role 경로뿐이다. 그래서 호출은 그 역할로 하고, 결과
-- 판정은 역할을 되돌린 뒤에 한다(자격증명 원장은 authenticated에 닫혀 있다).
-- 이 시점의 대상 계정: 두 번의 초기화를 지나 판 6, 해시 없음(개시 상태).
reset role;
select is(
  (select session_version from public.users
    where id = '97300000-0000-0000-0000-000000000001'),
  6,
  '두 번의 초기화를 지나 판은 6이다(커밋 시험의 출발점)'
);

-- 호출은 한 문장에 하나씩 담는다. 한 select의 목록에 여섯 호출을 늘어놓으면 실행 순서가
-- 계획에 달리고(문서로 보장되지 않는다), 여기서는 순서가 곧 시험 내용이다.
set local role service_role;

-- (1) 기대 판이 어긋나면 아무것도 쓰지 않는다.
select set_config('test.cas_stale', public.guest_password_commit(
  '97300000-0000-0000-0000-000000000001', 999, null,
  'pbkdf2$sha256$1$c2FsdA==$c3RhbGU=', true)::text, true);

-- (2) 기대 해시가 어긋나면(다른 창이 먼저 정했다) 쓰지 않는다.
select set_config('test.cas_hash', public.guest_password_commit(
  '97300000-0000-0000-0000-000000000001', 6, 'pbkdf2$sha256$1$c2FsdA==$b3RoZXI=',
  'pbkdf2$sha256$1$c2FsdA==$Y29uZmw=', true)::text, true);

-- (3) GUEST가 아닌 계정은 대상이 아니다.
select set_config('test.cas_employee', public.guest_password_commit(
  '97100000-0000-0000-0000-000000000001', 1, null,
  'pbkdf2$sha256$1$c2FsdA==$ZW1wbA==', true)::text, true);

-- (4) 셋이 모두 맞으면 저장하고 티켓을 소진한다(판 6 → 7).
select set_config('test.cas_ok', public.guest_password_commit(
  '97300000-0000-0000-0000-000000000001', 6, null,
  'pbkdf2$sha256$1$c2FsdA==$Zmlyc3Q=', true)::text, true);

-- (5) 같은 티켓의 재사용은 판이 이미 올라 통하지 않는다.
select set_config('test.cas_replay', public.guest_password_commit(
  '97300000-0000-0000-0000-000000000001', 6, null,
  'pbkdf2$sha256$1$c2FsdA==$cmVwbGF5', true)::text, true);

-- (6) 로그인 상태의 변경은 판을 올리지 않는다(소진할 티켓이 없다).
select set_config('test.cas_change', public.guest_password_commit(
  '97300000-0000-0000-0000-000000000001', 7, 'pbkdf2$sha256$1$c2FsdA==$Zmlyc3Q=',
  'pbkdf2$sha256$1$c2FsdA==$c2Vjb25k', false)::text, true);

reset role;

select results_eq(
  $$select (current_setting('test.cas_stale')::jsonb ->> 'committed'),
           (current_setting('test.cas_stale')::jsonb ->> 'reason'),
           (current_setting('test.cas_hash')::jsonb ->> 'committed'),
           (current_setting('test.cas_hash')::jsonb ->> 'reason'),
           (current_setting('test.cas_employee')::jsonb ->> 'committed'),
           (current_setting('test.cas_employee')::jsonb ->> 'reason')$$,
  $$values ('false'::text, 'version_mismatch'::text,
            'false'::text, 'password_changed'::text,
            'false'::text, 'account_unavailable'::text)$$,
  '판·해시·대상이 어긋나면 사유만 돌려주고 저장하지 않는다'
);

select results_eq(
  $$select (current_setting('test.cas_ok')::jsonb ->> 'committed'),
           (current_setting('test.cas_ok')::jsonb ->> 'session_version'),
           (current_setting('test.cas_replay')::jsonb ->> 'committed'),
           (current_setting('test.cas_replay')::jsonb ->> 'reason'),
           (current_setting('test.cas_change')::jsonb ->> 'committed'),
           (current_setting('test.cas_change')::jsonb ->> 'session_version')$$,
  $$values ('true'::text, '7'::text,
            'false'::text, 'version_mismatch'::text,
            'true'::text, '7'::text)$$,
  '조건이 맞을 때만 저장하고, 티켓 경로는 판을 올려 소진하며 변경 경로는 판을 그대로 둔다'
);

select results_eq(
  $$select password_hash, login_attempts, locked_until, reset_token_hash
      from public.guest_credentials
     where user_id = '97300000-0000-0000-0000-000000000001'$$,
  $$values ('pbkdf2$sha256$1$c2FsdA==$c2Vjb25k'::text, 0, null::timestamptz, null::text)$$,
  '마지막으로 조건을 만족한 값만 남고 잠금·재설정 링크는 비어 있다'
);

select is(
  (select count(*)::int from public.guest_credentials
    where user_id = '97100000-0000-0000-0000-000000000001'),
  0,
  '거절된 호출은 임직원 계정에 자격증명 행을 만들지 않는다'
);

select is(
  (select session_version from public.users
    where id = '97300000-0000-0000-0000-000000000001'),
  7,
  '판은 성공한 티켓 경로 한 번만큼만 올랐다'
);

-- ── 재설정 링크 발급·소진의 원자성 ────────────────────────────────────
-- Edge Function이 쓰는 service_role로만 호출하고, 자격증명 검사는 postgres로 돌아와 한다.
set local role service_role;
select set_config('test.reset_issue', public.guest_reset_token_issue(
  '97300000-0000-0000-0000-000000000001', 7, 'token-a', now() + interval '30 minutes'
)::text, true);
reset role;

select results_eq(
  $$select current_setting('test.reset_issue')::jsonb ->> 'issued',
           current_setting('test.reset_issue')::jsonb ->> 'session_version'$$,
  $$values ('true'::text, '7'::text)$$,
  '재설정 링크는 읽은 계정의 현재 판에 묶여 발급된다'
);

select results_eq(
  $$select password_hash, reset_token_hash, reset_session_version
      from public.guest_credentials
     where user_id = '97300000-0000-0000-0000-000000000001'$$,
  $$values ('pbkdf2$sha256$1$c2FsdA==$c2Vjb25k'::text, 'token-a'::text, 7)$$,
  '링크 발급은 비밀번호를 보존하고 토큰 해시와 발급 시점 판만 저장한다'
);

set local role service_role;
select set_config('test.reset_stale', public.guest_reset_token_issue(
  '97300000-0000-0000-0000-000000000001', 6, 'token-stale', now() + interval '30 minutes'
)::text, true);
select set_config('test.reset_unknown', public.guest_reset_token_consume('not-the-token')::text, true);
reset role;

select results_eq(
  $$select current_setting('test.reset_stale')::jsonb ->> 'issued',
           current_setting('test.reset_stale')::jsonb ->> 'reason',
           (select reset_token_hash from public.guest_credentials
             where user_id = '97300000-0000-0000-0000-000000000001')$$,
  $$values ('false'::text, 'version_mismatch'::text, 'token-a'::text)$$,
  '오래된 판으로 발급을 시도하면 기존 링크를 덮어쓰지 않는다'
);

select is(
  current_setting('test.reset_unknown')::jsonb ->> 'consumed',
  'false',
  '모르는 토큰은 소진되지 않는다'
);

set local role service_role;
select set_config('test.reset_consume', public.guest_reset_token_consume('token-a')::text, true);
select set_config('test.reset_replay', public.guest_reset_token_consume('token-a')::text, true);
reset role;

select results_eq(
  $$select current_setting('test.reset_consume')::jsonb ->> 'consumed',
           current_setting('test.reset_consume')::jsonb ->> 'user_id',
           current_setting('test.reset_consume')::jsonb ->> 'session_version',
           current_setting('test.reset_consume')::jsonb ->> 'name'$$,
  $$values ('true'::text, '97300000-0000-0000-0000-000000000001'::text,
            '7'::text, '원장 대표'::text)$$,
  '유효한 링크는 계정 id·검증한 판·이름을 한 번만 돌려준다'
);

select results_eq(
  $$select password_hash, reset_token_hash, reset_expires_at, reset_session_version
      from public.guest_credentials
     where user_id = '97300000-0000-0000-0000-000000000001'$$,
  $$values ('pbkdf2$sha256$1$c2FsdA==$c2Vjb25k'::text, null::text,
            null::timestamptz, null::integer)$$,
  '소진은 링크만 비우고 현재 비밀번호는 보존한다'
);

select is(
  current_setting('test.reset_replay')::jsonb ->> 'consumed',
  'false',
  '같은 링크는 두 번째 소진에서 거절된다'
);

set local role service_role;
select set_config('test.reset_expiring_issue', public.guest_reset_token_issue(
  '97300000-0000-0000-0000-000000000001', 7, 'token-expired', now() + interval '30 minutes'
)::text, true);
reset role;
update public.guest_credentials
   set reset_expires_at = now() - interval '1 minute'
 where user_id = '97300000-0000-0000-0000-000000000001';
set local role service_role;
select set_config('test.reset_expired', public.guest_reset_token_consume('token-expired')::text, true);
reset role;

select results_eq(
  $$select current_setting('test.reset_expired')::jsonb ->> 'consumed',
           (select reset_token_hash from public.guest_credentials
             where user_id = '97300000-0000-0000-0000-000000000001')$$,
  $$values ('false'::text, 'token-expired'::text)$$,
  '만료된 링크는 소진되지 않고 다시 통할 수 없는 상태로 남는다'
);

-- ── ACL ────────────────────────────────────────────────────────────────

select ok(
  not has_function_privilege(
    'anon', 'public.admin_update_guest_contact(uuid,text,text,text)', 'EXECUTE'
  )
  and has_function_privilege(
    'authenticated', 'public.admin_update_guest_contact(uuid,text,text,text)', 'EXECUTE'
  )
  and not has_function_privilege(
    'anon', 'public.admin_reset_guest_password(uuid,text)', 'EXECUTE'
  )
  and has_function_privilege(
    'authenticated', 'public.admin_reset_guest_password(uuid,text)', 'EXECUTE'
  ),
  '두 RPC는 anon에 닫히고 authenticated에만 열려 있다'
);

select ok(
  not has_function_privilege(
    'anon', 'app.log_guest_change(uuid,text,text,jsonb,jsonb,text)', 'EXECUTE'
  )
  and not has_function_privilege(
    'authenticated', 'app.log_guest_change(uuid,text,text,jsonb,jsonb,text)', 'EXECUTE'
  ),
  '감사 적재 본체는 어느 앱 롤에도 열려 있지 않다(DEFINER 함수 안에서만 불린다)'
);

select ok(
  (select count(*)::int from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in ('admin_update_guest_contact', 'admin_reset_guest_password')
      and p.prosecdef
      and exists (
        select 1 from unnest(coalesce(p.proconfig, '{}'::text[])) c
         where c like 'search_path=%'
      )) = 2,
  '두 RPC는 SECURITY DEFINER이며 search_path가 함수에 고정되어 있다'
);

select ok(
  not has_function_privilege(
    'anon', 'public.guest_password_commit(uuid,integer,text,text,boolean)', 'EXECUTE'
  )
  and not has_function_privilege(
    'authenticated', 'public.guest_password_commit(uuid,integer,text,text,boolean)', 'EXECUTE'
  )
  and has_function_privilege(
    'service_role', 'public.guest_password_commit(uuid,integer,text,text,boolean)', 'EXECUTE'
  ),
  '비밀번호 커밋은 service_role 전용이다(anon·authenticated 모두 닫힘)'
);

select ok(
  (select not p.prosecdef
     and exists (
       select 1 from unnest(coalesce(p.proconfig, '{}'::text[])) c
        where c like 'search_path=%'
     )
     from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'guest_password_commit'),
  '커밋 함수는 INVOKER다 — 표 권한이 두 번째 문으로 남는다'
);

select ok(
  not has_function_privilege(
    'anon', 'public.guest_reset_token_issue(uuid,integer,text,timestamptz)', 'EXECUTE'
  )
  and not has_function_privilege(
    'authenticated', 'public.guest_reset_token_issue(uuid,integer,text,timestamptz)', 'EXECUTE'
  )
  and has_function_privilege(
    'service_role', 'public.guest_reset_token_issue(uuid,integer,text,timestamptz)', 'EXECUTE'
  )
  and not has_function_privilege(
    'anon', 'public.guest_reset_token_consume(text)', 'EXECUTE'
  )
  and not has_function_privilege(
    'authenticated', 'public.guest_reset_token_consume(text)', 'EXECUTE'
  )
  and has_function_privilege(
    'service_role', 'public.guest_reset_token_consume(text)', 'EXECUTE'
  ),
  '재설정 링크 발급·소진은 service_role에만 열려 있다'
);

select is(
  (select count(*)::int from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in ('guest_reset_token_issue', 'guest_reset_token_consume')
      and not p.prosecdef
      and exists (
        select 1 from unnest(coalesce(p.proconfig, '{}'::text[])) c
         where c like 'search_path=%'
      )),
  2,
  '재설정 링크 함수 둘은 INVOKER이며 search_path가 고정되어 있다'
);

select * from finish();
rollback;
