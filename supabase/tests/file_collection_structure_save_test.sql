-- =====================================================================
-- 파일받기 구성 저장(file_collection_save_structure) — 원자성·충돌·인가 회귀 (pgTAP)
-- 실행: node scripts/db-test/run-db-tests.mjs file_collection_structure_save_test.sql
--
-- 확인하는 것
--   · 인가: 사업 담당자만 저장한다(읽기 전용·다른 워크스페이스·게스트·미인증은 거절)
--   · 원자성: 한 항목이라도 틀리면 **아무것도** 바뀌지 않는다(반쯤 저장된 트리가 없다)
--   · 충돌: 기존 마디의 기준 시각이 어긋나거나, 내가 못 본 마디가 서버에 있으면 40001
--   · 보존: 기존 마디의 id는 그대로다(이름·자리·종류가 바뀌어도) — 응답·파일이 그 id를 본다
--   · 동명: 이름이 같은 형제도 서로 다른 가지로 남는다(이름으로 합치지 않는다)
--   · 종류 전환: 자식을 잃은 폴더는 문항이 되고, 자식이 생긴 문항은 폴더가 된다(한 호출 안에서)
--   · 삭제: 명시한 것만 소프트 삭제된다(빠뜨림이 삭제가 되지 않는다)
--   · 들쭉날쭉: 얕은 문항과 깊은 가지가 한 트리에 함께 산다(깊이를 강요하지 않는다)
--   · 잠금: 공개된 파일받기의 구성은 통째로 불변이다(단계 이름까지)
--
-- 동시성(두 세션이 같은 collection을 동시에 잡는 경합)은 단일 세션 pgTAP으로 재현할 수 없어
-- **미검증**이다. 여기서는 같은 행을 FOR UPDATE로 잡는 경로와 버전 대조만 확인한다.
-- =====================================================================

begin;
select plan(54);

-- ---------------------------------------------------------------------
-- 셋업
-- ---------------------------------------------------------------------
insert into public.users (id, user_type, name, email, session_version) values
  ('b1000000-0000-0000-0000-000000000001', 'read_only', 'PROJECT 담당자', null, 1),
  ('b1000000-0000-0000-0000-000000000002', 'read_only', 'PROJECT 열람자', null, 1),
  ('b1000000-0000-0000-0000-000000000003', 'read_only', 'FUND 담당자',    null, 1);

insert into public.workspace_permissions (user_id, workspace_key, permission_level, scope_type) values
  ('b1000000-0000-0000-0000-000000000001', 'project', 'write', 'global'),
  ('b1000000-0000-0000-0000-000000000002', 'project', 'read',  'global'),
  ('b1000000-0000-0000-0000-000000000003', 'fund',    'write', 'global');

insert into public.users (id, user_type, name, email, phone, session_version, is_active) values
  ('b2000000-0000-0000-0000-000000000001', 'temporary_guest', '게스트', 'fcs-g1@example.test',
   '01053000001', 1, true);

insert into public.programs (id, title) values
  ('b3000000-0000-0000-0000-000000000001', '구성 저장 사업');

insert into public.program_managers (program_id, user_id, role, allocation_rate, start_date, end_date) values
  ('b3000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000001', 'PM', 100,
   current_date, current_date + 365);

insert into public.program_participants (id, entity_key, program_id, user_id, login_status) values
  ('b4000000-0000-0000-0000-000000000001', 'program', 'b3000000-0000-0000-0000-000000000001',
   'b2000000-0000-0000-0000-000000000001', 'ACTIVE');

insert into public.program_modules (id, entity_key, program_id, module_type, enabled, status, visibility) values
  ('b5000000-0000-0000-0000-000000000001', 'program', 'b3000000-0000-0000-0000-000000000001',
   'FILE_COLLECTION', true, 'OPEN', 'GUEST_ONLY'),
  ('b5000000-0000-0000-0000-000000000002', 'program', 'b3000000-0000-0000-0000-000000000001',
   'FILE_COLLECTION', true, 'OPEN', 'GUEST_ONLY');

