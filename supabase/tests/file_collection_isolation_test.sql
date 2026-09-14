-- =====================================================================
-- 파일받기(FILE_COLLECTION) 모듈 — 격리·잠금·상태 회귀 (pgTAP)
-- 실행: node scripts/db-test/run-db-tests.mjs file_collection_isolation_test.sql
--
-- 확인하는 것
--   · 허용: 사업 담당자가 트리를 짜고 배정·공개하고, 배정된 게스트가 올리고 문항마다 제출한다
--   · 문항 자료: 담당자가 붙인 양식은 배정된 게스트만 읽는다(폴더·엉뚱한 모듈·읽기 전용 거절)
--   · 거절: 다른 워크스페이스 · 읽기 전용 · 다른 게스트 · 정지 명부 · 비활성 계정 ·
--           세션 버전 불일치 · 다른 맥락 세션 · 모듈 CLOSED 쓰기 · 파일받기가 아닌 모듈 · 직접 DML
--   · 실물: storage.objects에 실물이 없으면 확정되지 않는다(크기 위조 불가)
--   · 구조: 순환 · 교차 모듈 · 부모 규칙 · 자유 깊이(65단계 이상) · 공개 후 트리 잠금
--   · 순서: 형제 한 칸 이동이 한 호출로 실제 순서를 바꾸고 1..n을 다시 매긴다(양 끝은 무변화)
--   · 상태: NOT_SUBMITTED → DRAFT → SUBMITTED → REWORK_REQUESTED(회차+1) → 재제출 → APPROVED
--   · 보존: 소프트 삭제만 · 검토 중·완료 파일은 누구도 못 내린다(회차는 가르지 않는다) · 명부가 사라져도 제출물은 남는다
--   · RLS SELECT가 실제로 실행된다(판정 헬퍼 EXECUTE 권한 회귀)
--
-- 동시성(잠금 순서 collection → response)은 단일 세션 pgTAP으로 실제 경합을 재현할 수 없어
-- **미검증**이다. 여기서는 잠금이 걸린 경로가 상태를 다시 읽고 판단하는지만 확인한다.
-- =====================================================================

begin;
select plan(125);

-- ---------------------------------------------------------------------
-- 셋업
-- ---------------------------------------------------------------------
insert into public.users (id, user_type, name, email, session_version) values
  ('a1000000-0000-0000-0000-000000000001', 'read_only', 'PROJECT 담당자', null, 1),
  ('a1000000-0000-0000-0000-000000000002', 'read_only', 'FUND 담당자',    null, 1),
  ('a1000000-0000-0000-0000-000000000003', 'read_only', 'M&A 담당자',     null, 1),
  ('a1000000-0000-0000-0000-000000000004', 'read_only', 'PROJECT 열람자', null, 1);

insert into public.workspace_permissions (user_id, workspace_key, permission_level, scope_type) values
  ('a1000000-0000-0000-0000-000000000001', 'project', 'write', 'global'),
  ('a1000000-0000-0000-0000-000000000002', 'fund',    'write', 'global'),
  ('a1000000-0000-0000-0000-000000000003', 'mna',     'write', 'global'),
  ('a1000000-0000-0000-0000-000000000004', 'project', 'read',  'global');

insert into public.users (id, user_type, name, email, phone, session_version, is_active) values
  ('a2000000-0000-0000-0000-000000000001', 'temporary_guest', '게스트 1', 'fc-g1@example.test', null, 1, true),
  ('a2000000-0000-0000-0000-000000000002', 'temporary_guest', '게스트 2', 'fc-g2@example.test', null, 1, true),
  ('a2000000-0000-0000-0000-000000000003', 'temporary_guest', '정지 게스트', 'fc-g3@example.test', null, 1, true),
  ('a2000000-0000-0000-0000-000000000004', 'temporary_guest', '다른 사업 게스트', 'fc-g4@example.test', null, 1, true),
  ('a2000000-0000-0000-0000-000000000006', 'temporary_guest', '비활성 게스트', 'fc-g6@example.test', null, 1, false);

insert into public.programs (id, title) values
  ('a3000000-0000-0000-0000-000000000001', '파일받기 사업'),
  ('a3000000-0000-0000-0000-000000000002', '다른 사업');

insert into public.program_managers (program_id, user_id, role, allocation_rate, start_date, end_date) values
  ('a3000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001', 'PM', 100, current_date, current_date + 365),
  ('a3000000-0000-0000-0000-000000000002', 'a1000000-0000-0000-0000-000000000001', 'PM', 100, current_date, current_date + 365);

-- 게스트 1·2는 같은 사업(같은 기업이라도 서로 비공개여야 한다), 3은 정지, 4는 다른 사업, 6은 비활성 계정.
insert into public.program_participants
  (id, entity_key, program_id, user_id, login_status) values
  ('a4000000-0000-0000-0000-000000000001', 'program', 'a3000000-0000-0000-0000-000000000001',
   'a2000000-0000-0000-0000-000000000001', 'ACTIVE'),
  ('a4000000-0000-0000-0000-000000000002', 'program', 'a3000000-0000-0000-0000-000000000001',
   'a2000000-0000-0000-0000-000000000002', 'ACTIVE'),
  ('a4000000-0000-0000-0000-000000000003', 'program', 'a3000000-0000-0000-0000-000000000001',
   'a2000000-0000-0000-0000-000000000003', 'NOT_ALLOWED'),
  ('a4000000-0000-0000-0000-000000000004', 'program', 'a3000000-0000-0000-0000-000000000002',
   'a2000000-0000-0000-0000-000000000004', 'ACTIVE'),
  ('a4000000-0000-0000-0000-000000000006', 'program', 'a3000000-0000-0000-0000-000000000001',
   'a2000000-0000-0000-0000-000000000006', 'ACTIVE');

insert into public.program_modules (id, entity_key, program_id, module_type, enabled, status, visibility) values
  ('a5000000-0000-0000-0000-000000000001', 'program', 'a3000000-0000-0000-0000-000000000001',
   'FILE_COLLECTION', true, 'OPEN', 'GUEST_ONLY'),
  ('a5000000-0000-0000-0000-000000000002', 'program', 'a3000000-0000-0000-0000-000000000002',
   'FILE_COLLECTION', true, 'OPEN', 'GUEST_ONLY'),
  ('a5000000-0000-0000-0000-000000000003', 'program', 'a3000000-0000-0000-0000-000000000001',
   'POST', true, 'OPEN', 'GUEST_ONLY');

-- ---------------------------------------------------------------------
-- (0) 카탈로그 · 권한 · 버킷
-- ---------------------------------------------------------------------
select ok(
  (select workspaces @> array['project', 'mna'] and not (workspaces && array['fund', 'ac'])
     from public.module_templates where key = 'FILE_COLLECTION'),
  '카탈로그는 PROJECT·M&A 둘뿐이며 FUND는 들어 있지 않다'
);

select is(
  (select visibility::text from public.module_templates where key = 'FILE_COLLECTION'),
  'GUEST_ONLY',
  '카탈로그 공개 범위는 GUEST_ONLY다'
);

