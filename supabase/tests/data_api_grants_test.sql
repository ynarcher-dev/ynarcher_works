-- =====================================================================
-- Data API 테이블 권한(ACL) 회귀 테스트 (pgTAP)
-- 대상 마이그레이션: 20260912025406_authenticated_data_api_grants.sql
--
-- 이 테스트가 지키는 것
--   · 권한을 **정확한 집합**으로 단언한다. "SELECT가 있다"가 아니라 "SELECT·INSERT·
--     UPDATE만 있다"로 보므로, DELETE나 TRUNCATE가 섞여 들어오면 실패한다.
--   · 픽스처에서 GRANT를 하지 않는다. 여기서 권한을 주면 마이그레이션이 권한을
--     빠뜨려도 통과해 버린다 — 확인하려는 바로 그 구멍을 가리게 된다.
--   · 권한과 RLS를 나눠서 본다. 권한이 있다는 것을 먼저 단언한 뒤 접근이 막히는지
--     보므로, 차단의 주체가 RLS임이 드러난다.
-- =====================================================================
begin;
select plan(35);

-- ── 픽스처 (슈퍼유저로 넣고 트랜잭션 종료 시 롤백) ──────────────────────────
insert into public.startups(id, name) values
  ('d1000000-0000-0000-0000-000000000001', 'ACL테스트 컴퍼니'),
  ('d1000000-0000-0000-0000-000000000002', 'ACL테스트 컴퍼니2');

-- 활성 NETWORKS 행은 국가 태그가 필수다(networks_active_country_required_chk,
-- 20260910230454). 시드된 활성 태그 하나를 골라 붙인다.
insert into public.networks(id, name, country_tag_id)
select 'd3000000-0000-0000-0000-000000000001', 'ACL테스트 네트워크',
       (select id from public.country_tags
         where deleted_at is null
         order by sort_order, name
         limit 1);

insert into public.users(id, user_type, name, session_version, company_id) values
  ('d2000000-0000-0000-0000-000000000001', 'read_only',          'acl_무권한_사용자', 1, null),
  ('d2000000-0000-0000-0000-000000000002', 'read_only',          'acl_startup_읽기',  1, null),
  ('d2000000-0000-0000-0000-000000000003', 'external_startup',   'acl_외부_게스트',   1,
   'd1000000-0000-0000-0000-000000000001'),
  ('d2000000-0000-0000-0000-000000000004', 'management_support', 'acl_인사_담당자',   1, null),
  ('d2000000-0000-0000-0000-000000000005', 'super_admin',        'acl_관리자',        1, null),
  ('d2000000-0000-0000-0000-000000000006', 'read_only',          'acl_networks_쓰기', 1, null);

insert into public.workspace_permissions(user_id, workspace_key, permission_level, scope_type, expires_at)
values
  ('d2000000-0000-0000-0000-000000000002', 'startup',    'read',  'global', null),
  ('d2000000-0000-0000-0000-000000000004', 'management', 'write', 'global', null),
  ('d2000000-0000-0000-0000-000000000006', 'networks',   'write', 'global', null);

-- 위 networks INSERT는 `trg_networks_contribution`(AFTER INSERT, 20260904120000)을 깨워
-- 기여 기록을 **자동으로 한 건** 만든다. 그래서 이 원장의 기여 건수는 자동 기록 + 아래
-- 수동 기록으로 늘어난다 — 건수로 보면 트리거가 늘 때마다 흔들리므로, 아래 단언들은
-- 전부 **고정 id**로 특정 행을 집어 본다.
-- 행위자 칸은 넣지 않는다. `app.stamp_contribution_actor()`(최신 정의 20260721120000)는
-- 보낸 값을 보지 않고 언제나 `app.current_app_user_id()`로 덮어쓰며, 이 픽스처는 JWT 없이
-- 슈퍼유저로 도는 자리라 그 값이 NULL이다. 여기에 user_id를 적어 두면 실제로는 저장되지
-- 않는 값을 적어 둔 셈이 된다. 행위자 스탬프는 아래 29번이 실제 authenticated 세션에서 본다.
insert into public.entity_contributions(id, entity_table, entity_id, action, source, note)
values ('d4000000-0000-0000-0000-000000000001', 'networks',
        'd3000000-0000-0000-0000-000000000001', 'created', 'manual', 'ACL픽스처');

insert into public.guest_identities(master_table, master_id, user_id)
values ('startups', 'd1000000-0000-0000-0000-000000000001',
        'd2000000-0000-0000-0000-000000000003');