-- 파일받기 머리 행 둘. 아래 도우미들이 id를 이 표에서 읽으므로 **RLS가 가리는 세션에서도**
-- 같은 대상을 가리킨다 — 게스트·미인증 거절을 볼 때 대상이 null로 바뀌면 인가가 아니라
-- '없음'을 확인하게 된다.
insert into public.file_collections (id, program_module_id, title) values
  ('b6000000-0000-0000-0000-000000000001', 'b5000000-0000-0000-0000-000000000001', '정산 자료'),
  ('b6000000-0000-0000-0000-000000000002', 'b5000000-0000-0000-0000-000000000002', '옆 모듈');

-- 페이로드 한 칸. 기존 마디는 **지금 원장의 updated_at**을 기준 시각으로 싣는다.
create or replace function pg_temp.item(
  p_key text,
  p_parent text,
  p_node uuid,
  p_type text,
  p_title text,
  p_required boolean default false,
  p_guide text default null
) returns jsonb language sql as $$
  select jsonb_build_object(
    'key', p_key,
    'parent_key', p_parent,
    'node_id', p_node,
    'node_type', p_type,
    'title', p_title,
    'is_required', p_required,
    'guide', p_guide,
    'expected_updated_at',
      (select n.updated_at from public.file_collection_nodes n where n.id = p_node)
  );
$$;

create or replace function pg_temp.del(p_node uuid) returns jsonb language sql as $$
  select jsonb_build_object(
    'node_id', p_node,
    'expected_updated_at',
      (select n.updated_at from public.file_collection_nodes n where n.id = p_node));
$$;

/**
 * 지금 트리 전체를 **부모가 먼저 오는 순서**로 편 페이로드.
 * p_stale_title을 주면 그 이름의 마디만 기준 시각을 옛날 값으로 싣는다(충돌 시험용).
 */
create or replace function pg_temp.full_payload(p_stale_title text default null)
returns jsonb language sql as $$
  with recursive t as (
    select n.id, n.parent_id, n.node_type, n.title, n.guide, n.is_required, n.sort_order,
           n.updated_at, 0 as lvl
      from public.file_collection_nodes n
     where n.collection_id = 'b6000000-0000-0000-0000-000000000001'
       and n.parent_id is null and n.deleted_at is null
    union all
    select c.id, c.parent_id, c.node_type, c.title, c.guide, c.is_required, c.sort_order,
           c.updated_at, t.lvl + 1
      from public.file_collection_nodes c
      join t on c.parent_id = t.id
     where c.deleted_at is null
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'key', t.id::text,
           'parent_key', t.parent_id::text,
           'node_id', t.id::text,
           'node_type', t.node_type,
           'title', t.title,
           'is_required', t.is_required,
           'guide', t.guide,
           'expected_updated_at',
             case when t.title = p_stale_title then '2020-01-01T00:00:00Z'
                  else t.updated_at::text end
         ) order by t.lvl, t.sort_order, t.id), '[]'::jsonb)
    from t;
$$;

-- ---------------------------------------------------------------------
-- (0) 계약 — 실행 권한과 열
-- ---------------------------------------------------------------------
select ok(
  has_function_privilege('authenticated',
    'public.file_collection_save_structure(uuid, jsonb, jsonb, text[], timestamptz)', 'EXECUTE'),
  '구성 저장 RPC는 authenticated가 실행할 수 있다'
);

select ok(
  not has_function_privilege('anon',
    'public.file_collection_save_structure(uuid, jsonb, jsonb, text[], timestamptz)', 'EXECUTE'),
  'anon은 구성 저장 RPC를 실행할 수 없다'
);

select ok(
  not has_function_privilege('authenticated', 'app.fc_structure_items(jsonb)', 'EXECUTE')
  and not has_function_privilege('anon', 'app.fc_structure_items(jsonb)', 'EXECUTE'),
  '페이로드 판독기는 앱 롤이 직접 실행하지 못한다(정의자만 부른다)'
);

-- 새 RPC 하나만 보지 않고 **파일받기 함수 전체**를 본다 — 권한이 새는 자리는 언제나
-- "이번에 더한 그 함수" 밖에서 생긴다. anon은 PUBLIC을 물려받으므로 이 한 줄이 둘을 함께 막는다.
select is(
  (select count(*)::int
     from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname like 'file_collection%'
      and has_function_privilege('anon', p.oid, 'EXECUTE')),
  0,
  '파일받기 RPC 전체에 anon·PUBLIC 실행 권한이 없다'
);

