-- =====================================================================
-- 파일받기의 받는 사람을 **명부가 정한다** (2026-09-14, 사용자 확정)
--
-- 무엇이 바뀌는가.
--   종전에는 파일받기마다 '받는 사람' 탭에서 명부의 게스트를 **따로 골라 배정**해야 자료를
--   받을 수 있었다. 담당자 입장에서는 같은 대상을 두 번 등록하는 일이었다 — 사업 명부에 게스트
--   계정을 세우고, 다시 파일받기에서 그 사람을 고른다. 그래서 지정 단계를 없앤다.
--   **그 사업(entity)의 로그인이 열린 게스트 계정은 모두 자동으로 대상이 된다.**
--
--   배정 원장(file_collection_assignments)은 **그대로 둔다.** 대상마다 독립한 제출 공간이
--   필요하고(응답·파일·피드백이 배정을 물고 있다) 격리 규칙도 그대로다. 바뀌는 것은 그 행이
--   **누구의 손으로 서는가**뿐이다 — 사람이 고르던 것을 명부가 채운다. 자동으로 선 행은
--   assigned_by가 NULL이며, 그것이 '명부가 세웠다'는 표시다.
--
-- 노출 범위(적용 즉시).
--   이미 있는 파일받기에도 소급한다(파일 끝의 한 번 도는 블록). 모듈이 공개(OPEN·CLOSED)인
--   파일받기라면, 지금까지 배정되지 않았던 명부 게스트에게도 이 마이그레이션 이후 보인다.
--   사용자 확인을 받은 노출 확대다. 여전히 모두 막는 것은 넷이다 — 모듈 공개 여부,
--   명부 줄의 로그인 개방(ACTIVE), 계정 활성·게스트 종류, 세션 맥락.
--
-- 무엇이 대상을 다시 맞추는가(세 자리).
--   (1) 명부가 바뀔 때 — program_participants 트리거. 게스트를 새로 넣거나 로그인을 열면
--       그 사업의 모든 파일받기에 대상이 곧바로 선다.
--   (2) 파일받기를 처음 세울 때 — file_collection_upsert.
--   (3) 소급 한 번 — 이 파일 끝.
--   문항이 바뀔 때 응답 칸을 맞추는 자리(save_structure)는 건드리지 않는다. 대상은 문항이
--   아니라 명부가 정하므로 축이 다르다.
--
-- 회수(revoked_at)는 어떻게 되는가.
--   자동 동기화는 **지금 명부에 살아 있는 게스트의 회수를 되돌린다.** 대상을 명부가 정하기로
--   한 이상 '명부에 있는데 회수된 상태'는 성립하지 않기 때문이다. 명부에서 빠진 사람은
--   동기화 대상에 들지 않으므로 회수된 채로 남고, 이미 받은 파일·피드백도 그대로 남는다.
--
-- 보안 게이트(11_migration_security_gate.md) 대조는 파일 끝 주석에 적었다.
-- =====================================================================

-- ---------------------------------------------------------------------
-- (1) 대상 맞추기 — 명부의 유효한 게스트 계정을 배정으로 옮긴다(멱등).
--
--     고르는 조건은 배정 트리거(app.fc_assignment_guard)가 보는 것과 **같은 넷**이다:
--     같은 사업의 명부 줄 · 로그인 ACTIVE · 게스트 종류 · 계정 활성. 트리거가 뒤에서 같은
--     조건을 다시 보므로 여기서 한 줄이라도 넓히면 통째로 거절된다.
--
--     같은 계정이 명부에 여러 줄이면 **한 줄만** 고른다(배정의 유일성 축이 계정이다).
--     먼저 들어온 줄을 쓰며, 다시 돌려도 같은 줄이 뽑히도록 id까지 정렬에 넣는다.
-- ---------------------------------------------------------------------

create or replace function app.fc_sync_assignments(p_collection_id uuid, p_module_id uuid)
returns integer
language plpgsql
security definer
set search_path = app, public
as $$
declare v_count integer;
begin
  insert into public.file_collection_assignments as a
    (collection_id, participant_id, guest_user_id, program_module_id)
  select distinct on (p.user_id)
         p_collection_id, p.id, p.user_id, p_module_id
    from public.program_modules m
    join public.program_participants p
      on p.program_id = m.program_id
     and p.entity_key = m.entity_key
    join public.users u on u.id = p.user_id
   where m.id = p_module_id
     and p.login_status = 'ACTIVE'
     and app.is_guest_user_type(u.user_type)
     and u.is_active
     and u.deleted_at is null
   order by p.user_id, p.created_at, p.id
  on conflict (collection_id, guest_user_id) where deleted_at is null do update
     set participant_id = excluded.participant_id,
         revoked_at     = null,
         assigned_at    = case when a.revoked_at is not null then now() else a.assigned_at end
   where a.revoked_at is not null
      or a.participant_id is distinct from excluded.participant_id;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

