-- =====================================================================
-- 파일받기 공개 판정을 **모듈 공개 여부**로 옮긴다 (2026-09-13, 사용자 확정)
--
-- 무엇이 바뀌는가.
--   종전에는 파일받기 원장에 따로 '공개하기'가 있었고, 그 한 번이 두 가지를 동시에 했다 —
--   (1) 게스트에게 보이기 시작하고 (2) 트리 구조를 **영구히 잠갔다**. 화면에도 별도의
--   공개 버튼이 섰다. 그러나 게스트에게 무엇을 열지는 이미 **모듈 공개 여부**가 답하고
--   있었다(app.guest_open_module_ids() — 공개 모듈 중 OPEN·CLOSED). 같은 판정을 두 곳에서
--   따로 내리면 담당자는 무엇을 눌러야 밖에 나가는지 알 수 없다.
--
--   그래서 파일받기의 공개 판정을 없애고 모듈 하나로 모은다.
--     · 게스트 배정 판정에서 c.published_at 조건을 뺀다.
--     · 구성 편집을 막던 공개 잠금(트리거·RPC 다섯 곳)을 뺀다.
--     · 대신 **이미 자료를 받은 문항만** 보호한다(아래).
--
--   published_at·published_by 열과 file_collection_publish()는 **남긴다.** 지난 공개 시각은
--   기록이라 지우지 않으며, 다만 이제 아무 판정에도 쓰이지 않는다.
--
-- 노출 범위(적용 즉시).
--   모듈이 이미 공개(OPEN·CLOSED)이고 배정이 살아 있는 파일받기는, 공개 전 초안이었더라도
--   이 마이그레이션 이후 대상 게스트에게 보인다. 사용자 확인을 받은 변경이다.
--
-- 구조를 잠그는 대신 무엇을 지키는가.
--   이름·안내·필수·순서는 언제든 고칠 수 있다. 막는 것은 **이미 올라온 파일이 가리키던
--   자리를 없애는 세 가지**뿐이다 — 소프트 삭제 · 부모 이동 · 종류 변경. 판정은 살아 있는
--   응답 중 제출됐거나 살아 있는 파일이 달린 것이 하나라도 있는가로 한다.
--
-- 보안 게이트(11_migration_security_gate.md) 대조는 파일 끝 주석에 적었다.
-- =====================================================================

-- ---------------------------------------------------------------------
-- (1) 제출 여부 판독기 — 트리거가 부른다(앱 롤은 부르지 않는다).
-- ---------------------------------------------------------------------

create or replace function app.fc_node_has_submission(p_node_id uuid)
returns boolean
language sql
stable
security definer
set search_path = app, public
as $$
  select exists (
    select 1
      from public.file_collection_responses r
     where r.node_id = p_node_id
       and r.deleted_at is null
       and (
         r.submitted_at is not null
         or exists (
           select 1 from public.file_collection_files f
            where f.response_id = r.id and f.deleted_at is null
         )
       )
  );
$$;

comment on function app.fc_node_has_submission(uuid) is
  '그 문항이 이미 자료를 받았는가(제출됐거나 살아 있는 파일이 달린 응답이 있는가). 구조 변경을 막는 기준이다.';

-- ---------------------------------------------------------------------
-- (2) 무결성 트리거 — 공개 잠금을 빼고 제출 보호를 넣는다.
-- ---------------------------------------------------------------------

create or replace function app.fc_node_guard()
returns trigger
language plpgsql
security definer
set search_path = app, public
as $$
declare
  v_module    uuid;
  v_cursor    uuid;
  v_seen      uuid[] := array[]::uuid[];