select has_column('public', 'file_collections', 'level_names', '단계 이름 열이 원장에 있다');

select ok(
  (select is_nullable = 'NO' from information_schema.columns
    where table_schema = 'public' and table_name = 'file_collections' and column_name = 'level_names'),
  '단계 이름 열은 NOT NULL이다(기본값 빈 배열)'
);

-- ---------------------------------------------------------------------
-- (1) 허용 경로 — 한 번의 호출로 트리와 단계 이름이 함께 선다
-- ---------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims',
  '{"app_user_id":"b1000000-0000-0000-0000-000000000001","session_version":1}', true);

select lives_ok(
  $$select public.file_collection_save_structure(
      p_collection_id => 'b6000000-0000-0000-0000-000000000001',
      p_nodes => jsonb_build_array(
        pg_temp.item('k1', null, null, 'FOLDER',   '재무'),
        pg_temp.item('k2', 'k1', null, 'QUESTION', '재무제표', true, '최근 3개년'),
        pg_temp.item('k3', 'k1', null, 'QUESTION', '주주명부', false, null)),
      p_level_names => array['분류','문항'])$$,
  '담당자가 폴더 하나와 문항 둘을 한 번에 세운다'
);

select is(
  (select count(*)::int from public.file_collection_nodes where deleted_at is null),
  3,
  '세 줄이 섰다'
);

select is(
  (select string_agg(n.title, ',' order by n.sort_order, n.id)
     from public.file_collection_nodes n
    where n.parent_id = (select id from public.file_collection_nodes where title = '재무')
      and n.deleted_at is null),
  '재무제표,주주명부',
  '자식은 페이로드 순서대로 선다'
);

select is(
  (select string_agg(n.sort_order::text, ',' order by n.sort_order, n.id)
     from public.file_collection_nodes n
    where n.parent_id = (select id from public.file_collection_nodes where title = '재무')
      and n.deleted_at is null),
  '1,2',
  '형제의 sort_order는 서버가 1..n으로 매긴다'
);

select is(
  (select node_type from public.file_collection_nodes where title = '재무'),
  'FOLDER',
  '자식이 있는 줄은 폴더로 선다'
);

select is(
  (select node_type from public.file_collection_nodes where title = '재무제표'),
  'QUESTION',
  '잎은 문항으로 선다'
);

select is(
  (select is_required from public.file_collection_nodes where title = '재무제표'),
  true,
  '필수 여부가 그대로 저장된다'
);

select is(
  (select guide from public.file_collection_nodes where title = '재무제표'),
  '최근 3개년',
  '문항 안내가 그대로 저장된다'
);

select is(
  (select level_names from public.file_collections where id = 'b6000000-0000-0000-0000-000000000001'),
  array['분류','문항'],
  '단계 이름이 원장에 남는다'
);

-- ---------------------------------------------------------------------
-- (2) id 보존 · 동명 형제 · 순서 바꾸기
-- ---------------------------------------------------------------------
reset role;
create temp table fc_ids as
  select id, title from public.file_collection_nodes where deleted_at is null;
grant select on fc_ids to authenticated;

/** 처음 세운 세 줄 중 그 이름의 마디(동명 가지가 생겨도 원래 줄을 가리킨다). */
create or replace function pg_temp.old_id(p_title text) returns uuid language sql as $$
  select o.id from fc_ids o where o.title = p_title limit 1;
$$;

/** 나중에 더한 마디(처음 세 줄에 없는 것). */
create or replace function pg_temp.new_id(p_title text) returns uuid language sql as $$
  select n.id from public.file_collection_nodes n
   where n.title = p_title and n.deleted_at is null
     and not exists (select 1 from fc_ids o where o.id = n.id)
   limit 1;
$$;

set local role authenticated;
select set_config('request.jwt.claims',
  '{"app_user_id":"b1000000-0000-0000-0000-000000000001","session_version":1}', true);