select ok(
  not exists (
    select 1 from information_schema.role_table_grants
     where table_schema = 'public'
       and table_name like 'file_collection%'
       and grantee in ('anon', 'authenticated')
       and privilege_type <> 'SELECT'
  ),
  '앱 롤에는 SELECT 말고 어떤 권한도 없다(직접 DML·TRUNCATE·REFERENCES·TRIGGER 0)'
);

select ok(
  not exists (
    select 1 from information_schema.role_table_grants
     where table_schema = 'public' and table_name like 'file_collection%'
       and grantee in ('anon', 'service_role')
  ),
  'anon·service_role에는 아무 표 권한도 없다(Edge는 호출자 JWT와 RPC로만 이 표를 다룬다)'
);

select ok(
  (select not public from storage.buckets where id = 'file-collection'),
  '전용 버킷은 비공개다'
);

select ok(
  app.module_external_record('file_collection_responses')
  and app.module_external_record('file_collection_files')
  and app.module_external_record('file_collection_comments'),
  '응답·파일·코멘트는 외부 유입 기록이라 모듈 하드 삭제를 막는다'
);

select ok(
  app.module_external_record('application_submissions') and app.module_external_record('application_answers'),
  '기존 모집 2종의 외부기록 판정은 그대로다'
);

select ok(
  exists (select 1 from app.module_content_tables('program_modules') where rel_name = 'file_collection_responses'),
  '신규 하위표는 program_module_id FK로 모듈 내용물 카탈로그에 잡힌다'
);

-- 판정 헬퍼는 RLS 정책 안에서 **호출자 권한으로** 평가된다 — EXECUTE가 없으면 SELECT가 막힌다.
select ok(
  has_function_privilege('authenticated', 'app.file_collection_guest_assignment_ids()', 'EXECUTE')
  and has_function_privilege('authenticated', 'app.file_collection_internal_read(uuid)', 'EXECUTE')
  and has_function_privilege('authenticated', 'app.file_collection_internal_write(uuid)', 'EXECUTE')
  and has_function_privilege('authenticated', 'app.file_collection_guest_writable_assignment_ids()', 'EXECUTE'),
  '판정 헬퍼는 authenticated가 실행할 수 있다(정책이 호출자 권한으로 평가되기 때문)'
);

select ok(
  not has_function_privilege('anon', 'app.file_collection_guest_assignment_ids()', 'EXECUTE')
  and not has_function_privilege('anon', 'public.file_collection_submit(uuid)', 'EXECUTE'),
  'anon은 헬퍼도 RPC도 실행할 수 없다'
);

-- 원자적 재정렬 RPC도 같은 폭이다 — authenticated만 실행하고 PUBLIC·anon은 회수됐다.
select ok(
  has_function_privilege('authenticated', 'public.file_collection_reorder_node(uuid, text)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.file_collection_reorder_node(uuid, text)', 'EXECUTE'),
  '형제 순서 이동 RPC는 authenticated만 실행할 수 있다(anon 회수)'
);

-- ---------------------------------------------------------------------
-- (1) 내부 — 허용 한 쌍과 거절 한 쌍
-- ---------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims',
  '{"app_user_id":"a1000000-0000-0000-0000-000000000001","session_version":1}', true);

select lives_ok(
  $$select public.file_collection_upsert('a5000000-0000-0000-0000-000000000001', '자료 제출', '안내문')$$,
  '사업 담당자는 모듈에 파일받기 초안을 세운다(모듈이 준비여도 초안은 가능)'
);

select throws_ok(
  $$select public.file_collection_upsert('a5000000-0000-0000-0000-000000000003', '엉뚱한 모듈')$$,
  '42501', null,
  '파일받기가 아닌 모듈에는 세울 수 없다'
);

select set_config('request.jwt.claims',
  '{"app_user_id":"a1000000-0000-0000-0000-000000000002","session_version":1}', true);
select throws_ok(
  $$select public.file_collection_upsert('a5000000-0000-0000-0000-000000000001', '남의 사업')$$,
  '42501', null,
  '다른 워크스페이스(FUND) 사용자는 초안을 세울 수 없다'
);

select set_config('request.jwt.claims',
  '{"app_user_id":"a1000000-0000-0000-0000-000000000004","session_version":1}', true);
select throws_ok(
  $$select public.file_collection_upsert('a5000000-0000-0000-0000-000000000001', '열람자가 쓴다')$$,
  '42501', null,
  '읽기 전용 내부 사용자는 쓸 수 없다'
);
select is(
  (select count(*)::int from public.file_collections),
  1,
  '읽기 전용 내부 사용자도 읽기는 된다(RLS SELECT가 실제로 실행된다)'
);

select set_config('request.jwt.claims',
  '{"app_user_id":"a1000000-0000-0000-0000-000000000001","session_version":1}', true);

-- 트리: 폴더 하나 + 그 아래 문항 둘(하나는 필수)
select lives_ok(
  $$select public.file_collection_save_node(
      p_collection_id => (select id from public.file_collections where program_module_id = 'a5000000-0000-0000-0000-000000000001'),
      p_node_type => 'FOLDER', p_title => '1. 재무')$$,
  '폴더를 만든다'
);

select lives_ok(
  $$select public.file_collection_save_node(
      p_collection_id => (select id from public.file_collections limit 1),
      p_parent_id => (select id from public.file_collection_nodes where node_type = 'FOLDER' limit 1),
      p_node_type => 'QUESTION', p_title => '재무제표', p_is_required => true)$$,
  '폴더 아래 필수 문항을 만든다'
);

select lives_ok(
  $$select public.file_collection_save_node(
      p_collection_id => (select id from public.file_collections limit 1),
      p_parent_id => (select id from public.file_collection_nodes where node_type = 'FOLDER' limit 1),
      p_node_type => 'QUESTION', p_title => '참고자료', p_is_required => false)$$,
  '선택 문항을 하나 더 만든다'
);

select throws_ok(
  $$select public.file_collection_save_node(
      p_collection_id => (select id from public.file_collections limit 1),
      p_parent_id => (select id from public.file_collection_nodes where title = '재무제표'),
      p_node_type => 'QUESTION', p_title => '문항 밑의 문항')$$,
  'P0001', null,
  '문항(잎) 아래에는 자식을 둘 수 없다'
);

select throws_ok(
  $$update public.file_collection_nodes
       set parent_id = (select id from public.file_collection_nodes where title = '재무제표')
     where title = '1. 재무'$$,
  '42501', null,
  '담당자도 직접 DML로는 트리를 못 고친다(테이블 권한 없음)'
);

-- 형제 순서 이동(file_collection_reorder_node) — 한 호출로 실제 순서가 바뀌는가.
-- 기준 자리를 분명히 세워 둔다(두 문항 모두 기본값 0이면 무엇이 앞인지 id가 답하게 된다).
select public.file_collection_move_node(
  (select id from public.file_collection_nodes where title = '재무제표'),
  (select id from public.file_collection_nodes where title = '1. 재무'), 10);