-- 감사 로그 한 줄. 적재는 서버 경로가 하므로 여기서도 슈퍼유저로 넣는다.
insert into public.audit_logs(id, actor_user_id, action, reason)
values ('d5000000-0000-0000-0000-000000000001',
        'd2000000-0000-0000-0000-000000000005', 'ACL_TEST_ACTION', 'ACL 테스트');

-- ── 도우미 ──────────────────────────────────────────────────────────────────
-- has_table_privilege는 PUBLIC·상속 경로까지 반영한 **실효 권한**을 본다.
create or replace function pg_temp.privs(p_role text, p_table text)
returns text
language sql
stable
as $$
  select coalesce(string_agg(p, ',' order by p), '(없음)')
  from unnest(array['DELETE','INSERT','REFERENCES','SELECT','TRIGGER','TRUNCATE','UPDATE']) as p
  where has_table_privilege(p_role, p_table, p);
$$;

-- RLS는 UPDATE/INSERT 거절을 오류가 아니라 **0행**으로 돌려주는 경우가 있다. 자료 변경
-- CTE는 스칼라 서브쿼리에 넣을 수 없으므로 작은 도우미로 감싼다 — 기본이 security
-- invoker라 호출자(authenticated)의 권한과 RLS가 그대로 적용된다.
create or replace function pg_temp.upd_user_type(p_id uuid, p_type public.user_type)
returns integer language plpgsql as $$
declare n integer;
begin
  update public.users set user_type = p_type where id = p_id;
  get diagnostics n = row_count; return n;
end $$;

create or replace function pg_temp.upd_user_name(p_id uuid, p_name text)
returns integer language plpgsql as $$
declare n integer;
begin
  update public.users set name = p_name where id = p_id;
  get diagnostics n = row_count; return n;
end $$;

-- user_id를 비워 넣는다 — 행위자 칸은 BEFORE INSERT 트리거가 채운다.
-- id는 호출자가 정한다. 넣은 행을 뒤에서 다시 집어야 하는데, 같은 원장에는 트리거가
-- 만든 기록이 섞여 있어 "마지막 행" 같은 기준으로는 특정할 수 없기 때문이다.
create or replace function pg_temp.ins_contribution(p_id uuid, p_entity_id uuid, p_note text)
returns integer language plpgsql as $$
declare n integer;
begin
  insert into public.entity_contributions(id, entity_table, entity_id, action, source, note)
  values (p_id, 'networks', p_entity_id, 'edited', 'manual', p_note);
  get diagnostics n = row_count; return n;
end $$;

-- ── 1~11. 원장별 유효 권한 집합 ─────────────────────────────────────────────
select is(pg_temp.privs('authenticated', 'public.startups'), 'INSERT,SELECT,UPDATE',
  'startups: SELECT·INSERT·UPDATE만 가진다(DELETE·TRUNCATE 없음)');
select is(pg_temp.privs('authenticated', 'public.networks'), 'INSERT,SELECT,UPDATE',
  'networks: SELECT·INSERT·UPDATE만 가진다');
select is(pg_temp.privs('authenticated', 'public.programs'), 'INSERT,SELECT,UPDATE',
  'programs: SELECT·INSERT·UPDATE만 가진다');
select is(pg_temp.privs('authenticated', 'public.ma_programs'), 'INSERT,SELECT,UPDATE',
  'ma_programs: SELECT·INSERT·UPDATE만 가진다');
select is(pg_temp.privs('authenticated', 'public.ma_buyers'), 'INSERT,SELECT,UPDATE',
  'ma_buyers: SELECT·INSERT·UPDATE만 가진다');
select is(pg_temp.privs('authenticated', 'public.ma_sellers'), 'INSERT,SELECT,UPDATE',
  'ma_sellers: SELECT·INSERT·UPDATE만 가진다');
select is(pg_temp.privs('authenticated', 'public.funds'), 'INSERT,SELECT,UPDATE',
  'funds: SELECT·INSERT·UPDATE만 가진다');

-- users만 INSERT가 빠진다 — 계정 생성은 Edge Function(service_role) 경로다.
select is(pg_temp.privs('authenticated', 'public.users'), 'SELECT,UPDATE',
  'users: SELECT·UPDATE만 가진다(계정 생성은 서버 경로)');

-- 기여 로그는 읽고 쓰기만 한다(고쳐 쓰는 정책이 없다).
select is(pg_temp.privs('authenticated', 'public.entity_contributions'), 'INSERT,SELECT',
  'entity_contributions: SELECT·INSERT만 가진다(UPDATE·DELETE 없음)');