select lives_ok(
  $$select public.file_collection_save_structure(
      p_collection_id => 'b6000000-0000-0000-0000-000000000001',
      p_nodes => jsonb_build_array(
        pg_temp.item('k1', null, pg_temp.old_id('재무'),     'FOLDER',   '재무 자료'),
        pg_temp.item('k3', 'k1', pg_temp.old_id('주주명부'), 'QUESTION', '주주명부'),
        pg_temp.item('k2', 'k1', pg_temp.old_id('재무제표'), 'QUESTION', '재무제표', true, '최근 3개년'),
        pg_temp.item('k4', null, null, 'FOLDER',   '재무 자료'),
        pg_temp.item('k5', 'k4', null, 'QUESTION', '재무제표')))$$,
  '이름을 고치고 순서를 바꾸며 같은 이름의 가지를 하나 더 세운다'
);

select is(
  (select count(*)::int from public.file_collection_nodes n
     join fc_ids o on o.id = n.id
    where n.deleted_at is null),
  3,
  '기존 세 줄의 id가 그대로 살아 있다(이름을 고쳐도 새로 만들지 않는다)'
);

select is(
  (select count(*)::int from public.file_collection_nodes where title = '재무 자료' and deleted_at is null),
  2,
  '이름이 같은 형제 폴더 둘이 각자 남는다(이름으로 합치지 않는다)'
);

select is(
  (select count(*)::int from public.file_collection_nodes where title = '재무제표' and deleted_at is null),
  2,
  '이름이 같은 문항도 가지마다 따로 선다'
);

select is(
  (select string_agg(n.title, ',' order by n.sort_order, n.id)
     from public.file_collection_nodes n
    where n.parent_id = pg_temp.old_id('재무') and n.deleted_at is null),
  '주주명부,재무제표',
  '형제 순서가 페이로드 순서대로 바뀐다(같은 id로)'
);

select is(
  (select count(*)::int from public.file_collection_nodes where deleted_at is null),
  5,
  '새 가지 둘이 더해져 다섯 줄이다'
);

-- ---------------------------------------------------------------------
-- (3) 원자성 — 한 항목이라도 틀리면 아무것도 바뀌지 않는다
-- ---------------------------------------------------------------------
reset role;
create temp table fc_before as
  select id, title, parent_id, node_type, sort_order, is_required
    from public.file_collection_nodes where deleted_at is null;
grant select on fc_before to authenticated;
set local role authenticated;
select set_config('request.jwt.claims',
  '{"app_user_id":"b1000000-0000-0000-0000-000000000001","session_version":1}', true);

select throws_ok(
  $$select public.file_collection_save_structure(
      p_collection_id => 'b6000000-0000-0000-0000-000000000001',
      p_nodes => jsonb_build_array(
        pg_temp.item('k1', null, pg_temp.old_id('재무'), 'FOLDER',   '고친 이름'),
        pg_temp.item('k9', 'k1', null, 'QUESTION', '   ')))$$,
  'P0001', null,
  '이름이 빈 항목이 하나라도 있으면 저장이 거절된다'
);

select is(
  (select count(*)::int from public.file_collection_nodes n
     join fc_before b on b.id = n.id
    where n.title = b.title and n.parent_id is not distinct from b.parent_id
      and n.node_type = b.node_type and n.sort_order = b.sort_order and n.deleted_at is null),
  5,
  '거절된 저장은 앞선 항목의 이름·자리도 바꾸지 않는다(반쯤 저장이 없다)'
);

select throws_ok(
  $$select public.file_collection_save_structure(
      p_collection_id => 'b6000000-0000-0000-0000-000000000001',
      p_nodes => jsonb_build_array(
        pg_temp.item('k1', 'k2', null, 'FOLDER', '뒤엉킨 부모'),
        pg_temp.item('k2', null, null, 'FOLDER', '나중에 오는 부모')))$$,
  'P0001', null,
  '상위 항목이 목록에서 뒤에 있으면 거절된다(순환·유령 부모를 함께 막는다)'
);

select throws_ok(
  $$select public.file_collection_save_structure(
      p_collection_id => 'b6000000-0000-0000-0000-000000000001',
      p_nodes => jsonb_build_array(
        pg_temp.item('k1', null, null, 'QUESTION', '문항인데 자식이 있다'),
        pg_temp.item('k2', 'k1', null, 'QUESTION', '자식')))$$,
  'P0001', null,
  '문항 아래에 항목을 두는 페이로드는 거절된다'
);

