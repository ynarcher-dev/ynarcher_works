-- =====================================================================
-- 파일받기 구성 편집 — 단계 이름 원장화와 **원자적 구조 저장** (2026-09-13)
--
-- 왜 새 RPC인가.
--   종전 화면은 창을 열어 마디를 하나씩 세웠고, 저장도 마디마다 file_collection_save_node를
--   차례로 불렀다. 가로 계층 격자는 한 화면에서 여러 줄을 한꺼번에 고치므로 그 방식으로는
--   한 번의 "저장"이 여러 트랜잭션으로 갈라진다 — 중간에서 끊기면 **반쯤 저장된 트리**가
--   남고, 사람은 무엇이 반영됐는지 모른 채 다시 누른다(그리고 가지가 두 번 생긴다).
--   여기서는 구성 전체를 한 번에 받아 **한 트랜잭션에서 검증하고 적용한다.**
--
-- 무엇을 지키는가.
--   · 인가·잠금: 저장·공개·재정렬과 **같은 collection 행**을 같은 순서로 FOR UPDATE로 잡는다.
--   · 공개 잠금: published_at이 서 있으면 구성은 통째로 불변이다(트리거와 같은 폭).
--   · 낙관적 잠금: 기존 마디는 읽은 시점의 updated_at을 함께 보내야 하고, 하나라도 어긋나면
--     40001로 멈춘다. **내가 못 본 줄이 서버에 있으면** 그것도 40001이다 — 그러지 않으면
--     이 저장이 남이 방금 더한 문항을 조용히 지운다.
--   · id 보존: 기존 마디는 id 그대로 갱신된다. 응답·파일·배정이 그 id를 가리키기 때문이다.
--   · 삭제는 소프트. 지울 대상은 호출자가 **명시적으로** 적어야 한다(빠뜨림이 삭제가 되지 않는다).
--
-- 적용 순서가 세 걸음인 이유: 트리거(app.fc_node_guard)가 **행마다** 부모 생존·종류·순환을
-- 검사하므로, 한 걸음에 몰아 쓰면 중간 상태에서 걸린다. 지우기 → 분류(위에서 아래로) →
-- 문항(자리 먼저, 종류는 마지막)으로 나눈다.
--
-- 보안 게이트(11_migration_security_gate.md) 대조는 파일 끝 주석에 적었다.
-- =====================================================================

-- ---------------------------------------------------------------------
-- (1) 단계 이름 — 구성표의 열 이름은 파일받기마다 다르다
-- ---------------------------------------------------------------------
alter table public.file_collections
  add column if not exists level_names text[] not null default '{}'::text[];

comment on column public.file_collections.level_names is
  '가로 계층 구성표의 단계 이름(왼→오). 빈 배열이면 화면이 기본 이름을 세운다. 트리의 실제 깊이는 마디가 답하며 이 값은 이름표일 뿐이다.';

-- ---------------------------------------------------------------------
-- (2) 페이로드 판독기 — 저장 함수 안에서만 쓴다(app 스키마, 노출 없음)
-- ---------------------------------------------------------------------
create or replace function app.fc_structure_items(p_nodes jsonb)
returns table (
  ord                 integer,
  key                 text,
  parent_key          text,
  node_id             uuid,
  node_type           text,
  title               text,
  guide               text,
  is_required         boolean,
  expected_updated_at timestamptz
)
language sql
immutable
set search_path = app, public
as $$
  select e.ord::integer,
         nullif(btrim(coalesce(e.item->>'key', '')), ''),
         nullif(btrim(coalesce(e.item->>'parent_key', '')), ''),
         nullif(btrim(coalesce(e.item->>'node_id', '')), '')::uuid,
         upper(coalesce(nullif(btrim(coalesce(e.item->>'node_type', '')), ''), 'QUESTION')),
         btrim(coalesce(e.item->>'title', '')),
         nullif(btrim(coalesce(e.item->>'guide', '')), ''),
         coalesce((e.item->>'is_required')::boolean, false),
         nullif(btrim(coalesce(e.item->>'expected_updated_at', '')), '')::timestamptz
    from jsonb_array_elements(p_nodes) with ordinality as e(item, ord)
$$;

comment on function app.fc_structure_items(jsonb) is
  '파일받기 구성 저장 페이로드(마디 목록) 판독기. 저장 RPC 전용이며 값 검증은 호출자가 한다.';

create or replace function app.fc_structure_deletes(p_deletes jsonb)
returns table (
  node_id             uuid,
  expected_updated_at timestamptz
)
language sql
immutable
set search_path = app, public
as $$
  select nullif(btrim(coalesce(e.item->>'node_id', '')), '')::uuid,
         nullif(btrim(coalesce(e.item->>'expected_updated_at', '')), '')::timestamptz
    from jsonb_array_elements(p_deletes) as e(item)
$$;

comment on function app.fc_structure_deletes(jsonb) is
  '파일받기 구성 저장 페이로드(삭제 목록) 판독기. 저장 RPC 전용.';

revoke all on function app.fc_structure_items(jsonb) from public, anon, authenticated;
revoke all on function app.fc_structure_deletes(jsonb) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- (3) 구조 저장 — 한 번의 호출이 곧 한 번의 저장이다
-- ---------------------------------------------------------------------
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
  if v_published is not null then
    raise exception '공개된 파일받기의 구성은 바꿀 수 없습니다.' using errcode = 'P0001';
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

comment on function public.file_collection_save_structure(uuid, jsonb, jsonb, text[], timestamptz) is
  '파일받기 구성(단계 이름 + 트리)을 한 번에 저장한다. 인가·공개 잠금·낙관적 잠금·전수 대조를 모두 통과해야 하며, 기존 마디의 id는 보존되고 삭제는 명시된 것만 소프트 삭제한다. 반쯤 저장되는 결말이 없다.';

revoke all on function public.file_collection_save_structure(uuid, jsonb, jsonb, text[], timestamptz)
  from public, anon;
grant execute on function public.file_collection_save_structure(uuid, jsonb, jsonb, text[], timestamptz)
  to authenticated;

-- =====================================================================
-- 보안 게이트 대조(11_migration_security_gate.md)
--   · 새 표 없음 — file_collections에 열 하나(level_names)를 더했다. RLS·정책·권한은 그대로이며
--     이 표의 SELECT는 이미 authenticated에만 있고 쓰기는 RPC만 한다.
--   · 새 RPC는 SECURITY DEFINER + search_path 고정 + 함수 첫머리에서 호출자 인가 확인
--     (app.file_collection_internal_write). PUBLIC·anon EXECUTE는 회수하고 authenticated만 남겼다.
--   · 판독기 둘은 app 스키마에 두고 앱 롤의 EXECUTE를 전부 회수했다(정의자만 부른다).
--   · DELETE 정책을 만들지 않았다. 삭제는 deleted_at 소프트 삭제이며 대상은 호출자가 명시한다.
--   · 감사 로그: 공개 전 초안 구성 편집이라 개인정보·다운로드·권한 변경에 해당하지 않는다
--     (기존 save_node/delete_node와 같은 폭). 공개 후에는 아예 막힌다.
--   · app.module_external_record()는 변경 없음 — 새 원장을 만들지 않았다.
-- =====================================================================