-- 게스트 연결은 읽기 전용. 자격증명은 별도 표이며 계속 잠겨 있다.
select is(pg_temp.privs('authenticated', 'public.guest_identities'), 'SELECT',
  'guest_identities: SELECT만 가진다(연결 생성은 ADMIN 경로)');

-- 감사 로그는 읽기만. 적재는 SECURITY DEFINER·service_role 경로이며 쓰기 정책이 없다.
select is(pg_temp.privs('authenticated', 'public.audit_logs'), 'SELECT',
  'audit_logs: SELECT만 가진다(쓰기 권한 없음 — 감사 로그는 위조 불가해야 한다)');

-- ── 12. anon에는 아무것도 열지 않는다 ───────────────────────────────────────
-- TRUNCATE·REFERENCES·TRIGGER까지 포함해서 본다. 깨끗한 재생에서도 이 셋이 남아
-- 있었고(행 단위 권한만 회수되는 현재 동작), 마이그레이션이 그것을 걷어낸다.
select is(
  (select string_agg(t || '=' || pg_temp.privs('anon', 'public.' || t), ' ' order by t)
     from unnest(array['startups','networks','users','programs',
                       'ma_programs','ma_buyers','ma_sellers','funds',
                       'entity_contributions','guest_identities','audit_logs']) as t),
  'audit_logs=(없음) entity_contributions=(없음) funds=(없음) '
  || 'guest_identities=(없음) ma_buyers=(없음) ma_programs=(없음) '
  || 'ma_sellers=(없음) networks=(없음) programs=(없음) startups=(없음) users=(없음)',
  'anon은 이 원장들에 아무 권한도 갖지 않는다(TRUNCATE·REFERENCES·TRIGGER 포함)'
);

-- ── 13. 권한을 준 테이블은 전부 RLS가 켜져 있다 ─────────────────────────────
select is(
  (select count(*)::integer
     from pg_class c
    where c.relnamespace = 'public'::regnamespace
      and c.relkind = 'r'
      and c.relname in ('startups','networks','users','programs',
                        'ma_programs','ma_buyers','ma_sellers','funds',
                        'entity_contributions','guest_identities','audit_logs')
      and c.relrowsecurity is true),
  11,
  '권한을 부여한 11개 원장 모두 RLS가 활성화되어 있다'
);

-- ── 14~17. 보호 테이블은 잠겨 있다 ──────────────────────────────────────────
select is(pg_temp.privs('authenticated', 'public.meeting_recordings'), 'SELECT',
  'meeting_recordings: 읽기만 열려 있다(쓰기는 상태 전이 RPC 전용)');
select is(pg_temp.privs('authenticated', 'public.meeting_recording_segments'), 'SELECT',
  'meeting_recording_segments: 읽기만 열려 있다');
select is(pg_temp.privs('authenticated', 'public.guest_credentials'), '(없음)',
  'guest_credentials: 어떤 권한도 없다(게스트 자격증명)');

-- 예산 변경 이력은 서버가 쓰는 감사 기록이다. DML은 주지 않으며, 상속으로 남아 있던
-- TRUNCATE(= RLS를 거치지 않는 전체 삭제)도 회수한다. rls_regression 케이스15b와 같은 경계다.
select is(pg_temp.privs('authenticated', 'public.approval_budget_revisions'), '(없음)',
  'approval_budget_revisions: DML도 TRUNCATE도 없다(서버 전용 감사 이력)');

-- ── 18. 권한이 있어도 RLS가 행을 막는다 ─────────────────────────────────────
-- 42501이 아니라 0건이 나와야 한다. 오류가 났다면 권한이 없는 것이고,
-- 행이 보였다면 RLS가 뚫린 것이다.
set local role authenticated;
select set_config('request.jwt.claims',
  '{"app_user_id":"d2000000-0000-0000-0000-000000000001","session_version":1}', true);
select is(
  (select count(*)::integer from public.startups),
  0,
  'startup 읽기 권한이 없는 사용자는 startups에서 0건을 받는다(오류가 아니다)'
);
reset role;

-- ── 19. 권한이 있는 사용자에게는 실제로 보인다 ──────────────────────────────
-- 18번의 0건이 "권한이 없어서"가 아니라 "RLS가 걸러서"임을 이 쌍이 증명한다.
set local role authenticated;
select set_config('request.jwt.claims',
  '{"app_user_id":"d2000000-0000-0000-0000-000000000002","session_version":1}', true);