select throws_ok(
  $$select public.file_collection_save_structure(
      p_collection_id => 'b6000000-0000-0000-0000-000000000001',
      p_nodes => jsonb_build_array(
        pg_temp.item('k1', null, null, 'FOLDER', '중복 키'),
        pg_temp.item('k1', null, null, 'FOLDER', '중복 키')))$$,
  'P0001', null,
  '같은 키가 두 번 오면 거절된다'
);

select is(
  (select count(*)::int from public.file_collection_nodes where deleted_at is null),
  5,
  '거절된 저장들 뒤에도 줄 수는 그대로다'
);

-- ---------------------------------------------------------------------
-- (4) 충돌 — 기준 시각과 전수 대조
-- ---------------------------------------------------------------------
select throws_ok(
  $$select public.file_collection_save_structure(
      p_collection_id => 'b6000000-0000-0000-0000-000000000001',
      p_nodes => pg_temp.full_payload('주주명부'))$$,
  '40001', null,
  '기준 시각이 어긋난 마디가 있으면 저장이 멈춘다'
);

select throws_ok(
  $$select public.file_collection_save_structure(
      p_collection_id => 'b6000000-0000-0000-0000-000000000001',
      p_nodes => jsonb_build_array(
        pg_temp.item('k1', null, pg_temp.old_id('재무'), 'FOLDER', '재무 자료')))$$,
  '40001', null,
  '내가 못 본 마디가 서버에 있으면(목록에도 삭제에도 없으면) 저장이 멈춘다'
);

select throws_ok(
  $$select public.file_collection_save_structure(
      p_collection_id => 'b6000000-0000-0000-0000-000000000001',
      p_nodes => jsonb_build_array(
        jsonb_build_object('key','k1','parent_key',null,'node_id', pg_temp.old_id('재무'),
                           'node_type','FOLDER','title','기준 시각 없음')))$$,
  'P0001', null,
  '기존 마디에 기준 시각이 없으면 거절된다(모르고 덮어쓰지 않는다)'
);

-- ---------------------------------------------------------------------
-- (5) 삭제 — 명시한 것만, 소프트로
-- ---------------------------------------------------------------------
select lives_ok(
  $$select public.file_collection_save_structure(
      p_collection_id => 'b6000000-0000-0000-0000-000000000001',
      p_nodes => jsonb_build_array(
        pg_temp.item('k1', null, pg_temp.old_id('재무'),     'FOLDER',   '재무 자료'),
        pg_temp.item('k2', 'k1', pg_temp.old_id('재무제표'), 'QUESTION', '재무제표', true, '최근 3개년')),
      p_deletes => jsonb_build_array(
        pg_temp.del(pg_temp.old_id('주주명부')),
        pg_temp.del(pg_temp.new_id('재무 자료')),
        pg_temp.del(pg_temp.new_id('재무제표'))))$$,
  '두 번째 가지와 문항 하나를 지운다'
);

select is(
  (select count(*)::int from public.file_collection_nodes where deleted_at is null),
  2,
  '남는 줄은 둘이다'
);

-- 앱 롤에게는 지운 줄이 **보이지 않는다**(정책이 deleted_at is null로 거른다).
-- 그래서 물리 행이 남았는지는 정책을 느슨하게 하는 대신 **소유자 세션에서** 확인한다.
select is(
  (select count(*)::int from public.file_collection_nodes),
  2,
  '앱 롤에게는 지운 줄이 아예 보이지 않는다(RLS가 가린다)'
);

reset role;

select is(
  (select count(*)::int from public.file_collection_nodes),
  5,
  '지운 줄도 물리 행은 남는다(소프트 삭제)'
);

select ok(
  (select deleted_at is not null from public.file_collection_nodes
    where id = pg_temp.old_id('주주명부')),
  '지운 마디에는 deleted_at이 찍힌다'
);

set local role authenticated;
select set_config('request.jwt.claims',
  '{"app_user_id":"b1000000-0000-0000-0000-000000000001","session_version":1}', true);