select public.file_collection_move_node(
  (select id from public.file_collection_nodes where title = '참고자료'),
  (select id from public.file_collection_nodes where title = '1. 재무'), 20);

select is(
  (select string_agg(n.title, ',' order by n.sort_order, n.id)
     from public.file_collection_nodes n
    where n.parent_id = (select id from public.file_collection_nodes where title = '1. 재무')
      and n.deleted_at is null),
  '재무제표,참고자료',
  '재정렬 전 형제 순서는 재무제표 → 참고자료다'
);

select is(
  (select public.file_collection_reorder_node(
     (select id from public.file_collection_nodes where title = '재무제표'), 'down')),
  true,
  '아래로 한 칸 내리기는 한 번의 호출로 끝난다'
);

select is(
  (select string_agg(n.title, ',' order by n.sort_order, n.id)
     from public.file_collection_nodes n
    where n.parent_id = (select id from public.file_collection_nodes where title = '1. 재무')
      and n.deleted_at is null),
  '참고자료,재무제표',
  '한 번의 호출로 형제의 실제 순서가 맞바뀐다'
);

select is(
  (select string_agg(n.sort_order::text, ',' order by n.sort_order, n.id)
     from public.file_collection_nodes n
    where n.parent_id = (select id from public.file_collection_nodes where title = '1. 재무')
      and n.deleted_at is null),
  '1,2',
  '형제의 sort_order는 같은 트랜잭션에서 1..n으로 다시 매겨진다(빈 칸·중복 없음)'
);

select is(
  (select public.file_collection_reorder_node(
     (select id from public.file_collection_nodes where title = '참고자료'), 'up')),
  false,
  '맨 위에서 위로는 오류가 아니라 무변화(false)다'
);

select is(
  (select string_agg(n.title, ',' order by n.sort_order, n.id)
     from public.file_collection_nodes n
    where n.parent_id = (select id from public.file_collection_nodes where title = '1. 재무')
      and n.deleted_at is null),
  '참고자료,재무제표',
  '무변화 호출은 순서를 건드리지 않는다'
);

select throws_ok(
  $$select public.file_collection_reorder_node(
      (select id from public.file_collection_nodes where title = '참고자료'), 'left')$$,
  'P0001', null,
  'up·down이 아닌 방향은 거절된다'
);

-- 원래 순서로 되돌려 둔다(뒤 단계는 재무제표가 앞인 트리를 전제한다).
select is(
  (select public.file_collection_reorder_node(
     (select id from public.file_collection_nodes where title = '재무제표'), 'up')),
  true,
  '위로 한 칸 올리기로 원래 순서로 돌아온다'
);

select is(
  (select string_agg(n.title, ',' order by n.sort_order, n.id)
     from public.file_collection_nodes n
    where n.parent_id = (select id from public.file_collection_nodes where title = '1. 재무')
      and n.deleted_at is null),
  '재무제표,참고자료',
  '되돌린 뒤의 형제 순서가 처음과 같다'
);

select set_config('request.jwt.claims',
  '{"app_user_id":"a1000000-0000-0000-0000-000000000004","session_version":1}', true);
select throws_ok(
  $$select public.file_collection_reorder_node(
      (select id from public.file_collection_nodes where title = '재무제표'), 'down')$$,
  '42501', null,
  '읽기 전용 내부 사용자는 순서를 바꿀 수 없다'
);
select set_config('request.jwt.claims',
  '{"app_user_id":"a1000000-0000-0000-0000-000000000001","session_version":1}', true);

-- ---------------------------------------------------------------------
-- (2) 대상 — 고르지 않는다(2026-09-14). 명부가 대상을 정한다.
--     원장을 세우는 순간(file_collection_upsert) 명부의 유효한 게스트가 배정으로 선다.
-- ---------------------------------------------------------------------
select is(
  (select count(*)::int from public.file_collection_assignments
    where collection_id = (select id from public.file_collections
                            where program_module_id = 'a5000000-0000-0000-0000-000000000001')
      and revoked_at is null and deleted_at is null),
  2,
  '대상을 고르지 않아도 명부의 유효한 게스트 둘이 자동으로 선다'
);

select ok(
  not exists (
    select 1 from public.file_collection_assignments
     where guest_user_id in (
       'a2000000-0000-0000-0000-000000000003',  -- 로그인이 막힌 명부 줄
       'a2000000-0000-0000-0000-000000000004',  -- 다른 사업의 게스트
       'a2000000-0000-0000-0000-000000000006'   -- 비활성 계정
     )
  ),
  '로그인이 막힌 줄·다른 사업·비활성 계정은 자동 대상에서 빠진다'
);

select ok(
  not has_function_privilege('authenticated', 'app.fc_sync_targets(uuid)', 'EXECUTE')
  and not has_function_privilege('authenticated', 'app.fc_sync_assignments(uuid, uuid)', 'EXECUTE')
  and not has_function_privilege('anon', 'app.fc_sync_targets(uuid)', 'EXECUTE'),
  '대상 동기화 함수는 앱 롤이 직접 부를 수 없다(정의자 경로·트리거만 부른다)'
);

select throws_ok(
  $$select public.file_collection_assign(
      (select id from public.file_collections limit 1),
      array['a4000000-0000-0000-0000-000000000004'::uuid])$$,
  'P0001', null,
  '다른 사업의 게스트는 배정할 수 없다'
);

select throws_ok(
  $$select public.file_collection_assign(
      (select id from public.file_collections limit 1),
      array['a4000000-0000-0000-0000-000000000003'::uuid])$$,
  'P0001', null,
  '로그인이 막힌 명부 줄은 배정할 수 없다'
);

select throws_ok(
  $$select public.file_collection_assign(
      (select id from public.file_collections limit 1),
      array['a4000000-0000-0000-0000-000000000006'::uuid])$$,
  'P0001', null,
  '비활성 계정은 배정할 수 없다'
);

select is(
  (select public.file_collection_assign(
     (select id from public.file_collections limit 1),
     array['a4000000-0000-0000-0000-000000000001'::uuid, 'a4000000-0000-0000-0000-000000000002'::uuid])),
  2,
  '같은 사업의 유효한 게스트 둘을 일괄 배정한다'
);

select ok(
  (select public.file_collection_publish((select id from public.file_collections limit 1))) is not null,
  '문항과 대상이 있으면 공개된다'
);

select is(
  (select count(*)::int from public.file_collection_responses),
  4,
  '공개 시 (배정 2 × 문항 2)만큼 응답 칸이 미리 선다'
);

select throws_ok(
  $$select public.file_collection_save_node(
      p_collection_id => (select id from public.file_collections limit 1),
      p_node_type => 'QUESTION', p_title => '뒤늦은 문항')$$,
  'P0001', null,
  '공개 뒤에는 문항을 더할 수 없다(트리 잠금)'
);

select throws_ok(
  $$select public.file_collection_move_node(
      (select id from public.file_collection_nodes where title = '재무제표'), null, 0)$$,
  'P0001', null,
  '공개 뒤에는 문항을 옮길 수 없다'
);