begin
  select c.program_module_id into v_module
    from public.file_collections c where c.id = new.collection_id;
  if v_module is null then
    raise exception '파일받기 원장을 찾을 수 없습니다.' using errcode = '23503';
  end if;
  new.program_module_id := v_module;

  -- 이미 받은 자료가 매달린 문항은 **자리와 종류를 지킨다.** 공개 한 번으로 구성을 통째로
  -- 잠그던 자리다. 지우거나 옮기면 올라온 파일이 가리키던 칸이 사라진다.
  if tg_op = 'UPDATE'
     and (
       (new.deleted_at is distinct from old.deleted_at and new.deleted_at is not null)
       or new.parent_id is distinct from old.parent_id
       or new.node_type is distinct from old.node_type
     )
     and app.fc_node_has_submission(new.id) then
    raise exception '이미 자료를 받은 문항은 지우거나 옮길 수 없습니다.' using errcode = 'P0001';
  end if;

  if new.parent_id is not null then
    -- 소프트 삭제되는 노드는 부모가 이미 같은 삭제 작업으로 지워졌을 수 있다(부모→자손 순서).
    -- 이 경우에도 부모가 같은 파일받기의 폴더라는 사실은 그대로 검사하고, 생존만 묻지 않는다.
    if not exists (
      select 1 from public.file_collection_nodes p
       where p.id = new.parent_id
         and p.collection_id = new.collection_id
         and p.node_type = 'FOLDER'
         and (p.deleted_at is null
              or (tg_op = 'UPDATE' and new.deleted_at is not null))
    ) then
      raise exception '부모는 같은 파일받기의 살아 있는 폴더여야 합니다.' using errcode = 'P0001';
    end if;
    -- 순환 차단: 조상을 거슬러 오르며 자기 자신 또는 이미 지난 노드를 만나면 순환이다.
    v_cursor := new.parent_id;
    while v_cursor is not null loop
      if v_cursor = new.id then
        raise exception '폴더를 자기 자손 아래로 옮길 수 없습니다.' using errcode = 'P0001';
      end if;
      if v_cursor = any (v_seen) then
        raise exception '파일받기 트리에 순환이 있습니다.' using errcode = 'P0001';
      end if;
      v_seen := v_seen || v_cursor;
      select p.parent_id into v_cursor from public.file_collection_nodes p where p.id = v_cursor;
    end loop;
  end if;

  if tg_op = 'UPDATE' and old.node_type = 'FOLDER' and new.node_type = 'QUESTION'
     and exists (select 1 from public.file_collection_nodes ch
                  where ch.parent_id = new.id and ch.deleted_at is null) then
    raise exception '자식이 있는 폴더는 문항으로 바꿀 수 없습니다.' using errcode = 'P0001';
  end if;

  return new;
end;
$$;

comment on function app.fc_node_guard() is
  '파일받기 마디 무결성 — 모듈 귀속 채우기·부모/순환 검사·폴더→문항 제한, 그리고 이미 자료를 받은 문항의 삭제·이동·종류 변경 차단.';

-- ---------------------------------------------------------------------
-- (3) 게스트 배정 판정 — 공개 조건을 모듈 하나로 모은다.
-- ---------------------------------------------------------------------


-- ---------------------------------------------------------------------
-- (1b) 응답 칸 맞추기 — 공개 한 번에 몰아 만들던 일을 상시로 옮긴다.
-- ---------------------------------------------------------------------

create or replace function app.fc_sync_responses(p_collection_id uuid, p_module_id uuid)
returns integer
language plpgsql
security definer
set search_path = app, public
as $$
declare v_count integer;
begin
  insert into public.file_collection_responses (assignment_id, node_id, program_module_id)
  select a.id, n.id, p_module_id
    from public.file_collection_assignments a
    join public.file_collection_nodes n on n.collection_id = a.collection_id
   where a.collection_id = p_collection_id
     and a.deleted_at is null and a.revoked_at is null
     and n.node_type = 'QUESTION' and n.deleted_at is null
  on conflict (assignment_id, node_id) do nothing;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

comment on function app.fc_sync_responses(uuid, uuid) is
  '살아 있는 배정 × 살아 있는 문항의 응답 칸을 빠짐없이 세운다(멱등). 공개 시점에 한 번 만들던 것을 배정·구성 저장 때마다 맞추는 것으로 옮겼다.';
create or replace function app.file_collection_guest_assignment_ids()
returns setof uuid
language sql
stable
security definer
set search_path = app, public
as $$
  select a.id
    from public.file_collection_assignments a
    join public.file_collections c on c.id = a.collection_id
    join public.users u on u.id = a.guest_user_id
    join public.program_participants p on p.id = a.participant_id
    join public.program_modules m on m.id = a.program_module_id
   where app.is_guest()
     and m.module_type = 'FILE_COLLECTION'
     and m.entity_key in ('program', 'ma_program')
     -- 명부 줄이 다른 사업·워크스페이스로 옮겨졌으면 옛 배정은 되살아나지 않는다.
     and p.program_id = m.program_id
     and p.entity_key = m.entity_key
     and a.guest_user_id = app.current_app_user_id()
     and a.deleted_at is null
     and a.revoked_at is null
     and c.deleted_at is null
     and u.is_active
     and u.deleted_at is null
     and app.is_guest_user_type(u.user_type)
     and p.user_id = a.guest_user_id
     and p.login_status = 'ACTIVE'
     and a.program_module_id in (select app.guest_open_module_ids());
$$;

create or replace function public.file_collection_save_node(
  p_collection_id      uuid,
  p_node_id            uuid default null,
  p_parent_id          uuid default null,
  p_node_type          text default 'QUESTION',
  p_title              text default '',
  p_guide              text default null,
  p_is_required        boolean default false,
  p_sort_order         integer default 0,
  p_expected_updated_at timestamptz default null
) returns uuid
language plpgsql
security definer
set search_path = app, public
as $$
declare
  v_module uuid;
  v_published timestamptz;
  v_id uuid;
  v_current timestamptz;