-- ---------------------------------------------------------------------
-- (6) 종류 전환 — 한 호출 안에서 폴더⇄문항이 뒤바뀐다(id는 그대로)
-- ---------------------------------------------------------------------
select lives_ok(
  $$select public.file_collection_save_structure(
      p_collection_id => 'b6000000-0000-0000-0000-000000000001',
      p_nodes => jsonb_build_array(
        pg_temp.item('k1', null, pg_temp.old_id('재무'),     'QUESTION', '재무 자료'),
        pg_temp.item('k2', null, pg_temp.old_id('재무제표'), 'FOLDER',   '재무제표'),
        pg_temp.item('k3', 'k2', null, 'QUESTION', '새 자식')))$$,
  '자식을 잃은 폴더가 문항이 되고, 자식이 생긴 문항이 폴더가 된다(한 호출)'
);

select is(
  (select node_type from public.file_collection_nodes where id = pg_temp.old_id('재무')),
  'QUESTION',
  '자식이 없어진 폴더는 문항이 된다(id 그대로)'
);

select is(
  (select node_type from public.file_collection_nodes where id = pg_temp.old_id('재무제표')),
  'FOLDER',
  '자식이 생긴 문항은 폴더가 된다(id 그대로)'
);

select is(
  (select parent_id from public.file_collection_nodes where title = '새 자식' and deleted_at is null),
  pg_temp.old_id('재무제표'),
  '새 자식은 그 폴더 아래에 선다'
);

-- ---------------------------------------------------------------------
-- (7) 들쭉날쭉한 트리 — 얕은 문항과 깊은 가지가 함께 산다
-- ---------------------------------------------------------------------
select lives_ok(
  $$select public.file_collection_save_structure(
      p_collection_id => 'b6000000-0000-0000-0000-000000000001',
      p_nodes => jsonb_build_array(
        pg_temp.item('k1', null, pg_temp.old_id('재무'),     'QUESTION', '최상위 문항'),
        pg_temp.item('k2', null, pg_temp.old_id('재무제표'), 'FOLDER',   '대분류'),
        pg_temp.item('k3', 'k2', pg_temp.new_id('새 자식'),  'FOLDER',   '중분류'),
        pg_temp.item('k4', 'k3', null, 'QUESTION', '깊은 문항')),
      p_level_names => array['대분류','중분류','문항'])$$,
  '깊이가 다른 가지(최상위 문항 + 3단 가지)가 함께 저장된다'
);

select is(
  (select count(*)::int from public.file_collection_nodes
    where deleted_at is null and parent_id is null),
  2,
  '최상위에 문항과 폴더가 나란히 선다(깊이를 강요하지 않는다)'
);

select is(
  (select node_type from public.file_collection_nodes
    where title = '최상위 문항' and deleted_at is null),
  'QUESTION',
  '최상위 문항은 문항 그대로다'
);

select lives_ok(
  $$select public.file_collection_save_structure(
      p_collection_id => 'b6000000-0000-0000-0000-000000000001',
      p_nodes => pg_temp.full_payload())$$,
  '단계 이름을 빼고 트리만 다시 저장한다'
);

select is(
  (select level_names from public.file_collections where id = 'b6000000-0000-0000-0000-000000000001'),
  array['대분류','중분류','문항'],
  '단계 이름을 주지 않으면 종전 값이 남는다'
);

-- 저장 결과는 **화면이 다시 조회하지 않고도** 기준을 다시 세울 수 있어야 한다 —
-- 새로 발급된 id와 지금 기준 시각이 함께 와야 다음 저장이 그 줄을 '또 만들지' 않는다.
reset role;
create temp table fc_result as
  select public.file_collection_save_structure(
    p_collection_id => 'b6000000-0000-0000-0000-000000000001',
    p_nodes => pg_temp.full_payload()) as result;
grant select on fc_result to authenticated;
set local role authenticated;
select set_config('request.jwt.claims',
  '{"app_user_id":"b1000000-0000-0000-0000-000000000001","session_version":1}', true);

select is(
  (select jsonb_array_length(result->'nodes') from fc_result),
  4,
  '저장 결과는 지금 살아 있는 마디 전부를 돌려준다'
);