select throws_ok(
  $$select public.file_collection_delete_node(
      (select id from public.file_collection_nodes where title = '참고자료'))$$,
  'P0001', null,
  '공개 뒤에는 문항을 지울 수 없다'
);

select throws_ok(
  $$select public.file_collection_reorder_node(
      (select id from public.file_collection_nodes where title = '재무제표'), 'down')$$,
  'P0001', null,
  '공개 뒤에는 형제 순서도 바꿀 수 없다(트리 잠금)'
);

-- 게스트는 이 경로에 아예 들어오지 못한다(공개 여부를 따지기 전에 권한에서 막힌다).
select set_config('request.jwt.claims',
  '{"app_user_id":"a2000000-0000-0000-0000-000000000001","session_version":1,'
  '"context_type":"program","context_id":"a3000000-0000-0000-0000-000000000001"}', true);
select throws_ok(
  $$select public.file_collection_reorder_node(
      (select id from public.file_collection_nodes where title = '재무제표'), 'down')$$,
  '42501', null,
  '게스트는 형제 순서를 바꿀 수 없다'
);
select set_config('request.jwt.claims',
  '{"app_user_id":"a1000000-0000-0000-0000-000000000001","session_version":1}', true);

-- 공개 이후에 더한 대상에게도 응답 칸이 바로 선다.
reset role;
insert into public.users (id, user_type, name, email, phone, session_version) values
  ('a2000000-0000-0000-0000-000000000005', 'temporary_guest', '추가 게스트', 'fc-g5@example.test', null, 1);
insert into public.program_participants (id, entity_key, program_id, user_id, login_status) values
  ('a4000000-0000-0000-0000-000000000005', 'program', 'a3000000-0000-0000-0000-000000000001',
   'a2000000-0000-0000-0000-000000000005', 'ACTIVE');
set local role authenticated;
select set_config('request.jwt.claims',
  '{"app_user_id":"a1000000-0000-0000-0000-000000000001","session_version":1}', true);

select is(
  (select count(*)::int from public.file_collection_assignments
    where guest_user_id = 'a2000000-0000-0000-0000-000000000005'
      and revoked_at is null and deleted_at is null),
  1,
  '명부에 게스트를 더하면 그 사업의 파일받기 대상이 곧바로 선다(트리거)'
);

select is(
  (select public.file_collection_assign(
     (select id from public.file_collections limit 1),
     array['a4000000-0000-0000-0000-000000000005'::uuid])),
  1,
  '일괄 배정 이후에도 대상을 더할 수 있다'
);

select is(
  (select count(*)::int from public.file_collection_responses),
  6,
  '나중에 더한 대상에게도 응답 칸이 바로 선다'
);

-- ---------------------------------------------------------------------
-- (2-1) 문항 자료 — 담당자가 건네는 양식(공용 attachments, 20260914150000)
--       방향이 제출물과 반대다: 담당자가 붙이고 **배정된 사람 전원**이 같은 것을 읽는다.
-- ---------------------------------------------------------------------
select lives_ok(
  $$insert into public.attachments (target_type, target_id, program_module_id, file_name, storage_path)
    values ('file_collection_node',
            (select id from public.file_collection_nodes where title = '재무제표'),
            'a5000000-0000-0000-0000-000000000001', '양식.xlsx', 'file_collection_node/x/양식.xlsx')$$,
  '사업 쓰기 권한자는 문항에 자료를 붙인다'
);

select throws_ok(
  $$insert into public.attachments (target_type, target_id, program_module_id, file_name, storage_path)
    values ('file_collection_node',
            (select id from public.file_collection_nodes where title = '1. 재무'),
            'a5000000-0000-0000-0000-000000000001', '폴더양식.xlsx', 'file_collection_node/y/폴더양식.xlsx')$$,
  '42501', null,
  '폴더 마디에는 붙일 수 없다(받는 쪽이 여는 자리는 문항뿐이다)'
);

select throws_ok(
  $$insert into public.attachments (target_type, target_id, program_module_id, file_name, storage_path)
    values ('file_collection_node',
            (select id from public.file_collection_nodes where title = '재무제표'),
            'a5000000-0000-0000-0000-000000000002', '엉뚱한모듈.xlsx', 'file_collection_node/z/엉뚱.xlsx')$$,
  '42501', null,
  '귀속 칸 둘이 어긋나면(문항과 다른 모듈) 거절한다'
);

select set_config('request.jwt.claims',
  '{"app_user_id":"a1000000-0000-0000-0000-000000000004","session_version":1}', true);
select throws_ok(
  $$insert into public.attachments (target_type, target_id, program_module_id, file_name, storage_path)
    values ('file_collection_node',
            (select id from public.file_collection_nodes where title = '재무제표'),
            'a5000000-0000-0000-0000-000000000001', '열람자.xlsx', 'file_collection_node/r/열람자.xlsx')$$,
  '42501', null,
  '읽기 전용 내부 사용자는 문항 자료를 붙일 수 없다'
);

select set_config('request.jwt.claims',
  '{"app_user_id":"a1000000-0000-0000-0000-000000000002","session_version":1}', true);
select is(
  (select count(*)::int from public.attachments where target_type = 'file_collection_node'),
  0,
  '다른 워크스페이스(FUND) 사용자에게는 그 문항 자료가 보이지도 않는다'
);

select set_config('request.jwt.claims',
  '{"app_user_id":"a2000000-0000-0000-0000-000000000001","session_version":1,'
  '"context_type":"program","context_id":"a3000000-0000-0000-0000-000000000001"}', true);
select is(
  (select count(*)::int from public.attachments where target_type = 'file_collection_node'),
  1,
  '배정된 게스트는 문항에 붙은 자료를 읽는다'
);

select set_config('request.jwt.claims',
  '{"app_user_id":"a2000000-0000-0000-0000-000000000004","session_version":1,'
  '"context_type":"program","context_id":"a3000000-0000-0000-0000-000000000002"}', true);
select is(
  (select count(*)::int from public.attachments where target_type = 'file_collection_node'),
  0,
  '배정이 없는 게스트에게는 문항 자료가 보이지 않는다(모듈 메뉴가 열려 있어도)'
);

select set_config('request.jwt.claims',
  '{"app_user_id":"a1000000-0000-0000-0000-000000000001","session_version":1}', true);

-- ---------------------------------------------------------------------
-- (3) 게스트 — 자기 것만 보이고, 자기 것만 쓴다
-- ---------------------------------------------------------------------
select set_config('request.jwt.claims',
  '{"app_user_id":"a2000000-0000-0000-0000-000000000001","session_version":1,'
  '"context_type":"program","context_id":"a3000000-0000-0000-0000-000000000001"}', true);

select is(
  (select count(*)::int from public.file_collection_assignments),
  1,
  '게스트에게는 자기 배정 한 줄만 보인다(다른 게스트의 명부는 보이지 않는다)'
);

select is(
  (select count(*)::int from public.file_collection_responses),
  2,
  '게스트에게는 자기 응답 칸 둘만 보인다'
);