begin
  select c.program_module_id, c.published_at into v_module, v_published
    from public.file_collections c where c.id = p_collection_id and c.deleted_at is null
   for update;
  if v_module is null then
    raise exception '파일받기를 찾을 수 없습니다.' using errcode = 'P0001';
  end if;
  if not app.file_collection_internal_write(v_module) then
    raise exception '이 모듈을 편집할 권한이 없습니다.' using errcode = '42501';
  end if;
  if coalesce(p_title, '') = '' then
    raise exception '이름을 입력해 주세요.' using errcode = 'P0001';
  end if;

  if p_node_id is null then
    insert into public.file_collection_nodes
      (collection_id, parent_id, node_type, title, guide, is_required, sort_order, created_by, program_module_id)
    values
      (p_collection_id, p_parent_id, p_node_type, p_title, p_guide, coalesce(p_is_required, false),
       coalesce(p_sort_order, 0), app.current_app_user_id(), v_module)
    returning id into v_id;
    return v_id;
  end if;

  select updated_at into v_current from public.file_collection_nodes
   where id = p_node_id and collection_id = p_collection_id and deleted_at is null
   for update;
  if v_current is null then
    raise exception '문항을 찾을 수 없습니다.' using errcode = 'P0001';
  end if;
  if p_expected_updated_at is not null and v_current <> p_expected_updated_at then
    raise exception '다른 사용자가 먼저 저장했습니다. 새로 고친 뒤 다시 시도해 주세요.' using errcode = '40001';
  end if;

  update public.file_collection_nodes
     set parent_id = p_parent_id,
         node_type = p_node_type,
         title = p_title,
         guide = p_guide,
         is_required = coalesce(p_is_required, false),
         sort_order = coalesce(p_sort_order, 0)
   where id = p_node_id;

  return p_node_id;
end;
$$;

create or replace function public.file_collection_move_node(
  p_node_id   uuid,
  p_parent_id uuid default null,
  p_sort_order integer default 0
) returns void
language plpgsql
security definer
set search_path = app, public
as $$
declare v_collection uuid; v_module uuid; v_published timestamptz;
begin
  select n.collection_id into v_collection
    from public.file_collection_nodes n where n.id = p_node_id and n.deleted_at is null;
  if v_collection is null then
    raise exception '문항을 찾을 수 없습니다.' using errcode = 'P0001';
  end if;

  select c.program_module_id, c.published_at into v_module, v_published
    from public.file_collections c where c.id = v_collection for update;
  if not app.file_collection_internal_write(v_module) then
    raise exception '이 모듈을 편집할 권한이 없습니다.' using errcode = '42501';
  end if;

  update public.file_collection_nodes
     set parent_id = p_parent_id, sort_order = coalesce(p_sort_order, 0)
   where id = p_node_id;
end;
$$;

create or replace function public.file_collection_reorder_node(
  p_node_id   uuid,
  p_direction text
) returns boolean
language plpgsql
security definer
set search_path = app, public
as $$
declare
  v_collection uuid; v_module uuid; v_published timestamptz;
  v_parent uuid; v_has_parent boolean; v_swap uuid;
begin
  if p_direction is null or p_direction not in ('up', 'down') then
    raise exception '이동 방향은 up 또는 down이어야 합니다.' using errcode = 'P0001';
  end if;

  select n.collection_id, n.parent_id, n.parent_id is not null
    into v_collection, v_parent, v_has_parent
    from public.file_collection_nodes n where n.id = p_node_id and n.deleted_at is null;
  if v_collection is null then
    raise exception '문항을 찾을 수 없습니다.' using errcode = 'P0001';
  end if;

  select c.program_module_id, c.published_at into v_module, v_published
    from public.file_collections c where c.id = v_collection and c.deleted_at is null
   for update;
  if v_module is null then
    raise exception '파일받기를 찾을 수 없습니다.' using errcode = 'P0001';
  end if;
  if not app.file_collection_internal_write(v_module) then
    raise exception '이 모듈을 편집할 권한이 없습니다.' using errcode = '42501';
  end if;

  -- 옮길 자리가 있는지부터 본다. 같은 부모(최상위는 parent_id is null)의 살아 있는 형제만 센다.
  with ordered as (
    select n.id, row_number() over (order by n.sort_order, n.id) as rn
      from public.file_collection_nodes n
     where n.collection_id = v_collection
       and n.deleted_at is null
       and ((v_has_parent and n.parent_id = v_parent) or (not v_has_parent and n.parent_id is null))
  )
  select s.id into v_swap
    from ordered s
   where s.rn = (select case when p_direction = 'up' then o.rn - 1 else o.rn + 1 end
                   from ordered o where o.id = p_node_id);

  if v_swap is null then
    return false;  -- 맨 위에서 위로, 맨 아래에서 아래로는 무변화다.
  end if;

  -- 맞바꿈과 재번호를 한 문장에 담는다. 두 행이 같은 UPDATE에서 바뀌므로 중간 상태가 없다.
  with ordered as (
    select n.id, row_number() over (order by n.sort_order, n.id) as rn
      from public.file_collection_nodes n
     where n.collection_id = v_collection
       and n.deleted_at is null
       and ((v_has_parent and n.parent_id = v_parent) or (not v_has_parent and n.parent_id is null))
  ), swapped as (
    select o.id,
           (case
              when o.id = p_node_id then (select t.rn from ordered t where t.id = v_swap)
              when o.id = v_swap    then (select t.rn from ordered t where t.id = p_node_id)
              else o.rn
            end)::integer as new_order
      from ordered o
  )
  update public.file_collection_nodes t
     set sort_order = s.new_order
    from swapped s
   where t.id = s.id and t.sort_order is distinct from s.new_order;

  return true;