select is(
  (select count(*)::integer from public.startups
    where id in ('d1000000-0000-0000-0000-000000000001',
                 'd1000000-0000-0000-0000-000000000002')),
  2,
  'startup 읽기 권한이 있는 사용자에게는 같은 행이 보인다'
);
reset role;

-- ── 20. INSERT 권한은 있지만 RLS가 외부 게스트를 막는다 ─────────────────────
set local role authenticated;
select set_config('request.jwt.claims',
  '{"app_user_id":"d2000000-0000-0000-0000-000000000003","session_version":1}', true);
select throws_ok(
  $$insert into public.startups(id, name)
    values ('d1000000-0000-0000-0000-0000000000ff', '외부 게스트가 만든 행')$$,
  '42501',
  null,
  '외부 게스트의 startups INSERT는 RLS가 막는다(권한은 있으나 정책이 거절)'
);
reset role;

-- ── 21. 물리 삭제는 권한 자체가 없다 ────────────────────────────────────────
-- soft delete는 deleted_at UPDATE로 한다(3_database_rls_policy_matrix.md §2.5).
set local role authenticated;
select set_config('request.jwt.claims',
  '{"app_user_id":"d2000000-0000-0000-0000-000000000002","session_version":1}', true);
select throws_ok(
  $$delete from public.startups
     where id = 'd1000000-0000-0000-0000-000000000001'$$,
  '42501',
  null,
  'authenticated는 startups를 직접 DELETE할 수 없다(테이블 권한 없음)'
);
reset role;

-- ── 22~26. users UPDATE 권한이 정책 경계를 넓히지 않는다 ────────────────────
--
-- users 권한 단언(SELECT·UPDATE)과 짝이다. 권한이 있으니 거절은 전부 users_update
-- 정책이 한 것이고, 최신 정의(20260903180000)는
--   is_admin() or (can_write_workspace('management') and not is_guest_user_type(user_type))
-- 이다. 본인(self) 절은 20260708130000에서 빠졌다 — 본인 약력·노트는 SECURITY
-- DEFINER RPC update_my_profile()이 담당하며 이 권한을 쓰지 않는다.

-- 22. 평범한 내부 사용자가 자기 행의 역할을 올리지 못한다(권한 상승 차단).
set local role authenticated;
select set_config('request.jwt.claims',
  '{"app_user_id":"d2000000-0000-0000-0000-000000000001","session_version":1}', true);
select is(
  pg_temp.upd_user_type('d2000000-0000-0000-0000-000000000001', 'super_admin'),
  0,
  '일반 사용자는 본인 user_type을 super_admin으로 바꿀 수 없다(self 절 없음)'
);
reset role;

select is(
  (select user_type::text from public.users
    where id = 'd2000000-0000-0000-0000-000000000001'),
  'read_only',
  '거절된 뒤에도 본인 user_type은 그대로다'
);

-- 24. MANAGEMENT 쓰기 권한자는 게스트 행을 만지지 못한다(게스트 축은 ADMIN 소유).
set local role authenticated;
select set_config('request.jwt.claims',
  '{"app_user_id":"d2000000-0000-0000-0000-000000000004","session_version":1}', true);
select is(
  pg_temp.upd_user_name('d2000000-0000-0000-0000-000000000003', 'MANAGEMENT가 고친 이름'),
  0,
  'MANAGEMENT 쓰기 권한자는 게스트 계정 행을 수정할 수 없다'
);

-- 25. 같은 사람이 내부 임직원 행은 정상적으로 수정한다(의도한 동작은 계속 된다).
select is(
  pg_temp.upd_user_name('d2000000-0000-0000-0000-000000000002', 'MANAGEMENT가 고친 임직원'),
  1,
  'MANAGEMENT 쓰기 권한자는 내부 임직원 행을 수정할 수 있다'
);
reset role;

-- 26. ADMIN은 게스트 행도 수정한다.
set local role authenticated;
select set_config('request.jwt.claims',
  '{"app_user_id":"d2000000-0000-0000-0000-000000000005","session_version":1}', true);
select is(
  pg_temp.upd_user_name('d2000000-0000-0000-0000-000000000003', 'ADMIN이 고친 게스트'),
  1,
  'ADMIN은 게스트 계정 행을 수정할 수 있다'
);
reset role;

-- ── 27~30. 기여 로그: 워크스페이스 경계와 행위자 스탬프 ─────────────────────
set local role authenticated;
select set_config('request.jwt.claims',
  '{"app_user_id":"d2000000-0000-0000-0000-000000000006","session_version":1}', true);