select is(
  (select count(*)::int from public.file_collection_nodes),
  3,
  '게스트는 배포된 트리(폴더 1 + 문항 2)를 읽는다'
);

select lives_ok(
  $$select * from public.file_collection_register_upload(
      (select r.id from public.file_collection_responses r
         join public.file_collection_nodes n on n.id = r.node_id
        where n.title = '재무제표'),
      '재무제표.pdf', 'application/pdf', 1024)$$,
  '게스트가 자기 문항에 업로드를 등록한다'
);

select is(
  (select f.storage_path like 'a5000000-0000-0000-0000-000000000001/%/r1/%'
     from public.file_collection_files f limit 1),
  true,
  '경로는 서버가 만든다(모듈/배정/응답/회차 아래)'
);

select is(
  (select status from public.file_collection_files limit 1),
  'PENDING',
  '등록 직후는 PENDING이다(실물 확인 전에는 제출로 치지 않는다)'
);

select throws_ok(
  $$select public.file_collection_submit(
      (select r.id from public.file_collection_responses r
         join public.file_collection_nodes n on n.id = r.node_id where n.title = '재무제표'))$$,
  'P0001', null,
  'PENDING만 있으면 제출이 막힌다(업로드 실패를 숨기지 않는다)'
);

-- 실물이 없으면 확정되지 않는다 — 크기를 스스로 신고해 READY로 만드는 길이 없다.
select throws_ok(
  $$select public.file_collection_commit_upload((select id from public.file_collection_files limit 1))$$,
  'P0001', null,
  'storage에 실물이 없으면 확정할 수 없다(크기 위조 불가)'
);

reset role;
insert into storage.objects (bucket_id, name, metadata)
select 'file-collection', f.storage_path, jsonb_build_object('size', 999, 'mimetype', 'application/pdf')
  from public.file_collection_files f where f.original_name = '재무제표.pdf';
set local role authenticated;
select set_config('request.jwt.claims',
  '{"app_user_id":"a2000000-0000-0000-0000-000000000001","session_version":1,'
  '"context_type":"program","context_id":"a3000000-0000-0000-0000-000000000001"}', true);

select throws_ok(
  $$select public.file_collection_commit_upload((select id from public.file_collection_files limit 1))$$,
  'P0001', null,
  '실물 크기가 신고값과 다르면 확정을 막는다'
);

reset role;
update storage.objects set metadata = jsonb_build_object('size', 1024, 'mimetype', 'application/pdf')
 where bucket_id = 'file-collection';
set local role authenticated;
select set_config('request.jwt.claims',
  '{"app_user_id":"a2000000-0000-0000-0000-000000000001","session_version":1,'
  '"context_type":"program","context_id":"a3000000-0000-0000-0000-000000000001"}', true);

select lives_ok(
  $$select public.file_collection_commit_upload((select id from public.file_collection_files limit 1))$$,
  '실물이 있고 크기가 맞으면 READY로 확정된다'
);

select is(
  (select byte_size from public.file_collection_files limit 1),
  1024::bigint,
  '확정된 크기는 실물이 답한다(클라이언트 신고값이 아니다)'
);

select is(
  (select r.status::text from public.file_collection_responses r
     join public.file_collection_nodes n on n.id = r.node_id where n.title = '재무제표'),
  'DRAFT',
  '확정과 함께 응답 칸이 DRAFT가 된다'
);

-- 문항 단위 제출: 다른 필수 문항이 비어 있어도 이 문항은 제출된다.
select is(
  (select public.file_collection_submit(
     (select r.id from public.file_collection_responses r
        join public.file_collection_nodes n on n.id = r.node_id where n.title = '재무제표'))::text),
  'SUBMITTED',
  '문항 단위로 제출한다(다른 문항이 비어도 막히지 않는다)'
);

select is(
  (select count(*)::int from public.file_collection_responses where status = 'NOT_SUBMITTED'),
  1,
  '같은 배정의 다른 문항은 그대로 미제출로 남는다'
);

select throws_ok(
  $$select public.file_collection_submit(
      (select r.id from public.file_collection_responses r
         join public.file_collection_nodes n on n.id = r.node_id where n.title = '재무제표'))$$,
  'P0001', null,
  '이미 제출한 문항은 다시 제출되지 않는다'
);

select throws_ok(
  $$select * from public.file_collection_register_upload(
      (select r.id from public.file_collection_responses r
         join public.file_collection_nodes n on n.id = r.node_id where n.title = '재무제표'),
      '덮어쓰기.pdf', 'application/pdf', 10)$$,
  'P0001', null,
  '제출한 문항에는 파일을 더할 수 없다'
);

select throws_ok(
  $$select public.file_collection_remove_file(
      (select id from public.file_collection_files where original_name = '재무제표.pdf'))$$,
  'P0001', null,
  '제출한 문항의 파일은 게스트가 내릴 수 없다'
);

select throws_ok(
  $$insert into public.file_collection_files
      (response_id, round, storage_path, original_name, uploaded_by)
    values ((select id from public.file_collection_responses limit 1), 1, 'x/y', 'x.pdf',
            'a2000000-0000-0000-0000-000000000001')$$,
  '42501', null,
  '게스트는 표에 직접 INSERT할 수 없다'
);

-- 다른 게스트(같은 사업·같은 모듈)
select set_config('request.jwt.claims',
  '{"app_user_id":"a2000000-0000-0000-0000-000000000002","session_version":1,'
  '"context_type":"program","context_id":"a3000000-0000-0000-0000-000000000001"}', true);

select is(
  (select count(*)::int from public.file_collection_files),
  0,
  '같은 모듈의 다른 게스트에게는 남의 파일이 보이지 않는다'
);

select is(
  (select count(*)::int from public.file_collection_responses where status <> 'NOT_SUBMITTED'),
  0,
  '다른 게스트의 진행률(상태)도 보이지 않는다'
);

-- 아래 세 단언은 "남의 파일 id를 **알고 있어도** 막힌다"를 봐야 한다. 게스트 2로 바꾼 뒤에
-- 찾으면 RLS가 행을 가려 id가 null이 되고, RPC는 인가(42501)가 아니라 "없음"(P0001)으로
-- 답해 정작 인가 경계를 확인하지 못한다. 그래서 게스트 1의 파일 id를 **바꾸기 전에** 붙잡아
-- 둔다. 임시 표에는 RLS가 없으므로 게스트 2 세션에서도 그 id를 그대로 읽는다.
reset role;
create temp table fc_g1_file as
  select id from public.file_collection_files where original_name = '재무제표.pdf';
grant select on fc_g1_file to authenticated;

set local role authenticated;
select set_config('request.jwt.claims',
  '{"app_user_id":"a2000000-0000-0000-0000-000000000002","session_version":1,'
  '"context_type":"program","context_id":"a3000000-0000-0000-0000-000000000001"}', true);

select throws_ok(
  format($$select public.file_collection_commit_upload(%L)$$,
         (select id from fc_g1_file)),
  '42501', null,
  '남이 올린 파일을 대신 확정할 수 없다'
);