end;
$$;

create or replace function public.file_collection_delete_node(p_node_id uuid)
returns integer
language plpgsql
security definer
set search_path = app, public
as $$
declare v_collection uuid; v_module uuid; v_published timestamptz; v_count integer;
begin
  select n.collection_id into v_collection
    from public.file_collection_nodes n where n.id = p_node_id and n.deleted_at is null;
  if v_collection is null then
    raise exception '문항을 찾을 수 없습니다.' using errcode = 'P0001';
  end if;

  select c.program_module_id, c.published_at into v_module, v_published
    from public.file_collections c where c.id = v_collection for update;
  if not app.file_collection_internal_write(v_module) then
    raise exception '이 모듈을 편집할 권한이 없습니다.' using errcode = '42501';
  end if;

  with recursive sub as (
    select id from public.file_collection_nodes where id = p_node_id
    union all
    select n.id from public.file_collection_nodes n join sub on n.parent_id = sub.id
  )
  update public.file_collection_nodes t
     set deleted_at = now()
    from sub
   where t.id = sub.id and t.deleted_at is null;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

create or replace function public.file_collection_assign(
  p_collection_id  uuid,
  p_participant_ids uuid[]
) returns integer
language plpgsql
security definer
set search_path = app, public
as $$
declare
  v_module uuid; v_published timestamptz; v_pid uuid; v_assignment uuid; v_count integer := 0;
begin
  select c.program_module_id, c.published_at into v_module, v_published
    from public.file_collections c where c.id = p_collection_id and c.deleted_at is null
   for update;
  if v_module is null then
    raise exception '파일받기를 찾을 수 없습니다.' using errcode = 'P0001';
  end if;
  if not app.file_collection_internal_write(v_module) then
    raise exception '이 모듈을 편집할 권한이 없습니다.' using errcode = '42501';
  end if;

  foreach v_pid in array coalesce(p_participant_ids, array[]::uuid[]) loop
    v_assignment := null;

    insert into public.file_collection_assignments
      (collection_id, participant_id, guest_user_id, assigned_by, program_module_id)
    select p_collection_id, p.id, p.user_id, app.current_app_user_id(), v_module
      from public.program_participants p
     where p.id = v_pid
    on conflict (collection_id, guest_user_id) where deleted_at is null do update
      set participant_id = excluded.participant_id,   -- 명부가 갈렸으면 다시 잇는다
          revoked_at     = null,                      -- 회수를 되돌린다(같은 행 = 이력 보존)
          assigned_by    = excluded.assigned_by,
          assigned_at    = now()
    returning id into v_assignment;

    if v_assignment is null then
      raise exception '배정할 명부 줄을 찾을 수 없습니다.' using errcode = 'P0001';
    end if;

    v_count := v_count + 1;
  end loop;

  -- 응답 칸은 **배정이 서면 함께 선다.** 공개 판정이 모듈로 옮겨간 뒤로 미룰 시점이 없다.
  perform app.fc_sync_responses(p_collection_id, v_module);

  return v_count;
end;
$$;

create or replace function public.file_collection_save_structure(
  p_collection_id       uuid,
  p_nodes               jsonb       default '[]'::jsonb,
  p_deletes             jsonb       default '[]'::jsonb,
  p_level_names         text[]      default null,
  p_expected_updated_at timestamptz default null
) returns jsonb
language plpgsql
security definer
set search_path = app, public
as $$
declare
  v_module    uuid;
  v_published timestamptz;
  v_updated   timestamptz;
  v_keys      jsonb;
  v_created   integer := 0;
  v_changed   integer := 0;
  v_deleted   integer := 0;
  v_rows      integer;
  v_id        uuid;
  v_parent    uuid;
  v_pass      integer;
  r           record;