-- 픽스처가 넣은 그 한 건이 구분(action/source)까지 그대로 보이는지 본다. 건수가 아니라
-- 고정 id로 집으므로 트리거가 만든 자동 기록이 몇 건이든 흔들리지 않는다. 보이지 않으면
-- 결과가 NULL이 되어 실패한다.
-- 행위자는 여기서 단언하지 않는다 — 이 행은 JWT 없는 픽스처가 넣어 스탬프가 NULL이며,
-- 행위자 규칙은 29번이 실제 세션에서 본다.
select is(
  (select action || '/' || source
     from public.entity_contributions
    where id = 'd4000000-0000-0000-0000-000000000001'),
  'created/manual',
  'networks 권한자는 지정한 기여 기록을 읽는다'
);

-- 본인 명의 기여 기록은 허용된다(정책 with check: user_id is null or = 본인).
select is(
  pg_temp.ins_contribution('d4000000-0000-0000-0000-000000000002',
                           'd3000000-0000-0000-0000-000000000001', 'ACL테스트 기여'),
  1,
  'networks 쓰기 권한자는 기여 이력을 남길 수 있다'
);

-- 행위자 칸은 보낸 값(null)이 아니라 트리거(app.stamp_contribution_actor)가 정한다.
select is(
  (select user_id::text from public.entity_contributions
    where id = 'd4000000-0000-0000-0000-000000000002'),
  'd2000000-0000-0000-0000-000000000006',
  '기여 로그의 행위자는 트리거가 호출자로 채운다'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claims',
  '{"app_user_id":"d2000000-0000-0000-0000-000000000001","session_version":1}', true);
-- 거절 쌍: 같은 두 행(픽스처 + 위에서 넣은 것)을 같은 id로 집어도 한 건도 보이지 않는다.
select is(
  (select count(*)::integer from public.entity_contributions
    where id in ('d4000000-0000-0000-0000-000000000001',
                 'd4000000-0000-0000-0000-000000000002')),
  0,
  'networks 권한이 없는 사용자에게는 같은 기여 기록이 보이지 않는다'
);
reset role;

-- ── 31~32. 게스트 연결: 원장 읽기 권한에 묶이고 게스트 본인에게는 닫힌다 ────
-- "이 회사에 계정이 있다"는 사실 자체가 기밀일 수 있으므로 원장 축을 따른다
-- (guest_identities_select = 로그인 and not is_guest() and can_read_master_table).
set local role authenticated;
select set_config('request.jwt.claims',
  '{"app_user_id":"d2000000-0000-0000-0000-000000000002","session_version":1}', true);
select is(
  (select count(*)::integer from public.guest_identities
    where master_id = 'd1000000-0000-0000-0000-000000000001'),
  1,
  'startup 원장을 읽는 내부 사용자에게는 게스트 연결이 보인다'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claims',
  '{"app_user_id":"d2000000-0000-0000-0000-000000000003","session_version":1}', true);
select is(
  (select count(*)::integer from public.guest_identities),
  0,
  '외부 게스트 본인에게는 게스트 연결 원장이 보이지 않는다'
);
reset role;

-- ── 33~35. 감사 로그: 권한은 열되 이력은 ADMIN에게만 보인다 ────────────────
--
-- audit_logs_select(20260705120500)의 조건은 `app.is_admin()` 하나다. SELECT 권한을
-- 주더라도 관리자가 아닌 사용자에게는 한 줄도 보이지 않아야 한다 — 권한을 연 것이
-- 이력 노출로 이어지지 않는다는 것을 아래 양·음 쌍이 함께 보인다.
set local role authenticated;
select set_config('request.jwt.claims',
  '{"app_user_id":"d2000000-0000-0000-0000-000000000005","session_version":1}', true);
select is(
  (select action || '/' || reason from public.audit_logs
    where id = 'd5000000-0000-0000-0000-000000000001'),
  'ACL_TEST_ACTION/ACL 테스트',
  'ADMIN은 감사 로그를 읽는다'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claims',
  '{"app_user_id":"d2000000-0000-0000-0000-000000000004","session_version":1}', true);
select is(
  (select count(*)::integer from public.audit_logs
    where id = 'd5000000-0000-0000-0000-000000000001'),
  0,
  'ADMIN이 아닌 내부 사용자(MANAGEMENT 쓰기)에게는 감사 로그가 보이지 않는다'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claims',
  '{"app_user_id":"d2000000-0000-0000-0000-000000000003","session_version":1}', true);
select is(
  (select count(*)::integer from public.audit_logs),
  0,
  '외부 게스트에게는 감사 로그가 한 줄도 보이지 않는다'
);
reset role;

select * from finish();
rollback;