select throws_ok(
  format($$select public.file_collection_remove_file(%L)$$,
         (select id from fc_g1_file)),
  '42501', null,
  '남이 올린 파일을 대신 내릴 수 없다'
);

select throws_ok(
  format($$select * from public.file_collection_authorize_download(%L)$$,
         (select id from fc_g1_file)),
  '42501', null,
  '남의 파일은 다운로드 인가도 나지 않는다'
);

-- 세션 버전이 어긋난 토큰
select set_config('request.jwt.claims',
  '{"app_user_id":"a2000000-0000-0000-0000-000000000001","session_version":99,'
  '"context_type":"program","context_id":"a3000000-0000-0000-0000-000000000001"}', true);
select is(
  (select count(*)::int from public.file_collection_responses),
  0,
  '세션 버전이 어긋난 토큰에는 아무것도 보이지 않는다'
);

-- 다른 맥락으로 고정된 세션
select set_config('request.jwt.claims',
  '{"app_user_id":"a2000000-0000-0000-0000-000000000001","session_version":1,'
  '"context_type":"program","context_id":"a3000000-0000-0000-0000-000000000002"}', true);
select is(
  (select count(*)::int from public.file_collection_assignments),
  0,
  '다른 맥락으로 고정된 세션에서는 이 사업의 배정이 보이지 않는다'
);

-- 미인증
select set_config('request.jwt.claims', '{}', true);
select is(
  (select count(*)::int from public.file_collection_nodes),
  0,
  '미인증 세션에는 트리가 보이지 않는다'
);

-- ---------------------------------------------------------------------
-- (4) 보완요청 · 회차 · 보존 · 재제출
-- ---------------------------------------------------------------------
-- WORKS 담당자에게는 배정된 게스트 **전원**의 응답 칸이 보인다. 그러므로 여기서부터는
-- 문항 이름만으로 응답을 집으면 여러 줄이 잡힌다 — 배정(게스트)과 모듈로 함께 좁힌다.
-- LIMIT 1로 덮지 않는다. 어느 게스트의 줄을 보는지가 이 단언들의 내용이기 때문이다.
select set_config('request.jwt.claims',
  '{"app_user_id":"a1000000-0000-0000-0000-000000000001","session_version":1}', true);

select is(
  (select public.file_collection_review(
     (select r.id from public.file_collection_responses r
        join public.file_collection_nodes n on n.id = r.node_id
        join public.file_collection_assignments a on a.id = r.assignment_id
       where n.title = '재무제표'
         and a.guest_user_id = 'a2000000-0000-0000-0000-000000000001'
         and r.program_module_id = 'a5000000-0000-0000-0000-000000000001'),
     'REWORK_REQUESTED', '표지가 빠졌습니다')::text),
  'REWORK_REQUESTED',
  '담당자가 보완을 요청한다'
);

select is(
  (select r.round from public.file_collection_responses r
     join public.file_collection_nodes n on n.id = r.node_id
     join public.file_collection_assignments a on a.id = r.assignment_id
    where n.title = '재무제표'
      and a.guest_user_id = 'a2000000-0000-0000-0000-000000000001'
      and r.program_module_id = 'a5000000-0000-0000-0000-000000000001'),
  2,
  '보완요청은 회차를 올린다'
);

select is(
  (select count(*)::int from public.file_collection_files where round = 1 and deleted_at is null),
  1,
  '제출한 회차의 파일은 보존된다'
);

select is(
  (select count(*)::int from public.file_collection_comments where author_side = 'WORKS'),
  1,
  '검토 코멘트는 WORKS 쪽으로 기록된다'
);

-- 보완 요청으로 회차가 오른 뒤에는 **지난 회차 파일도 내릴 수 있다**(2026-09-14 사용자 지정).
-- 회차가 아니라 응답 칸의 상태가 가른다 — 문항이 아직 이쪽 손에 있는가만 본다.
-- 실제로 지우면 뒤따르는 단언(경로 불변·다운로드 인가)이 대상 파일을 잃으므로 세이브포인트로
-- 되돌린다. 확인하려는 것은 인가 판정이지 남는 상태가 아니다.
savepoint fc_remove_past_round;

select lives_ok(
  $$select public.file_collection_remove_file(
      (select id from public.file_collection_files where original_name = '재무제표.pdf'))$$,
  '보완 요청 중이면 WORKS도 지난 회차 파일을 내릴 수 있다'
);

select is(
  (select count(*)::int from public.file_collection_files
    where original_name = '재무제표.pdf' and deleted_at is not null),
  1,
  '내린 파일은 소프트 삭제로만 남는다(행은 지워지지 않는다)'
);

rollback to savepoint fc_remove_past_round;

select throws_ok(
  $$select public.file_collection_review(
      (select r.id from public.file_collection_responses r
         join public.file_collection_nodes n on n.id = r.node_id
         join public.file_collection_assignments a on a.id = r.assignment_id
        where n.title = '재무제표'
          and a.guest_user_id = 'a2000000-0000-0000-0000-000000000001'
          and r.program_module_id = 'a5000000-0000-0000-0000-000000000001'),
      'APPROVED')$$,
  'P0001', null,
  '이미 검토한 회차를 오래된 상태로 다시 검토할 수 없다'
);

-- 게스트 재제출(2회차)
select set_config('request.jwt.claims',
  '{"app_user_id":"a2000000-0000-0000-0000-000000000001","session_version":1,'
  '"context_type":"program","context_id":"a3000000-0000-0000-0000-000000000001"}', true);

select lives_ok(
  $$select * from public.file_collection_register_upload(
      (select r.id from public.file_collection_responses r
         join public.file_collection_nodes n on n.id = r.node_id where n.title = '재무제표'),
      '보완.pdf', 'application/pdf', 2048)$$,
  '보완요청 뒤에는 새 회차에 파일을 다시 올릴 수 있다'
);

select ok(
  (select storage_path like '%/r2/%' from public.file_collection_files where original_name = '보완.pdf'),
  '새 파일은 2회차 경로에 선다'
);

-- 참여자 쪽도 같다 — 보완 요청을 받은 문항에서는 앞서 낸 자료를 스스로 치울 수 있다.
-- (뒤 단언들이 1회차 파일을 다시 쓰므로 세이브포인트로 되돌린다.)
savepoint fc_guest_remove_past_round;

select lives_ok(
  $$select public.file_collection_remove_file(
      (select id from public.file_collection_files where original_name = '재무제표.pdf'))$$,
  '게스트도 보완 요청 중이면 지난 회차에 낸 자기 파일을 내릴 수 있다'
);

rollback to savepoint fc_guest_remove_past_round;

reset role;
insert into storage.objects (bucket_id, name, metadata)
select 'file-collection', f.storage_path, jsonb_build_object('size', 2048, 'mimetype', 'application/pdf')
  from public.file_collection_files f where f.original_name = '보완.pdf';
set local role authenticated;
select set_config('request.jwt.claims',
  '{"app_user_id":"a2000000-0000-0000-0000-000000000001","session_version":1,'
  '"context_type":"program","context_id":"a3000000-0000-0000-0000-000000000001"}', true);