begin
  -- 0) 페이로드의 겉모양 --------------------------------------------------
  if p_nodes is null or jsonb_typeof(p_nodes) <> 'array' then
    raise exception '구성 목록이 올바르지 않습니다.' using errcode = 'P0001';
  end if;
  if p_deletes is null then
    p_deletes := '[]'::jsonb;
  end if;
  if jsonb_typeof(p_deletes) <> 'array' then
    raise exception '삭제 목록이 올바르지 않습니다.' using errcode = 'P0001';
  end if;
  -- 상한은 **읽을 수 있는 만큼**이다. 화면의 조회는 1000행씩 최대 20쪽을 순회하므로
  -- (fileCollectionHooks.fetchAllPages) 그보다 큰 트리는 애초에 화면이 온전히 읽지 못하고,
  -- 읽지 못한 트리를 저장하면 못 본 마디를 지우게 된다. 두 수를 같은 자리에 맞춰 둔다.
  if jsonb_array_length(p_nodes) > 20000 then
    raise exception '한 번에 저장할 수 있는 항목 수(20000)를 넘었습니다.' using errcode = 'P0001';
  end if;

  -- 값의 형식(uuid·시각·참/거짓)이 어긋나면 판독기가 던진다. 그 자리에서 사람이 읽을 수
  -- 있는 말로 바꿔 준다 — 22P02를 그대로 올리면 화면에는 뜻 모를 코드만 뜬다.
  begin
    perform 1 from app.fc_structure_items(p_nodes);
    perform 1 from app.fc_structure_deletes(p_deletes);
  exception
    when invalid_text_representation or invalid_datetime_format or datetime_field_overflow then
      raise exception '구성 값의 형식이 올바르지 않습니다.' using errcode = 'P0001';
  end;

  -- 단계 수에는 상한을 두지 않는다 — 기존 원장에 깊이 제한이 없고(트리거도 두지 않았다),
  -- 여기서 자르면 이미 깊은 파일받기가 저장 자체를 못 하게 된다. 이름 길이만 본다.
  if p_level_names is not null then
    if exists (select 1 from unnest(p_level_names) x where char_length(x) > 40) then
      raise exception '단계 이름은 40자까지 적을 수 있습니다.' using errcode = 'P0001';
    end if;
  end if;

  -- 1) 잠금과 인가 --------------------------------------------------------
  select c.program_module_id, c.published_at, c.updated_at
    into v_module, v_published, v_updated
    from public.file_collections c
   where c.id = p_collection_id and c.deleted_at is null
   for update;
  if v_module is null then
    raise exception '파일받기를 찾을 수 없습니다.' using errcode = 'P0001';
  end if;
  if not app.file_collection_internal_write(v_module) then
    raise exception '이 모듈을 편집할 권한이 없습니다.' using errcode = '42501';
  end if;
  if p_expected_updated_at is not null and v_updated <> p_expected_updated_at then
    raise exception '다른 사용자가 먼저 저장했습니다. 새로 고친 뒤 다시 시도해 주세요.'
      using errcode = '40001';
  end if;

  -- 2) 페이로드 검증 — 화면이 아니라 여기서 막는다 -------------------------
  if exists (select 1 from app.fc_structure_items(p_nodes) where key is null) then
    raise exception '항목 키가 비어 있습니다.' using errcode = 'P0001';
  end if;
  if exists (select 1 from app.fc_structure_items(p_nodes) group by key having count(*) > 1) then
    raise exception '항목 키가 중복됐습니다.' using errcode = 'P0001';
  end if;
  if exists (select 1 from app.fc_structure_items(p_nodes) where title = '') then
    raise exception '이름을 입력해 주세요.' using errcode = 'P0001';
  end if;
  if exists (select 1 from app.fc_structure_items(p_nodes) where char_length(title) > 200) then
    raise exception '이름은 200자까지 적을 수 있습니다.' using errcode = 'P0001';
  end if;
  if exists (select 1 from app.fc_structure_items(p_nodes) where char_length(coalesce(guide, '')) > 2000) then
    raise exception '안내는 2000자까지 적을 수 있습니다.' using errcode = 'P0001';
  end if;
  if exists (select 1 from app.fc_structure_items(p_nodes) where node_type not in ('FOLDER', 'QUESTION')) then
    raise exception '항목 종류는 FOLDER 또는 QUESTION이어야 합니다.' using errcode = 'P0001';
  end if;

  -- 부모는 **목록에서 자기보다 앞선 항목**이어야 한다. 이 한 줄이 순환·유령 부모·뒤엉킨
  -- 순서를 함께 막는다(트리거의 순환 검사와 같은 결론에 값 단계에서 먼저 닿는다).
  if exists (
    select 1
      from app.fc_structure_items(p_nodes) i
     where i.parent_key is not null
       and not exists (
         select 1 from app.fc_structure_items(p_nodes) p
          where p.key = i.parent_key and p.ord < i.ord)
  ) then
    raise exception '상위 항목은 목록에서 자기보다 앞서야 합니다.' using errcode = 'P0001';
  end if;

  -- 문항(잎) 아래에는 아무것도 두지 못한다 — 트리거와 같은 조건이다.
  if exists (
    select 1
      from app.fc_structure_items(p_nodes) i
     where i.node_type = 'QUESTION'
       and exists (select 1 from app.fc_structure_items(p_nodes) c where c.parent_key = i.key)
  ) then
    raise exception '문항 아래에는 항목을 둘 수 없습니다.' using errcode = 'P0001';
  end if;

  if exists (
    select 1 from app.fc_structure_items(p_nodes)
     where node_id is not null group by node_id having count(*) > 1
  ) then
    raise exception '같은 항목이 두 번 들어왔습니다.' using errcode = 'P0001';
  end if;
  if exists (
    select 1 from app.fc_structure_deletes(p_deletes)
     where node_id is null
  ) then
    raise exception '지울 항목의 id가 비어 있습니다.' using errcode = 'P0001';
  end if;
  if exists (
    select 1 from app.fc_structure_deletes(p_deletes) d
      join app.fc_structure_items(p_nodes) i on i.node_id = d.node_id
  ) then
    raise exception '같은 항목을 남기면서 동시에 지울 수 없습니다.' using errcode = 'P0001';
  end if;

  -- 남의 파일받기 마디를 끼워 넣거나, 이미 지워진 마디를 되살리려는 페이로드를 막는다.
  if exists (
    select 1
      from (select node_id from app.fc_structure_items(p_nodes) where node_id is not null
            union all
            select node_id from app.fc_structure_deletes(p_deletes)) t
     where not exists (
       select 1 from public.file_collection_nodes n
        where n.id = t.node_id and n.collection_id = p_collection_id and n.deleted_at is null)
  ) then
    raise exception '이 파일받기의 항목이 아니거나 이미 지워진 항목입니다.' using errcode = 'P0001';
  end if;

  -- 3) 낙관적 잠금 --------------------------------------------------------
  if exists (
    select 1
      from (select node_id, expected_updated_at from app.fc_structure_items(p_nodes) where node_id is not null
            union all
            select node_id, expected_updated_at from app.fc_structure_deletes(p_deletes)) t
     where t.expected_updated_at is null
  ) then
    raise exception '기존 항목에는 기준 시각이 필요합니다.' using errcode = 'P0001';
  end if;

  if exists (
    select 1
      from (select node_id, expected_updated_at from app.fc_structure_items(p_nodes) where node_id is not null
            union all
            select node_id, expected_updated_at from app.fc_structure_deletes(p_deletes)) t
      join public.file_collection_nodes n on n.id = t.node_id
     where n.updated_at <> t.expected_updated_at
  ) then
    raise exception '다른 사용자가 먼저 저장했습니다. 새로 고친 뒤 다시 시도해 주세요.'
      using errcode = '40001';
  end if;

  -- 전수 대조: 살아 있는 마디는 **남기거나 지우거나** 둘 중 하나다. 어느 쪽에도 없는 줄이
  -- 있다는 것은 내가 화면을 연 뒤에 누군가 항목을 더했다는 뜻이고, 그대로 저장하면 이
  -- 저장이 그 줄을 조용히 지운다.
  if exists (
    select 1
      from public.file_collection_nodes n
     where n.collection_id = p_collection_id
       and n.deleted_at is null
       and not exists (select 1 from app.fc_structure_items(p_nodes) i where i.node_id = n.id)
       and not exists (select 1 from app.fc_structure_deletes(p_deletes) d where d.node_id = n.id)
  ) then
    raise exception '다른 사용자가 항목을 더했습니다. 새로 고친 뒤 다시 시도해 주세요.'
      using errcode = '40001';
  end if;

  -- 4) 지우기(소프트) — 먼저 한다. 자식을 잃고 문항이 되는 폴더가 (7)에서 걸리지 않도록.
  update public.file_collection_nodes t
     set deleted_at = now()
    from app.fc_structure_deletes(p_deletes) d
   where t.id = d.node_id and t.deleted_at is null;
  get diagnostics v_deleted = row_count;

  -- 5) 새 줄 세우기 — 부모 없는 FOLDER로 먼저 선다.
  --    자리(부모)와 종류는 (6)(7)이 정한다. 트리거가 행마다 검사하므로 한 걸음에 못 쓴다.
  select coalesce(jsonb_object_agg(key, node_id::text), '{}'::jsonb)
    into v_keys
    from app.fc_structure_items(p_nodes)
   where node_id is not null;

  for r in select * from app.fc_structure_items(p_nodes) where node_id is null order by ord loop
    insert into public.file_collection_nodes
      (collection_id, parent_id, node_type, title, guide, is_required, sort_order,
       created_by, program_module_id)
    values
      (p_collection_id, null, 'FOLDER', r.title, r.guide, false, 0,
       app.current_app_user_id(), v_module)
    returning id into v_id;
    v_keys := v_keys || jsonb_build_object(r.key, v_id::text);
    v_created := v_created + 1;
  end loop;

  -- 6) 자리 잡기 — 1차: 분류(자식이 있는 줄)를 위에서 아래로, 2차: 문항을 그다음.
  --    문항은 이 걸음에서 **종류를 바꾸지 않는다**(옛 자식이 아직 딸려 있을 수 있다).
  for v_pass in 1..2 loop
    for r in
      select i.ord, i.key, i.parent_key, i.title, i.guide, i.node_type,
             -- 폴더에는 필수 표시가 없다(잎이 아니면 파일을 받지 않는다).
             (i.node_type = 'QUESTION' and i.is_required) as is_required,
             -- 최상위는 빈 문자열로 묶는다(판독기가 빈 키를 null로 바꾸므로 충돌하지 않는다).
             row_number() over (
               partition by coalesce(i.parent_key, '') order by i.ord
             )::integer as sort_order,
             exists (select 1 from app.fc_structure_items(p_nodes) c where c.parent_key = i.key)
               as has_children
        from app.fc_structure_items(p_nodes) i
       order by i.ord
    loop
      continue when (v_pass = 1) <> r.has_children;

      v_id := (v_keys->>r.key)::uuid;
      v_parent := case when r.parent_key is null then null else (v_keys->>r.parent_key)::uuid end;

      if r.has_children then
        update public.file_collection_nodes t
           set parent_id = v_parent, node_type = 'FOLDER', title = r.title,
               guide = r.guide, is_required = false, sort_order = r.sort_order
         where t.id = v_id
           and (t.parent_id, t.node_type, t.title, t.guide, t.is_required, t.sort_order)
               is distinct from (v_parent, 'FOLDER', r.title, r.guide, false, r.sort_order);
      else
        update public.file_collection_nodes t
           set parent_id = v_parent, title = r.title, guide = r.guide,
               is_required = r.is_required, sort_order = r.sort_order
         where t.id = v_id
           and (t.parent_id, t.title, t.guide, t.is_required, t.sort_order)
               is distinct from (v_parent, r.title, r.guide, r.is_required, r.sort_order);
      end if;
      get diagnostics v_rows = row_count;
      v_changed := v_changed + v_rows;
    end loop;
  end loop;

  -- 7) 종류 확정 — 잎의 종류는 **페이로드가 말한 그대로** 남는다(양방향).
  --    지금 잎에는 살아 있는 자식이 하나도 없으므로(전부 제자리로 옮겼거나 지웠다)
  --    폴더→문항도 안전하고, 문항→빈 폴더(옛 데이터의 빈 묶음)도 그대로 선다.
  update public.file_collection_nodes t
     set node_type = q.node_type
    from (
      select i.key, i.node_type
        from app.fc_structure_items(p_nodes) i
       where not exists (select 1 from app.fc_structure_items(p_nodes) c where c.parent_key = i.key)
    ) q
   where t.id = (v_keys->>q.key)::uuid
     and t.node_type <> q.node_type;
  get diagnostics v_rows = row_count;
  v_changed := v_changed + v_rows;

  -- 8) 단계 이름과 머리 행 — 구성이 바뀌었다는 사실을 collection의 updated_at이 진다.
  update public.file_collections
     set level_names = coalesce(p_level_names, level_names)
   where id = p_collection_id;

  -- 9) 새로 선 문항에는 응답 칸도 함께 세운다(살아 있는 배정 × 살아 있는 문항).
  --    공개 한 번에 몰아 만들던 자리다 — 그 시점이 사라졌으므로 구성이 바뀔 때마다 맞춘다.
  perform app.fc_sync_responses(p_collection_id, v_module);

  -- 저장 결과에 **지금 살아 있는 트리 전부**를 실어 보낸다. 화면은 이것으로 곧장 기준을
  -- 다시 세운다 — 조회가 돌아오길 기다려 기준을 세우면 그 사이의 응답이 저장 전 값일 수 있고,
  -- 그때 새로 만든 줄이 id 없는 채로 남아 다음 저장에서 **한 번 더** 생긴다.
  return jsonb_build_object(
    'collection_id', p_collection_id,
    'created', v_created,
    'changed', v_changed,
    'deleted', v_deleted,
    'keys', v_keys,
    'updated_at', (select c.updated_at from public.file_collections c where c.id = p_collection_id),
    'level_names', to_jsonb((select c.level_names from public.file_collections c where c.id = p_collection_id)),
    'nodes', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'id', n.id,
               'collection_id', n.collection_id,
               'parent_id', n.parent_id,
               'node_type', n.node_type,
               'title', n.title,
               'guide', n.guide,
               'is_required', n.is_required,
               'sort_order', n.sort_order,
               'updated_at', n.updated_at
             ) order by n.sort_order, n.id), '[]'::jsonb)
        from public.file_collection_nodes n
       where n.collection_id = p_collection_id and n.deleted_at is null
    )
  );