select ok(
  (select bool_and(
            (n->>'id') is not null and (n->>'updated_at') is not null
            and (n->>'collection_id') is not null and (n->>'node_type') is not null)
     from fc_result, jsonb_array_elements(result->'nodes') n),
  '돌려준 마디마다 id·기준 시각·소속·종류가 실려 있다(조회 없이 기준을 세운다)'
);

-- ---------------------------------------------------------------------
-- (8) 인가 — 읽기 전용 · 다른 워크스페이스 · 게스트 · 미인증 · 남의 마디
-- ---------------------------------------------------------------------
select set_config('request.jwt.claims',
  '{"app_user_id":"b1000000-0000-0000-0000-000000000002","session_version":1}', true);
select throws_ok(
  $$select public.file_collection_save_structure(
      p_collection_id => 'b6000000-0000-0000-0000-000000000001',
      p_nodes => jsonb_build_array(pg_temp.item('k1', null, null, 'QUESTION', '열람자가 쓴다')))$$,
  '42501', null,
  '읽기 전용 내부 사용자는 구성을 저장할 수 없다'
);

select set_config('request.jwt.claims',
  '{"app_user_id":"b1000000-0000-0000-0000-000000000003","session_version":1}', true);
select throws_ok(
  $$select public.file_collection_save_structure(
      p_collection_id => 'b6000000-0000-0000-0000-000000000001',
      p_nodes => jsonb_build_array(pg_temp.item('k1', null, null, 'QUESTION', '남의 워크스페이스')))$$,
  '42501', null,
  '다른 워크스페이스(FUND) 사용자는 구성을 저장할 수 없다'
);

select set_config('request.jwt.claims',
  '{"app_user_id":"b2000000-0000-0000-0000-000000000001","session_version":1,'
  '"context_type":"program","context_id":"b3000000-0000-0000-0000-000000000001"}', true);
select throws_ok(
  $$select public.file_collection_save_structure(
      p_collection_id => 'b6000000-0000-0000-0000-000000000001',
      p_nodes => jsonb_build_array(pg_temp.item('k1', null, null, 'QUESTION', '게스트가 쓴다')))$$,
  '42501', null,
  '게스트는 구성을 저장할 수 없다'
);

select set_config('request.jwt.claims', '{}', true);
select throws_ok(
  $$select public.file_collection_save_structure(
      p_collection_id => 'b6000000-0000-0000-0000-000000000001',
      p_nodes => jsonb_build_array(pg_temp.item('k1', null, null, 'QUESTION', '미인증')))$$,
  '42501', null,
  '미인증 세션은 구성을 저장할 수 없다'
);

select set_config('request.jwt.claims',
  '{"app_user_id":"b1000000-0000-0000-0000-000000000001","session_version":1}', true);

select throws_ok(
  $$select public.file_collection_save_structure(
      p_collection_id => 'b6000000-0000-0000-0000-000000000002',
      p_nodes => jsonb_build_array(
        pg_temp.item('k1', null, pg_temp.old_id('재무'), 'QUESTION', '남의 마디')))$$,
  'P0001', null,
  '다른 파일받기의 마디 id는 끼워 넣을 수 없다'
);

-- ---------------------------------------------------------------------
-- (9) 공개 잠금
-- ---------------------------------------------------------------------
select public.file_collection_assign('b6000000-0000-0000-0000-000000000001',
  array['b4000000-0000-0000-0000-000000000001'::uuid]);

select ok(
  public.file_collection_publish('b6000000-0000-0000-0000-000000000001') is not null,
  '문항과 대상이 있으므로 공개된다'
);

select throws_ok(
  $$select public.file_collection_save_structure(
      p_collection_id => 'b6000000-0000-0000-0000-000000000001',
      p_nodes => pg_temp.full_payload(),
      p_level_names => array['바꿔보기'])$$,
  'P0001', null,
  '공개된 파일받기의 구성은 저장할 수 없다(단계 이름까지 잠긴다)'
);

select is(
  (select level_names from public.file_collections where id = 'b6000000-0000-0000-0000-000000000001'),
  array['대분류','중분류','문항'],
  '거절된 저장은 단계 이름도 바꾸지 않는다'
);

reset role;
select finish();
rollback;