select lives_ok(
  $$select public.file_collection_commit_upload(
      (select id from public.file_collection_files where original_name = '보완.pdf'))$$,
  '2회차 파일도 실물 확인 뒤 확정된다'
);

select is(
  (select public.file_collection_submit(
     (select r.id from public.file_collection_responses r
        join public.file_collection_nodes n on n.id = r.node_id where n.title = '재무제표'))::text),
  'SUBMITTED',
  '보완 파일로 다시 제출한다'
);

select set_config('request.jwt.claims',
  '{"app_user_id":"a1000000-0000-0000-0000-000000000001","session_version":1}', true);

select is(
  (select public.file_collection_review(
     (select r.id from public.file_collection_responses r
        join public.file_collection_nodes n on n.id = r.node_id
        join public.file_collection_assignments a on a.id = r.assignment_id
       where n.title = '재무제표'
         and a.guest_user_id = 'a2000000-0000-0000-0000-000000000001'
         and r.program_module_id = 'a5000000-0000-0000-0000-000000000001'),
     'APPROVED', '확인했습니다')::text),
  'APPROVED',
  '2회차를 승인한다'
);

select is(
  (select count(*)::int from public.file_collection_files where deleted_at is null),
  2,
  '1·2회차 파일이 모두 남는다'
);

-- ---------------------------------------------------------------------
-- (5) 모듈이 닫히면 읽기만 남는다
-- ---------------------------------------------------------------------
reset role;
update public.program_modules set status = 'CLOSED' where id = 'a5000000-0000-0000-0000-000000000001';
set local role authenticated;
select set_config('request.jwt.claims',
  '{"app_user_id":"a2000000-0000-0000-0000-000000000001","session_version":1,'
  '"context_type":"program","context_id":"a3000000-0000-0000-0000-000000000001"}', true);

select is(
  (select count(*)::int from public.file_collection_responses),
  2,
  '닫힌 모듈도 게스트는 읽을 수 있다'
);

select throws_ok(
  $$select * from public.file_collection_register_upload(
      (select r.id from public.file_collection_responses r
         join public.file_collection_nodes n on n.id = r.node_id where n.title = '참고자료'),
      '늦은파일.pdf', 'application/pdf', 10)$$,
  '42501', null,
  '닫힌 모듈에는 게스트가 쓸 수 없다'
);

select throws_ok(
  $$select public.file_collection_add_comment(
      (select id from public.file_collection_responses limit 1), '닫힌 뒤 댓글')$$,
  '42501', null,
  '닫힌 모듈에는 게스트가 댓글도 남길 수 없다'
);

select lives_ok(
  $$select * from public.file_collection_authorize_download(
      (select id from public.file_collection_files where original_name = '보완.pdf'))$$,
  '닫힌 모듈에서도 자기 파일의 다운로드 인가는 난다(읽기는 남는다)'
);

-- ---------------------------------------------------------------------
-- (6) 구조 무결성 — 순환 · 교차 모듈 · 자유 깊이 · 파일 메타 불변
-- ---------------------------------------------------------------------
reset role;

insert into public.file_collections (id, program_module_id, title)
values ('a6000000-0000-0000-0000-000000000001', 'a5000000-0000-0000-0000-000000000002', '다른 사업 파일받기');
insert into public.file_collection_nodes (id, collection_id, node_type, title)
values ('a7000000-0000-0000-0000-000000000001', 'a6000000-0000-0000-0000-000000000001', 'FOLDER', '상위');
insert into public.file_collection_nodes (id, collection_id, parent_id, node_type, title)
values ('a7000000-0000-0000-0000-000000000002', 'a6000000-0000-0000-0000-000000000001',
        'a7000000-0000-0000-0000-000000000001', 'FOLDER', '하위');

select throws_ok(
  $$update public.file_collection_nodes
       set parent_id = 'a7000000-0000-0000-0000-000000000002'
     where id = 'a7000000-0000-0000-0000-000000000001'$$,
  'P0001', null,
  '폴더를 자기 자손 아래로 옮기면 순환이므로 막는다'
);

select throws_ok(
  $$insert into public.file_collection_nodes (collection_id, parent_id, node_type, title)
    values ('a6000000-0000-0000-0000-000000000001',
            (select id from public.file_collection_nodes where title = '1. 재무'), 'QUESTION', '교차 부모')$$,
  'P0001', null,
  '다른 파일받기의 노드를 부모로 삼을 수 없다'
);

select throws_ok(
  $$insert into public.file_collection_responses (assignment_id, node_id)
    values ((select id from public.file_collection_assignments limit 1),
            'a7000000-0000-0000-0000-000000000002')$$,
  'P0001', null,
  '배정과 문항이 다른 파일받기면 응답을 꽂을 수 없다'
);

select throws_ok(
  $$update public.file_collection_files set storage_path = 'somewhere/else'
     where original_name = '재무제표.pdf'$$,
  'P0001', null,
  '업로드된 파일의 경로는 바꿀 수 없다(덮어쓰기 금지)'
);

-- 자유 깊이: 업무 상한을 두지 않는다. 70단계를 실제로 세워 본다.
select lives_ok(
  $tst$do $deep$
    declare v_parent uuid := 'a7000000-0000-0000-0000-000000000002'; v_id uuid; i integer;
    begin
      for i in 1..70 loop
        insert into public.file_collection_nodes (collection_id, parent_id, node_type, title)
        values ('a6000000-0000-0000-0000-000000000001', v_parent, 'FOLDER', '깊이 ' || i)
        returning id into v_id;
        v_parent := v_id;
      end loop;
    end
  $deep$$tst$,
  '트리 깊이에 업무 상한이 없다(70단계가 선다)'
);

select ok(
  (with recursive chain as (
     select id, 1 as depth from public.file_collection_nodes
      where id = 'a7000000-0000-0000-0000-000000000001'
     union all
     select n.id, c.depth + 1 from public.file_collection_nodes n join chain c on n.parent_id = c.id
   ) select max(depth) from chain) >= 65,
  '65단계를 넘는 깊이가 실제로 저장된다'
);

-- ---------------------------------------------------------------------
-- (7) 배정 생애 — 회수 · 복구 · 명부 제외
-- ---------------------------------------------------------------------
update public.program_participants set login_status = 'NOT_ALLOWED'
 where id = 'a4000000-0000-0000-0000-000000000005';

set local role authenticated;
select set_config('request.jwt.claims',
  '{"app_user_id":"a1000000-0000-0000-0000-000000000001","session_version":1}', true);

select lives_ok(
  $$select public.file_collection_revoke_assignment(
      (select id from public.file_collection_assignments
        where guest_user_id = 'a2000000-0000-0000-0000-000000000005'))$$,
  '명부가 정지된 대상의 배정도 회수할 수 있다'
);

select lives_ok(
  $$select public.file_collection_revoke_assignment(
      (select id from public.file_collection_assignments
        where guest_user_id = 'a2000000-0000-0000-0000-000000000002'))$$,
  '배정을 회수한다'
);