end;
$$;
-- ---------------------------------------------------------------------
-- (5) 주석·권한 다시 세우기
--     create or replace는 기존 ACL을 유지하지만, 보안 게이트가 요구하는 유효 권한을
--     이 파일만 읽고도 확인할 수 있도록 같은 회수·부여를 명시한다.
-- ---------------------------------------------------------------------

comment on function app.file_collection_guest_assignment_ids() is
  '지금 세션의 게스트가 가진 유효 배정. 신원·계정 활성·세션 맥락·명부 생존/활성·모듈 개방을 모두 통과한 것만 답한다(파일받기 자체의 공개 판정은 2026-09-13에 없앴다 — 모듈이 답한다).';

comment on function public.file_collection_save_structure(uuid, jsonb, jsonb, text[], timestamptz) is
  '파일받기 구성(단계 이름 + 트리)을 한 번에 저장한다. 인가·낙관적 잠금·전수 대조를 모두 통과해야 하며, 기존 마디의 id는 보존되고 삭제는 명시된 것만 소프트 삭제한다. 이미 자료를 받은 문항의 삭제·이동은 트리거가 막는다.';

comment on column public.file_collections.published_at is
  '지난 공개 시각(기록). 2026-09-13부터 어떤 판정에도 쓰지 않는다 — 게스트 노출은 모듈 공개 여부가, 구조 변경 제한은 제출 여부가 답한다.';