comment on function app.fc_sync_assignments(uuid, uuid) is
  '명부의 유효한 게스트 계정을 파일받기 배정으로 맞춘다(멱등). 자동으로 선 행은 assigned_by가 NULL이다. 명부에서 빠진 사람은 건드리지 않는다.';

-- ---------------------------------------------------------------------
-- (2) 모듈 하나를 통째로 맞추기 — 대상과 응답 칸을 같은 순서로 세운다.
--     원장이 아직 없는 모듈은 할 일이 없다(0을 답한다).
-- ---------------------------------------------------------------------

create or replace function app.fc_sync_targets(p_module_id uuid)
returns integer
language plpgsql
security definer
set search_path = app, public
as $$
declare v_collection uuid; v_count integer;
begin
  select c.id into v_collection
    from public.file_collections c
   where c.program_module_id = p_module_id and c.deleted_at is null;
  if v_collection is null then
    return 0;
  end if;

  v_count := app.fc_sync_assignments(v_collection, p_module_id);
  -- 새로 선 대상에게는 응답 칸도 함께 선다. 문항은 응답 칸을 통해 보이므로 이 한 줄이
  -- 빠지면 게스트 화면이 빈 채로 열린다.
  perform app.fc_sync_responses(v_collection, p_module_id);
  return v_count;
end;
$$;

comment on function app.fc_sync_targets(uuid) is
  '모듈 하나의 대상(명부 기준)과 응답 칸을 맞춘다. 명부 트리거·원장 생성·소급이 이것을 부른다.';

-- ---------------------------------------------------------------------
-- (3) 명부가 바뀌면 곧바로 맞춘다.
--
--     program_participants는 모든 워크스페이스가 함께 쓰는 원장이므로 트리거는 **조건을
--     WHEN에 두어** 게스트가 아닌 줄에서는 함수 본문이 아예 돌지 않게 한다. 그 사업에
--     파일받기 모듈이 없으면 루프가 한 바퀴도 돌지 않는다.
--
--     명부 줄이 사라지는 경로(하드 삭제)는 여기서 다루지 않는다 — FK가 participant_id를
--     NULL로 끊고 app.fc_assignment_guard가 그 자리에서 접근을 닫는다(자료는 남는다).
-- ---------------------------------------------------------------------

create or replace function app.fc_participant_sync_targets()
returns trigger
language plpgsql
security definer
set search_path = app, public
as $$
declare r record;
begin
  for r in
    select m.id
      from public.program_modules m
     where m.program_id = new.program_id
       and m.entity_key = new.entity_key
       and m.module_type = 'FILE_COLLECTION'
  loop
    perform app.fc_sync_targets(r.id);
  end loop;
  return null;
end;
$$;

comment on function app.fc_participant_sync_targets() is
  '명부 줄이 서거나 로그인이 열리면 그 사업의 모든 파일받기 대상을 다시 맞춘다.';

drop trigger if exists trg_fc_participant_sync on public.program_participants;
create trigger trg_fc_participant_sync
  after insert or update of user_id, login_status, program_id, entity_key
  on public.program_participants
  for each row
  when (new.user_id is not null and new.login_status = 'ACTIVE')
  execute function app.fc_participant_sync_targets();

-- ---------------------------------------------------------------------
-- (4) 원장을 처음 세울 때도 맞춘다 — 명부가 먼저 서 있는 것이 보통이다.
--     인가 확인은 첫머리 그대로이며, 끝에 동기화 한 줄만 붙는다.
-- ---------------------------------------------------------------------

create or replace function public.file_collection_upsert(
  p_program_module_id uuid,
  p_title             text default '',
  p_guide             text default null
) returns uuid
language plpgsql
security definer
set search_path = app, public
as $$
declare v_id uuid;
begin
  if not app.file_collection_internal_write(p_program_module_id) then
    raise exception '이 모듈을 편집할 권한이 없습니다.' using errcode = '42501';
  end if;

  select id into v_id from public.file_collections
   where program_module_id = p_program_module_id for update;

  if v_id is null then
    insert into public.file_collections (program_module_id, title, guide, created_by)
    values (p_program_module_id, coalesce(p_title, ''), p_guide, app.current_app_user_id())
    on conflict (program_module_id) do update
      set title = coalesce(excluded.title, file_collections.title),
          guide = excluded.guide
    returning id into v_id;
  else
    update public.file_collections
       set title = coalesce(p_title, title), guide = p_guide
     where id = v_id;
  end if;

  perform app.fc_sync_targets(p_program_module_id);
  return v_id;