select set_config('request.jwt.claims',
  '{"app_user_id":"a2000000-0000-0000-0000-000000000002","session_version":1,'
  '"context_type":"program","context_id":"a3000000-0000-0000-0000-000000000001"}', true);
select is(
  (select count(*)::int from public.file_collection_responses),
  0,
  '회수된 게스트에게는 아무것도 보이지 않는다'
);

select set_config('request.jwt.claims',
  '{"app_user_id":"a1000000-0000-0000-0000-000000000001","session_version":1}', true);
select is(
  (select public.file_collection_assign(
     (select id from public.file_collections where program_module_id = 'a5000000-0000-0000-0000-000000000001'),
     array['a4000000-0000-0000-0000-000000000002'::uuid])),
  1,
  '회수한 대상을 다시 배정한다'
);

select is(
  (select count(*)::int from public.file_collection_assignments
    where collection_id = (select id from public.file_collections where program_module_id = 'a5000000-0000-0000-0000-000000000001')),
  3,
  '재배정은 같은 행을 되살린다(계정당 하나 — 배정 줄이 늘지 않는다)'
);

select set_config('request.jwt.claims',
  '{"app_user_id":"a2000000-0000-0000-0000-000000000002","session_version":1,'
  '"context_type":"program","context_id":"a3000000-0000-0000-0000-000000000001"}', true);
select is(
  (select count(*)::int from public.file_collection_responses),
  2,
  '재배정하면 이전 응답 칸이 그대로 다시 보인다'
);

-- 명부 제외(하드 삭제)가 제출물을 함께 지우지 않는다.
reset role;
create temp table fc_before_participant_delete as
  select (select count(*) from public.file_collection_files)     as files,
         (select count(*) from public.file_collection_comments)  as comments,
         (select count(*) from public.file_collection_responses) as responses;

select lives_ok(
  $$delete from public.program_participants where id = 'a4000000-0000-0000-0000-000000000002'$$,
  '명부 줄 하드 삭제가 배정 트리거 때문에 실패하지 않는다(FK가 연결만 끊는다)'
);

select is(
  (select participant_id from public.file_collection_assignments
    where guest_user_id = 'a2000000-0000-0000-0000-000000000002'),
  null,
  '명부 줄이 사라지면 배정의 명부 연결만 끊긴다(배정·제출물은 남는다)'
);

select is(
  (select count(*)::int from public.file_collection_assignments
    where guest_user_id = 'a2000000-0000-0000-0000-000000000002' and deleted_at is null),
  1,
  '배정 행 자체는 남는다(자료 이력 보존)'
);

select ok(
  (select revoked_at is not null from public.file_collection_assignments
    where guest_user_id = 'a2000000-0000-0000-0000-000000000002'),
  '명부 연결이 끊긴 배정은 즉시 회수 상태가 된다(접근 차단)'
);

select ok(
  (select b.files = (select count(*) from public.file_collection_files)
      and b.comments = (select count(*) from public.file_collection_comments)
      and b.responses = (select count(*) from public.file_collection_responses)
     from fc_before_participant_delete b),
  '명부 제외로 파일·코멘트·응답 행 수는 하나도 변하지 않는다'
);

select is(
  (select count(*)::int from public.file_collection_files where deleted_at is null),
  2,
  '명부 제외가 다른 게스트의 제출 파일을 지우지 않는다'
);

set local role authenticated;
select set_config('request.jwt.claims',
  '{"app_user_id":"a2000000-0000-0000-0000-000000000002","session_version":1,'
  '"context_type":"program","context_id":"a3000000-0000-0000-0000-000000000001"}', true);
select is(
  (select count(*)::int from public.file_collection_responses),
  0,
  '명부에서 빠진 게스트에게는 더 이상 열리지 않는다'
);

select is(
  (select count(*)::int from public.file_collection_assignments),
  0,
  '명부에서 빠진 게스트에게는 배정 자체가 보이지 않는다'
);

-- ---------------------------------------------------------------------
-- (8) 소프트 삭제
-- ---------------------------------------------------------------------
reset role;
select ok(
  not exists (
    select 1 from pg_policies
     where schemaname = 'public' and tablename like 'file_collection%' and cmd = 'DELETE'
  ),
  'DELETE 정책이 없다(소프트 삭제만 한다)'
);

-- 초안 트리는 부모·자식·손자까지 한 번에 소프트 삭제된다(부모가 먼저 지워져도 자손 UPDATE가 산다).
set local role authenticated;
select set_config('request.jwt.claims',
  '{"app_user_id":"a1000000-0000-0000-0000-000000000001","session_version":1}', true);

select public.file_collection_upsert('a5000000-0000-0000-0000-000000000002', '초안 트리');
select public.file_collection_save_node(
  p_collection_id => (select id from public.file_collections where program_module_id = 'a5000000-0000-0000-0000-000000000002'),
  p_node_type => 'FOLDER', p_title => '삭제 루트');
select public.file_collection_save_node(
  p_collection_id => (select id from public.file_collections where program_module_id = 'a5000000-0000-0000-0000-000000000002'),
  p_parent_id => (select id from public.file_collection_nodes where title = '삭제 루트'),
  p_node_type => 'FOLDER', p_title => '삭제 중간');
select public.file_collection_save_node(
  p_collection_id => (select id from public.file_collections where program_module_id = 'a5000000-0000-0000-0000-000000000002'),
  p_parent_id => (select id from public.file_collection_nodes where title = '삭제 중간'),
  p_node_type => 'QUESTION', p_title => '삭제 문항');

select is(
  (select public.file_collection_delete_node(
     (select id from public.file_collection_nodes where title = '삭제 루트'))),
  3,
  '초안 루트를 지우면 자식·손자까지 세 줄이 함께 소프트 삭제된다'
);

reset role;
select ok(
  not exists (
    select 1 from public.file_collection_nodes
     where title in ('삭제 루트', '삭제 중간', '삭제 문항') and deleted_at is null
  ),
  '부모·자식·손자 모두 deleted_at이 채워진다'
);

select is(
  (select count(*)::int from public.file_collection_nodes
    where title in ('삭제 루트', '삭제 중간', '삭제 문항')),
  3,
  '소프트 삭제라 물리 행은 그대로 남는다'
);

-- 명부 줄이 다른 사업으로 옮겨지면 옛 모듈의 배정은 되살아나지 않는다.
update public.program_participants
   set program_id = 'a3000000-0000-0000-0000-000000000002'
 where id = 'a4000000-0000-0000-0000-000000000001';

set local role authenticated;
select set_config('request.jwt.claims',
  '{"app_user_id":"a2000000-0000-0000-0000-000000000001","session_version":1,'
  '"context_type":"program","context_id":"a3000000-0000-0000-0000-000000000001"}', true);

select is(
  (select count(*)::int from public.file_collection_assignments),
  0,
  '명부 맥락이 다른 사업으로 옮겨지면 옛 모듈의 배정은 보이지 않는다'
);

select is(
  (select count(*)::int from public.file_collection_responses),
  0,
  '맥락이 어긋난 배정으로는 응답도 보이지 않는다'
);

reset role;
select finish();
rollback;