do $$
declare sig text;
begin
  foreach sig in array array[
    'public.file_collection_save_node(uuid, uuid, uuid, text, text, text, boolean, integer, timestamptz)',
    'public.file_collection_move_node(uuid, uuid, integer)',
    'public.file_collection_reorder_node(uuid, text)',
    'public.file_collection_delete_node(uuid)',
    'public.file_collection_assign(uuid, uuid[])',
    'public.file_collection_save_structure(uuid, jsonb, jsonb, text[], timestamptz)'
  ] loop
    execute format('revoke all on function %s from public, anon', sig);
    execute format('grant execute on function %s to authenticated', sig);
  end loop;

  -- 판독기·트리거 함수는 정의자만 부른다. 앱 롤의 EXECUTE는 남기지 않는다.
  foreach sig in array array[
    'app.fc_node_has_submission(uuid)',
    'app.fc_sync_responses(uuid, uuid)',
    'app.fc_node_guard()'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', sig);
  end loop;

  execute 'revoke all on function app.file_collection_guest_assignment_ids() from public, anon';
  execute 'grant execute on function app.file_collection_guest_assignment_ids() to authenticated';
end $$;


-- ---------------------------------------------------------------------
-- (6) 한 번만 — 이미 있는 배정의 응답 칸 맞추기
--     공개 시점에 몰아 만들던 칸이라, 공개한 적 없는 회차의 배정에는 칸이 하나도 없다.
--     그대로 두면 이 마이그레이션이 노출을 열어도 게스트 화면은 빈 채로 남는다(문항은
--     응답 칸을 통해 보인다). 멱등한 함수라 다시 돌려도 덧나지 않는다.
-- ---------------------------------------------------------------------

do $$
declare r record; v_total integer := 0; v_made integer;
begin
  for r in
    select c.id, c.program_module_id
      from public.file_collections c
     where c.deleted_at is null and c.program_module_id is not null
  loop
    v_made := app.fc_sync_responses(r.id, r.program_module_id);
    v_total := v_total + coalesce(v_made, 0);
  end loop;
  raise notice '응답 칸 %개를 새로 세웠습니다.', v_total;
end $$;

-- =====================================================================
-- 보안 게이트 대조(11_migration_security_gate.md)
--   · 새 표·새 열 없음. RLS 정책은 손대지 않았고, 정책이 부르는 판독기 하나의 조건만 좁은
--     쪽에서 넓은 쪽으로 바뀐다(파일받기 공개 판정 제거) — 사용자 확인을 받은 노출 확대다.
--     넓어지는 폭은 모듈 공개 여부·배정·명부 활성·세션 맥락이 여전히 모두 막는다.
--   · 새 함수 둘(app.fc_node_has_submission(uuid) · app.fc_sync_responses(uuid, uuid))은 모두
--     SECURITY DEFINER + search_path 고정이며 앱 롤(anon·authenticated)의 EXECUTE를 전부
--     회수했다. 앞의 것은 트리거가, 뒤의 것은 이미 인가를 마친 RPC 두 곳이 부른다.
--   · 고쳐 쓴 RPC 다섯은 모두 함수 첫머리의 인가 확인(app.file_collection_internal_write)을
--     그대로 두었다. 뺀 것은 공개 잠금뿐이다.
--   · 삭제 정책은 만들지 않았다. 삭제는 여전히 소프트 삭제이며, 이제 **이미 자료를 받은
--     문항**은 트리거가 삭제·이동·종류 변경을 거절한다(허용 한 쌍/거절 한 쌍은 아래 확인).
--   · 확인한 짝: (허용) 자료가 없는 문항의 이름·안내·필수 수정과 삭제 · (거절) 제출됐거나
--     살아 있는 파일이 달린 문항의 소프트 삭제·부모 이동·종류 변경.
--   · TRUNCATE·REFERENCES·TRIGGER 권한은 부여하지 않았다.
--   · 한 번 도는 소급(6)은 응답 칸을 세울 뿐 파일·검토 상태를 건드리지 않으며, 배정과 문항이
--     이미 허용한 짝만 만든다(멱등).
-- =====================================================================