end;
$$;

-- ---------------------------------------------------------------------
-- (5) 문항 하나를 새로 세울 때 응답 칸을 빠뜨리던 자리를 메운다.
--
--     격자 저장(save_structure)은 끝에서 응답 칸을 맞추는데 낱개 저장(save_node)에는 그
--     줄이 없었다. 배정을 사람이 걸던 동안에는 배정 시점이 뒤에 와서 가려졌지만, 대상이
--     명부에서 미리 서는 지금은 새 문항이 게스트에게 보이지 않는 채로 남는다.
-- ---------------------------------------------------------------------

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
  v_id uuid;
  v_current timestamptz;
begin
  select c.program_module_id into v_module
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
    perform app.fc_sync_responses(p_collection_id, v_module);
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

  -- 종류가 폴더에서 문항으로 바뀌었을 수도 있다. 멱등하므로 무조건 맞춘다.
  perform app.fc_sync_responses(p_collection_id, v_module);
  return p_node_id;
end;
$$;

-- ---------------------------------------------------------------------
-- (6) 권한 — 새 함수 셋은 정의자만 부른다(앱 롤 EXECUTE 없음).
--     고쳐 쓴 RPC 둘의 권한은 종전 그대로 다시 세운다.
-- ---------------------------------------------------------------------

do $$
declare sig text;
begin
  foreach sig in array array[
    'app.fc_sync_assignments(uuid, uuid)',
    'app.fc_sync_targets(uuid)',
    'app.fc_participant_sync_targets()'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', sig);
  end loop;

  foreach sig in array array[
    'public.file_collection_upsert(uuid, text, text)',
    'public.file_collection_save_node(uuid, uuid, uuid, text, text, text, boolean, integer, timestamptz)'
  ] loop
    execute format('revoke all on function %s from public, anon', sig);
    execute format('grant execute on function %s to authenticated', sig);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- (7) 한 번만 — 이미 있는 파일받기의 대상을 명부 기준으로 맞춘다.
--     멱등한 함수라 다시 돌려도 덧나지 않는다.
-- ---------------------------------------------------------------------

do $$
declare r record; v_total integer := 0; v_made integer;
begin
  for r in
    select c.program_module_id
      from public.file_collections c
     where c.deleted_at is null and c.program_module_id is not null
  loop
    v_made := app.fc_sync_targets(r.program_module_id);
    v_total := v_total + coalesce(v_made, 0);
  end loop;
  raise notice '명부에서 대상 %건을 맞췄습니다.', v_total;
end $$;

-- =====================================================================
-- 보안 게이트 대조(11_migration_security_gate.md)
--   · 새 표·새 열·새 Storage 정책 없음. RLS 정책은 한 줄도 손대지 않았다.
--   · 노출 판정(app.file_collection_guest_assignment_ids)도 그대로다. 넓어지는 것은 **배정
--     행이 서는 범위**이며, 그 범위는 배정 트리거가 이미 허용하던 집합과 정확히 같다
--     (같은 사업 명부 · 로그인 ACTIVE · 게스트 종류 · 계정 활성). 사람이 고르던 부분집합이
--     전체집합이 되는 변경이고, 사용자 확인을 받았다.
--   · 새 함수 셋(app.fc_sync_assignments · app.fc_sync_targets · app.fc_participant_sync_targets)은
--     모두 SECURITY DEFINER + search_path 고정이며 public·anon·authenticated의 EXECUTE를
--     전부 회수했다. 앞의 둘은 정의자 경로에서만, 셋째는 트리거로만 돈다.
--   · 고쳐 쓴 RPC 둘은 함수 첫머리의 인가 확인(app.file_collection_internal_write)을 그대로
--     두었다. 더한 것은 끝의 동기화 호출뿐이다.
--   · 새 트리거(trg_fc_participant_sync)는 program_participants의 가시성을 바꾸지 않는다.
--     WHEN 절이 게스트 계정·ACTIVE가 아닌 줄을 본문 앞에서 걸러 낸다.
--   · 삭제 경로는 만들지 않았다. 회수를 되돌리는 UPDATE는 **명부에 살아 있는 대상**만
--     닿으며, 명부에서 빠진 행은 조회 자체에 들지 않는다.
--   · TRUNCATE·REFERENCES·TRIGGER 권한은 부여하지 않았다.
--   · 확인한 짝: (허용) 명부에 로그인이 열린 게스트 → 배정이 자동으로 서고 공개 모듈에서
--     문항이 보인다 · (거절) 로그인이 NOT_ALLOWED·INVITED·BLOCKED이거나 정지된 계정,
--     다른 사업의 명부 줄 → 배정이 서지 않는다(트리거가 같은 조건으로 한 번 더 막는다).
-- =====================================================================
