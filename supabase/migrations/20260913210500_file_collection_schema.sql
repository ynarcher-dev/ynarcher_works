-- =====================================================================
-- [파일받기 모듈 2/2] 원장 6종 · RLS · RPC 계약
-- 정본: docs/docs_planning/3_4_16_file_collection.md
--
-- 무엇을 세우는가
--   PROJECT·M&A 공용 '파일받기' 모듈의 DB 계약. WORKS가 임의 깊이의 폴더·문항 트리를 초안으로
--   짜고(모듈이 '준비'여도 초안은 짤 수 있다), 공개(publish)하면 트리가 잠기고 배정된 게스트마다
--   문항별 응답 칸이 선다. 게스트는 자기 응답 칸에만 파일 여러 개와 코멘트를 붙여 **문항 단위로**
--   제출하고, WORKS는 문항마다 승인 또는 보완요청으로 회차를 올린다.
--
-- 왜 attachments를 쓰지 않는가 (되돌리지 말 것)
--   attachments_guest_select는 **모듈 전체 공유**다 — 같은 모듈에 붙은 파일이면 그 모듈을 보는
--   게스트 전원에게 열린다. 이 기능의 전제는 정확히 그 반대(같은 기업이어도 게스트끼리 파일·
--   댓글·진행률 비공유)이므로 같은 표에 넣는 순간 전제가 깨진다. 그래서 파일은 전용 표와 전용
--   비공개 버킷 `file-collection`이 갖는다. 게스트의 직접 Storage 접근과 직접 DML은 열지 않는다.
--
-- 쓰기는 전부 RPC다
--   여섯 표 모두 authenticated에 SELECT만 준다. 상태·회차·행위자·파일 경로는 서버가 소유한다.
--
-- 삭제
--   DELETE 정책 없음. 전부 soft delete(배정은 revoked_at)다. 제출된 회차의 파일·피드백은
--   누구도 지우지 못한다. 응답·파일·코멘트는 app.module_external_record()에 등록해 모듈 하드
--   삭제를 막는다.
--
-- 동시성
--   구조 변경(노드 저장·이동·삭제)·배정·공개는 **같은 collection 행**을 같은 순서로 FOR UPDATE
--   잠근다. 응답 상태·회차를 읽고 쓰는 모든 경로(등록·확정·삭제·제출·검토·댓글)는 **해당 response
--   행**을 FOR UPDATE 잠근다. 잠금 순서는 언제나 collection → response다(교착 없음).
--
-- 보안 게이트(docs/docs_dev/11_migration_security_gate.md) 답변
--   - 소유 워크스페이스: project / mna (행마다 상위 모듈의 entity_key가 답한다. FUND 불가)
--   - 데이터 등급: Restricted(외부 제출물 · 게스트별 격리 대상)
--   - 접근 주체: 내부 사용자(해당 사업 읽기/쓰기 권한자)와 **본인 배정을 가진 활성 게스트**뿐
--   - Scope: module → collection → assignment(=게스트 계정 1) → response(=문항 1)
--   - 감사 로그: 공개·파일 내리기는 audit_logs에 남는다. 다운로드는 전용 Edge가 access_logs
--     적재에 성공한 뒤에만 60초 서명 URL을 발급한다(적재 실패 시 미발급). DB 계약은
--     file_collection_authorize_download() — 권한 판정과 경로 회신만 한다.
--   - SECURITY DEFINER: 전부 `set search_path = app, public` 고정, 첫머리에서 호출자 권한을
--     직접 확인한다. 판정 헬퍼는 RLS 정책이 **호출자 권한으로** 평가하므로 authenticated에
--     EXECUTE를 준다(PUBLIC·anon 회수). 인가는 헬퍼 내부가 한다.
--   - Storage: 신규 비공개 버킷 `file-collection`. storage.objects 정책을 새로 열지 않는다.
--     앱 롤에 storage 권한이 없으므로 실물은 Edge의 service_role만 연다. 확정(commit)은
--     **DB가 storage.objects를 직접 읽어** 실물 존재·크기·형식을 검증한다(클라이언트 신고값 불신).
-- =====================================================================

-- ---------------------------------------------------------------------
-- (0) 상태 enum
-- ---------------------------------------------------------------------
do $$ begin
  create type public.file_collection_status as enum
    ('NOT_SUBMITTED', 'DRAFT', 'SUBMITTED', 'REWORK_REQUESTED', 'APPROVED');
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------
-- (1) 원장 6종
--     모든 하위표가 program_module_id 단일 컬럼 FK를 갖는다(app.module_content_tables()가
--     이 FK로 모듈 내용물을 찾는다). 표 사이 FK는 cascade이며, 실제 삭제 차단은 (7)이 한다.
-- ---------------------------------------------------------------------

create table if not exists public.file_collections (
  id                uuid primary key default gen_random_uuid(),
  program_module_id uuid not null unique references public.program_modules(id) on delete cascade,
  title             text not null default '',
  guide             text,
  published_at      timestamptz,
  published_by      uuid references public.users(id),
  created_by        uuid references public.users(id),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  deleted_at        timestamptz
);

comment on table public.file_collections is
  '파일받기 모듈의 머리 행(모듈당 1). published_at이 트리 잠금의 정본이며 한 번 서면 되돌리지 않는다.';

create table if not exists public.file_collection_nodes (
  id                uuid primary key default gen_random_uuid(),
  program_module_id uuid not null references public.program_modules(id) on delete cascade,
  collection_id     uuid not null references public.file_collections(id) on delete cascade,
  parent_id         uuid references public.file_collection_nodes(id) on delete cascade,
  node_type         text not null check (node_type in ('FOLDER', 'QUESTION')),
  title             text not null,
  guide             text,
  is_required       boolean not null default false,
  sort_order        integer not null default 0,
  created_by        uuid references public.users(id),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  deleted_at        timestamptz
);

create index if not exists idx_fc_nodes_module     on public.file_collection_nodes (program_module_id);
create index if not exists idx_fc_nodes_collection on public.file_collection_nodes (collection_id, parent_id, sort_order);

comment on table public.file_collection_nodes is
  '파일받기 트리(깊이 제한 없음). FOLDER=묶음, QUESTION=문항(파일을 받는 잎). 순환은 트리거가 막는다.';

-- 배정 = 게스트 **계정** 하나의 제출 공간. 명부 줄이 여럿이어도 계정당 하나다.
create table if not exists public.file_collection_assignments (
  id                uuid primary key default gen_random_uuid(),
  program_module_id uuid not null references public.program_modules(id) on delete cascade,
  collection_id     uuid not null references public.file_collections(id) on delete cascade,
  -- 명부 제외(하드 삭제) 경로가 제출물·피드백까지 함께 지우지 않도록 기록 보존형이다.
  -- 명부가 사라지면 여기는 NULL이 되고, 판정 헬퍼가 살아 있는 명부를 요구하므로 접근은 닫힌다.
  participant_id    uuid references public.program_participants(id) on delete set null,
  guest_user_id     uuid not null references public.users(id),
  assigned_by       uuid references public.users(id),
  assigned_at       timestamptz not null default now(),
  revoked_at        timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  deleted_at        timestamptz
);

-- 계정 단위 격리이므로 유일성의 축은 guest_user_id다(한 계정이 여러 명부 줄을 가져도 1개).
create unique index if not exists uq_fc_assignment_live_user
  on public.file_collection_assignments (collection_id, guest_user_id)
  where deleted_at is null;
create index if not exists idx_fc_assignments_guest on public.file_collection_assignments (guest_user_id);
create index if not exists idx_fc_assignments_participant on public.file_collection_assignments (participant_id);

comment on table public.file_collection_assignments is
  '파일받기 배정(게스트 계정 1인 단위). 같은 기업의 다른 게스트라도 배정이 다르면 서로의 파일·댓글·진행률을 보지 못한다.';

create table if not exists public.file_collection_responses (
  id                uuid primary key default gen_random_uuid(),
  program_module_id uuid not null references public.program_modules(id) on delete cascade,
  assignment_id     uuid not null references public.file_collection_assignments(id) on delete cascade,
  node_id           uuid not null references public.file_collection_nodes(id) on delete cascade,
  status            public.file_collection_status not null default 'NOT_SUBMITTED',
  round             integer not null default 1,
  submitted_at      timestamptz,
  reviewed_at       timestamptz,
  reviewed_by       uuid references public.users(id),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  deleted_at        timestamptz,
  unique (assignment_id, node_id)
);

create index if not exists idx_fc_responses_module on public.file_collection_responses (program_module_id);

comment on table public.file_collection_responses is
  '문항별 응답 칸. 제출·검토는 이 단위로 일어난다(다른 문항이 비어도 이 문항은 제출된다). 상태·회차는 서버만 적는다.';

create table if not exists public.file_collection_files (
  id                uuid primary key default gen_random_uuid(),
  program_module_id uuid not null references public.program_modules(id) on delete cascade,
  response_id       uuid not null references public.file_collection_responses(id) on delete cascade,
  round             integer not null,
  storage_bucket    text not null default 'file-collection',
  storage_path      text not null unique,
  original_name     text not null,
  content_type      text,
  byte_size         bigint,
  status            text not null default 'PENDING' check (status in ('PENDING', 'READY')),
  uploaded_by       uuid not null references public.users(id),
  created_at        timestamptz not null default now(),
  ready_at          timestamptz,
  deleted_at        timestamptz
);

create index if not exists idx_fc_files_response on public.file_collection_files (response_id, round);

comment on table public.file_collection_files is
  '파일받기 제출 파일. storage_path는 서버가 만들고 불변이다. PENDING은 실물이 아직 확인되지 않은 상태이며 제출 계산에 들지 않는다.';

create table if not exists public.file_collection_comments (
  id                uuid primary key default gen_random_uuid(),
  program_module_id uuid not null references public.program_modules(id) on delete cascade,
  response_id       uuid not null references public.file_collection_responses(id) on delete cascade,
  round             integer not null,
  author_user_id    uuid not null references public.users(id),
  author_side       text not null check (author_side in ('WORKS', 'GUEST')),
  body              text not null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  deleted_at        timestamptz
);

create index if not exists idx_fc_comments_response on public.file_collection_comments (response_id, round);

comment on table public.file_collection_comments is
  '응답별 코멘트. author_user_id·author_side는 서버가 적는다(게스트가 WORKS를 사칭할 수 없다).';

do $$
declare t text;
begin
  foreach t in array array[
    'file_collections', 'file_collection_nodes', 'file_collection_assignments',
    'file_collection_responses', 'file_collection_files', 'file_collection_comments'
  ] loop
    execute format('drop trigger if exists %I on public.%I', 'trg_' || t || '_updated_at', t);
    if t <> 'file_collection_files' then
      execute format(
        'create trigger %I before update on public.%I for each row execute function app.set_updated_at()',
        'trg_' || t || '_updated_at', t);
    end if;
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- (2) 판정 헬퍼 — 정책과 RPC가 같은 함수를 쓴다
-- ---------------------------------------------------------------------

-- 내부 읽기: 로그인한 내부 사용자이고, 대상이 **파일받기 모듈**이며, 그 모듈이 PROJECT·M&A에
-- 속하고, 해당 워크스페이스와 사업에 접근할 수 있는가. FUND는 entity_key에서 걸러진다.
-- M&A 비밀딜 경계는 app.can_access_ws_program('mna', ...)이 이미 갖고 있으므로 재사용한다.
create or replace function app.file_collection_internal_read(p_module_id uuid)
returns boolean
language sql
stable
security definer
set search_path = app, public
as $$
  select app.current_app_user_id() is not null
     and not app.is_guest()
     and exists (
       select 1 from public.program_modules m
        where m.id = p_module_id
          and m.module_type = 'FILE_COLLECTION'
          and m.entity_key in ('program', 'ma_program')
          and app.can_read_workspace(app.entity_key_workspace(m.entity_key))
          and app.can_access_ws_program(app.entity_key_workspace(m.entity_key), m.program_id)
     );
$$;

create or replace function app.file_collection_internal_write(p_module_id uuid)
returns boolean
language sql
stable
security definer
set search_path = app, public
as $$
  select app.current_app_user_id() is not null
     and not app.is_guest()
     and exists (
       select 1 from public.program_modules m
        where m.id = p_module_id
          and m.module_type = 'FILE_COLLECTION'
          and m.entity_key in ('program', 'ma_program')
          and app.can_write_workspace(app.entity_key_workspace(m.entity_key))
          and app.can_access_ws_program(app.entity_key_workspace(m.entity_key), m.program_id)
     );
$$;

comment on function app.file_collection_internal_read(uuid) is
  '파일받기: 내부 사용자의 모듈 읽기 판정(파일받기 모듈 · PROJECT/M&A · 워크스페이스 · 사업 접근). 게스트는 항상 false.';
comment on function app.file_collection_internal_write(uuid) is
  '파일받기: 내부 사용자의 모듈 쓰기 판정. 게스트는 항상 false.';

-- 게스트 배정 집합. 신원(app.current_app_user_id — session_version 검사 포함), 계정 활성,
-- 명부 줄 생존·ACTIVE, 모듈 개방(app.guest_open_module_ids — 세션 고정 맥락 포함), 공개 여부를
-- 모두 통과한 것만 답한다. 회수(revoked)·소프트 삭제·남의 배정은 여기서 사라진다.
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
     and c.published_at is not null
     and u.is_active
     and u.deleted_at is null
     and app.is_guest_user_type(u.user_type)
     and p.user_id = a.guest_user_id
     and p.login_status = 'ACTIVE'
     and a.program_module_id in (select app.guest_open_module_ids());
$$;

comment on function app.file_collection_guest_assignment_ids() is
  '지금 세션의 게스트가 가진 유효 배정. 신원·계정 활성·세션 맥락·명부 생존/활성·모듈 개방·공개 여부를 모두 통과한 것만 답한다.';

create or replace function app.file_collection_guest_writable_assignment_ids()
returns setof uuid
language sql
stable
security definer
set search_path = app, public
as $$
  select a.id
    from public.file_collection_assignments a
    join public.program_modules m on m.id = a.program_module_id
   where a.id in (select app.file_collection_guest_assignment_ids())
     and m.status = 'OPEN';
$$;

comment on function app.file_collection_guest_writable_assignment_ids() is
  '게스트가 쓰기까지 할 수 있는 배정(모듈 OPEN). CLOSED 모듈은 읽기만 남는다.';

-- ---------------------------------------------------------------------
-- (3) 무결성 트리거
-- ---------------------------------------------------------------------

create or replace function app.fc_node_guard()
returns trigger
language plpgsql
security definer
set search_path = app, public
as $$
declare
  v_published timestamptz;
  v_module    uuid;
  v_cursor    uuid;
  v_seen      uuid[] := array[]::uuid[];
begin
  select c.published_at, c.program_module_id into v_published, v_module
    from public.file_collections c where c.id = new.collection_id;
  if v_module is null then
    raise exception '파일받기 원장을 찾을 수 없습니다.' using errcode = '23503';
  end if;
  new.program_module_id := v_module;

  -- 공개 후에는 트리 구조가 불변이다. 소프트 삭제도 구조 변경이므로 함께 막는다.
  if v_published is not null then
    if tg_op = 'INSERT' then
      raise exception '공개된 파일받기에는 문항을 더할 수 없습니다.' using errcode = 'P0001';
    end if;
    if new.parent_id is distinct from old.parent_id
       or new.node_type is distinct from old.node_type
       or new.sort_order is distinct from old.sort_order
       or new.is_required is distinct from old.is_required
       or new.deleted_at is distinct from old.deleted_at then
      raise exception '공개된 파일받기의 트리 구조는 바꿀 수 없습니다.' using errcode = 'P0001';
    end if;
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
    -- 깊이 상한은 두지 않는다 — 자유 깊이가 이 기능의 요구다.
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

drop trigger if exists trg_fc_node_guard on public.file_collection_nodes;
create trigger trg_fc_node_guard before insert or update on public.file_collection_nodes
  for each row execute function app.fc_node_guard();

-- 배정 무결성. 명부 검증은 **배정을 세우거나 대상을 갈아끼울 때만** 한다 —
-- 회수(revoked_at)·소프트 삭제는 명부가 이미 정지·삭제된 뒤에도 반드시 가능해야 한다.
create or replace function app.fc_assignment_guard()
returns trigger
language plpgsql
security definer
set search_path = app, public
as $$
declare
  v_module  uuid;
  v_entity  text;
  v_program uuid;
begin
  select c.program_module_id into v_module from public.file_collections c where c.id = new.collection_id;
  if v_module is null then
    raise exception '파일받기 원장을 찾을 수 없습니다.' using errcode = '23503';
  end if;
  new.program_module_id := v_module;

  if tg_op = 'UPDATE'
     and new.participant_id is not distinct from old.participant_id
     and new.guest_user_id is not distinct from old.guest_user_id
     and new.revoked_at is not null then
    return new;  -- 회수·재저장: 대상이 그대로면 명부 상태를 다시 묻지 않는다.
  end if;

  -- 명부 줄 물리 삭제에 따른 FK 연결 해제(ON DELETE SET NULL). 대상 계정·원장이 그대로이고
  -- 명부 줄만 사라진 경우에만 허용하며, 접근은 즉시 끊고(revoked_at) 자료 이력은 남긴다.
  if tg_op = 'UPDATE'
     and new.participant_id is null
     and old.participant_id is not null
     and new.guest_user_id is not distinct from old.guest_user_id
     and new.collection_id is not distinct from old.collection_id then
    new.revoked_at := coalesce(old.revoked_at, now());
    return new;
  end if;

  if new.participant_id is null then
    raise exception '명부 줄이 없는 배정은 세울 수 없습니다.' using errcode = 'P0001';
  end if;

  select m.entity_key, m.program_id into v_entity, v_program
    from public.program_modules m where m.id = v_module;

  -- 그 사업의 유효한 개별 게스트 계정인가. 명부 줄·로그인 개방·계정 활성·게스트 종류를 함께 본다.
  if not exists (
    select 1
      from public.program_participants p
      join public.users u on u.id = p.user_id
     where p.id = new.participant_id
       and p.entity_key = v_entity
       and p.program_id = v_program
       and p.user_id = new.guest_user_id
       and p.login_status = 'ACTIVE'
       and app.is_guest_user_type(u.user_type)
       and u.is_active
       and u.deleted_at is null
  ) then
    raise exception '이 사업의 유효한 게스트 계정이 아닙니다.' using errcode = 'P0001';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_fc_assignment_guard on public.file_collection_assignments;
create trigger trg_fc_assignment_guard before insert or update on public.file_collection_assignments
  for each row execute function app.fc_assignment_guard();

create or replace function app.fc_response_guard()
returns trigger
language plpgsql
security definer
set search_path = app, public
as $$
declare
  v_module uuid;
begin
  -- 배정과 문항이 같은 파일받기에 속하는가(교차 모듈 꽂기 차단).
  select a.program_module_id into v_module
    from public.file_collection_assignments a
    join public.file_collection_nodes n on n.collection_id = a.collection_id
   where a.id = new.assignment_id
     and n.id = new.node_id
     and n.node_type = 'QUESTION';
  if v_module is null then
    raise exception '배정과 문항이 같은 파일받기에 속하지 않습니다.' using errcode = 'P0001';
  end if;
  new.program_module_id := v_module;
  if new.round < 1 then
    raise exception '회차는 1보다 작을 수 없습니다.' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_fc_response_guard on public.file_collection_responses;
create trigger trg_fc_response_guard before insert or update on public.file_collection_responses
  for each row execute function app.fc_response_guard();

create or replace function app.fc_file_guard()
returns trigger
language plpgsql
security definer
set search_path = app, public
as $$
declare
  v_module uuid;
begin
  if tg_op = 'INSERT' then
    select r.program_module_id into v_module
      from public.file_collection_responses r where r.id = new.response_id;
    if v_module is null then
      raise exception '응답 칸을 찾을 수 없습니다.' using errcode = '23503';
    end if;
    new.program_module_id := v_module;
    return new;
  end if;

  -- 실물 메타는 불변이다. 같은 경로에 다른 실물을 덮어쓰는 길을 열지 않는다.
  if new.storage_path  is distinct from old.storage_path
     or new.storage_bucket is distinct from old.storage_bucket
     or new.original_name  is distinct from old.original_name
     or new.round          is distinct from old.round
     or new.response_id    is distinct from old.response_id
     or new.uploaded_by    is distinct from old.uploaded_by then
    raise exception '업로드된 파일의 경로·이름·회차·소유자는 바꿀 수 없습니다.' using errcode = 'P0001';
  end if;
  if old.status = 'READY' and new.status = 'PENDING' then
    raise exception '확정된 파일을 대기 상태로 되돌릴 수 없습니다.' using errcode = 'P0001';
  end if;
  if old.status = 'READY'
     and (new.byte_size is distinct from old.byte_size or new.content_type is distinct from old.content_type) then
    raise exception '확정된 파일의 크기·형식은 바꿀 수 없습니다.' using errcode = 'P0001';
  end if;
  -- 소프트 삭제는 한 방향이다(되살리기 없음 — 이력은 불변이어야 한다).
  if old.deleted_at is not null and new.deleted_at is null then
    raise exception '내린 파일을 되살릴 수 없습니다.' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_fc_file_guard on public.file_collection_files;
create trigger trg_fc_file_guard before insert or update on public.file_collection_files
  for each row execute function app.fc_file_guard();

-- ---------------------------------------------------------------------
-- (4) RLS — 읽기만 정책으로 열고, 쓰기는 RPC가 한다
-- ---------------------------------------------------------------------
alter table public.file_collections            enable row level security;
alter table public.file_collection_nodes       enable row level security;
alter table public.file_collection_assignments enable row level security;
alter table public.file_collection_responses   enable row level security;
alter table public.file_collection_files       enable row level security;
alter table public.file_collection_comments    enable row level security;

drop policy if exists file_collections_internal_select on public.file_collections;
create policy file_collections_internal_select on public.file_collections for select
  using (deleted_at is null and app.file_collection_internal_read(program_module_id));

drop policy if exists file_collections_guest_select on public.file_collections;
create policy file_collections_guest_select on public.file_collections for select
  using (
    deleted_at is null
    and app.is_guest()
    and exists (
      select 1 from public.file_collection_assignments a
       where a.collection_id = file_collections.id
         and a.id in (select app.file_collection_guest_assignment_ids())
    )
  );

drop policy if exists file_collections_internal_insert on public.file_collections;
create policy file_collections_internal_insert on public.file_collections for insert
  with check (app.file_collection_internal_write(program_module_id));

drop policy if exists file_collections_internal_update on public.file_collections;
create policy file_collections_internal_update on public.file_collections for update
  using (app.file_collection_internal_write(program_module_id))
  with check (app.file_collection_internal_write(program_module_id));

drop policy if exists file_collection_nodes_internal_select on public.file_collection_nodes;
create policy file_collection_nodes_internal_select on public.file_collection_nodes for select
  using (deleted_at is null and app.file_collection_internal_read(program_module_id));

drop policy if exists file_collection_nodes_guest_select on public.file_collection_nodes;
create policy file_collection_nodes_guest_select on public.file_collection_nodes for select
  using (
    deleted_at is null
    and app.is_guest()
    and exists (
      select 1 from public.file_collection_assignments a
       where a.collection_id = file_collection_nodes.collection_id
         and a.id in (select app.file_collection_guest_assignment_ids())
    )
  );

drop policy if exists file_collection_nodes_internal_insert on public.file_collection_nodes;
create policy file_collection_nodes_internal_insert on public.file_collection_nodes for insert
  with check (app.file_collection_internal_write(program_module_id));

drop policy if exists file_collection_nodes_internal_update on public.file_collection_nodes;
create policy file_collection_nodes_internal_update on public.file_collection_nodes for update
  using (app.file_collection_internal_write(program_module_id))
  with check (app.file_collection_internal_write(program_module_id));

-- 배정: 게스트는 **자기 배정만** 본다(같은 기업의 다른 게스트 명부를 볼 수 없다).
drop policy if exists file_collection_assignments_internal_select on public.file_collection_assignments;
create policy file_collection_assignments_internal_select on public.file_collection_assignments for select
  using (deleted_at is null and app.file_collection_internal_read(program_module_id));

drop policy if exists file_collection_assignments_guest_select on public.file_collection_assignments;
create policy file_collection_assignments_guest_select on public.file_collection_assignments for select
  using (id in (select app.file_collection_guest_assignment_ids()));

drop policy if exists file_collection_assignments_internal_insert on public.file_collection_assignments;
create policy file_collection_assignments_internal_insert on public.file_collection_assignments for insert
  with check (app.file_collection_internal_write(program_module_id));

drop policy if exists file_collection_assignments_internal_update on public.file_collection_assignments;
create policy file_collection_assignments_internal_update on public.file_collection_assignments for update
  using (app.file_collection_internal_write(program_module_id))
  with check (app.file_collection_internal_write(program_module_id));

do $$
declare t text;
begin
  foreach t in array array[
    'file_collection_responses', 'file_collection_files', 'file_collection_comments'
  ] loop
    execute format('drop policy if exists %I on public.%I', t || '_internal_select', t);
    execute format(
      'create policy %I on public.%I for select using (deleted_at is null and app.file_collection_internal_read(program_module_id))',
      t || '_internal_select', t);
    execute format('drop policy if exists %I on public.%I', t || '_internal_insert', t);
    execute format(
      'create policy %I on public.%I for insert with check (app.file_collection_internal_write(program_module_id))',
      t || '_internal_insert', t);
    execute format('drop policy if exists %I on public.%I', t || '_internal_update', t);
    execute format(
      'create policy %I on public.%I for update using (app.file_collection_internal_write(program_module_id)) with check (app.file_collection_internal_write(program_module_id))',
      t || '_internal_update', t);
  end loop;
end $$;

drop policy if exists file_collection_responses_guest_select on public.file_collection_responses;
create policy file_collection_responses_guest_select on public.file_collection_responses for select
  using (deleted_at is null and assignment_id in (select app.file_collection_guest_assignment_ids()));

drop policy if exists file_collection_files_guest_select on public.file_collection_files;
create policy file_collection_files_guest_select on public.file_collection_files for select
  using (
    deleted_at is null
    and exists (
      select 1 from public.file_collection_responses r
       where r.id = file_collection_files.response_id
         and r.assignment_id in (select app.file_collection_guest_assignment_ids())
    )
  );

drop policy if exists file_collection_comments_guest_select on public.file_collection_comments;
create policy file_collection_comments_guest_select on public.file_collection_comments for select
  using (
    deleted_at is null
    and exists (
      select 1 from public.file_collection_responses r
       where r.id = file_collection_comments.response_id
         and r.assignment_id in (select app.file_collection_guest_assignment_ids())
    )
  );

-- ---------------------------------------------------------------------
-- (5) 권한 — anon 0, authenticated는 SELECT만. service_role에도 주지 않는다.
--     Edge는 호출자 JWT로 읽고 RPC로 쓰며, service_role은 Storage와 access_logs에만 쓴다.
--     TRUNCATE/REFERENCES/TRIGGER는 앱 롤에 두지 않는다.
-- ---------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array[
    'file_collections', 'file_collection_nodes', 'file_collection_assignments',
    'file_collection_responses', 'file_collection_files', 'file_collection_comments'
  ] loop
    -- 기본 권한 회수(20260912160500)는 anon·authenticated만 비웠으므로, 새로 만든 표는
    -- service_role 쪽 기본값을 그대로 물려받습니다. 이 표들은 service_role이 쓸 일이
    -- 없으므로(Edge는 Storage와 access_logs에만 service_role을 씁니다) 이름을 적어 회수합니다.
    -- PUBLIC 경유 상속도 같은 줄에서 끊습니다. `all`이라 TRUNCATE·REFERENCES·TRIGGER도 함께 빠집니다.
    execute format('revoke all on public.%I from public, anon, authenticated, service_role', t);
    execute format('grant select on public.%I to authenticated', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- (6) Storage — 전용 비공개 버킷. storage.objects 정책을 새로 열지 않는다.
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit)
values ('file-collection', 'file-collection', false, 104857600)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------
-- (7) 모듈 하드 삭제 차단 — 밖에서 들어온 기록을 더한다
-- ---------------------------------------------------------------------
create or replace function app.module_external_record(p_rel_name text)
returns boolean
language sql
immutable
set search_path = app, public
as $$
  select regexp_replace(p_rel_name, '^(?:ma|project)_', '') in (
    -- 모집: 지원자가 낸 것.
    'application_submissions',
    'application_answers',
    -- 파일받기: 게스트가 낸 것(2026-09-13). 공개 시 미리 서는 빈 응답까지 포함해 보수적으로
    -- 막는다 — 모듈을 지워 제출물을 조용히 잃는 것보다 못 지우는 편이 낫다.
    'file_collection_responses',
    'file_collection_files',
    'file_collection_comments'
  );
$$;

comment on function app.module_external_record(text) is
  '모듈 삭제를 막는 외부 유입 기록 판정. 밖에서 들어오는 원장을 새로 만들면 반드시 여기에 넣어야 한다. (2026-09-13 — 파일받기 3종 추가.)';

-- =====================================================================
-- (8) RPC 계약 — 쓰기는 전부 여기를 지난다
--     구조 계열은 collection 행을, 응답 계열은 response 행을 FOR UPDATE로 잡고 시작한다.
-- =====================================================================

-- 8-0. 머리 행 생성·수정(초안). 모듈이 '준비'여도 WORKS는 초안을 짤 수 있다.
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
    return v_id;
  end if;

  update public.file_collections
     set title = coalesce(p_title, title), guide = p_guide
   where id = v_id;
  return v_id;
end;
$$;

-- 8-1. 노드 저장(생성·수정). 낙관적 잠금: p_expected_updated_at이 오면 대조한다.
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
  if v_published is not null then
    raise exception '공개된 파일받기의 문항은 바꿀 수 없습니다.' using errcode = 'P0001';
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

-- 8-2. 노드 이동(부모·순서). 순환은 트리거가 막는다.
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
  if v_published is not null then
    raise exception '공개된 파일받기의 트리는 바꿀 수 없습니다.' using errcode = 'P0001';
  end if;

  update public.file_collection_nodes
     set parent_id = p_parent_id, sort_order = coalesce(p_sort_order, 0)
   where id = p_node_id;
end;
$$;

-- 8-2b. 형제 순서 한 칸 이동 — **한 트랜잭션 안에서** 끝난다.
--       왜 따로 두는가: 순서 바꾸기는 형제 여럿의 `sort_order`가 함께 달라지는 일이라
--       8-2를 n번 부르면 중간에서 끊길 때 앞쪽만 반영된 채 남는다(= 누른 뜻과 다른 순서).
--       여기서는 현재 형제를 실제 순서(sort_order, id)로 줄 세우고 인접한 둘을 맞바꾼 뒤
--       **한 UPDATE로** 1..n을 다시 매긴다. 부모를 바꾸는 이동은 8-2가 계속 맡는다.
--       잠금은 저장·공개와 같은 collection 행을 같은 순서로 잡는다(교착 없음).
--       양 끝에서는 아무것도 바꾸지 않고 false를 답한다(오류가 아니다).
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
  if v_published is not null then
    raise exception '공개된 파일받기의 트리는 바꿀 수 없습니다.' using errcode = 'P0001';
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

comment on function public.file_collection_reorder_node(uuid, text) is
  '파일받기 형제 순서를 한 칸 올리거나 내린다. 맞바꿈과 1..n 재번호가 한 트랜잭션·한 UPDATE로 끝나며, 양 끝에서는 false(무변화)다. 부모 변경은 file_collection_move_node가 맡는다.';

-- 8-3. 노드 삭제(소프트, 자손까지). 공개 후에는 불가.
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
  if v_published is not null then
    raise exception '공개된 파일받기의 문항은 지울 수 없습니다.' using errcode = 'P0001';
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

-- 8-4. 대상 배정(일괄). 이미 회수된 배정은 **같은 행을 되살려** 이력을 잇는다.
--      공개 이후에 더한 대상에게도 응답 칸을 바로 세운다.
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
    if v_published is not null then
      insert into public.file_collection_responses (assignment_id, node_id, program_module_id)
      select v_assignment, n.id, v_module
        from public.file_collection_nodes n
       where n.collection_id = p_collection_id and n.node_type = 'QUESTION' and n.deleted_at is null
      on conflict (assignment_id, node_id) do nothing;
    end if;
  end loop;

  return v_count;
end;
$$;

-- 8-5. 배정 회수(소프트). 제출된 파일·피드백은 남는다. 명부가 이미 정지된 대상도 회수된다.
create or replace function public.file_collection_revoke_assignment(p_assignment_id uuid)
returns void
language plpgsql
security definer
set search_path = app, public
as $$
declare v_module uuid;
begin
  select a.program_module_id into v_module
    from public.file_collection_assignments a where a.id = p_assignment_id and a.deleted_at is null
   for update;
  if v_module is null then
    raise exception '배정을 찾을 수 없습니다.' using errcode = 'P0001';
  end if;
  if not app.file_collection_internal_write(v_module) then
    raise exception '이 모듈을 편집할 권한이 없습니다.' using errcode = '42501';
  end if;

  update public.file_collection_assignments
     set revoked_at = coalesce(revoked_at, now())
   where id = p_assignment_id;
end;
$$;

-- 8-6. 공개(publish). 이 시점부터 트리가 잠기고 응답 칸이 선다.
create or replace function public.file_collection_publish(p_collection_id uuid)
returns timestamptz
language plpgsql
security definer
set search_path = app, public
as $$
declare v_module uuid; v_published timestamptz; v_questions integer; v_targets integer;
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
  if v_published is not null then
    return v_published;  -- 멱등. 잠금은 되돌리지 않는다.
  end if;

  select count(*) into v_questions from public.file_collection_nodes
   where collection_id = p_collection_id and node_type = 'QUESTION' and deleted_at is null;
  if v_questions = 0 then
    raise exception '문항이 하나도 없으면 공개할 수 없습니다.' using errcode = 'P0001';
  end if;

  select count(*) into v_targets from public.file_collection_assignments
   where collection_id = p_collection_id and deleted_at is null and revoked_at is null;
  if v_targets = 0 then
    raise exception '받는 사람이 없으면 공개할 수 없습니다.' using errcode = 'P0001';
  end if;

  update public.file_collections
     set published_at = now(), published_by = app.current_app_user_id()
   where id = p_collection_id
  returning published_at into v_published;

  insert into public.file_collection_responses (assignment_id, node_id, program_module_id)
  select a.id, n.id, v_module
    from public.file_collection_assignments a
    join public.file_collection_nodes n on n.collection_id = a.collection_id
   where a.collection_id = p_collection_id
     and a.deleted_at is null and a.revoked_at is null
     and n.node_type = 'QUESTION' and n.deleted_at is null
  on conflict (assignment_id, node_id) do nothing;

  insert into public.audit_logs (actor_user_id, action, after_data, reason)
  values (
    app.current_app_user_id(), 'FILE_COLLECTION_PUBLISH',
    jsonb_build_object('collection_id', p_collection_id, 'program_module_id', v_module,
                       'questions', v_questions, 'targets', v_targets),
    '파일받기 공개(트리 잠금)'
  );

  return v_published;
end;
$$;

-- 8-7. 업로드 등록(서명 전). 경로는 서버가 만든다 — 클라이언트가 고른 경로는 받지 않는다.
--      p_byte_size는 참고 신고값일 뿐이며, 확정은 실물 메타가 판정한다.
create or replace function public.file_collection_register_upload(
  p_response_id  uuid,
  p_original_name text,
  p_content_type  text default null,
  p_byte_size     bigint default null
) returns table (file_id uuid, storage_bucket text, storage_path text)
language plpgsql
security definer
set search_path = app, public
as $$
declare
  v_assignment uuid; v_module uuid; v_round integer; v_status public.file_collection_status;
  v_file uuid := gen_random_uuid(); v_path text;
begin
  select r.assignment_id, r.program_module_id, r.round, r.status
    into v_assignment, v_module, v_round, v_status
    from public.file_collection_responses r where r.id = p_response_id and r.deleted_at is null
   for update;
  if v_assignment is null then
    raise exception '응답 칸을 찾을 수 없습니다.' using errcode = 'P0001';
  end if;
  if v_assignment not in (select app.file_collection_guest_writable_assignment_ids()) then
    raise exception '이 문항에 올릴 권한이 없습니다.' using errcode = '42501';
  end if;
  if v_status in ('SUBMITTED', 'APPROVED') then
    raise exception '제출한 문항에는 파일을 더할 수 없습니다.' using errcode = 'P0001';
  end if;
  if coalesce(p_original_name, '') = '' then
    raise exception '파일 이름이 필요합니다.' using errcode = 'P0001';
  end if;
  if p_byte_size is not null and (p_byte_size <= 0 or p_byte_size > 104857600) then
    raise exception '파일 크기가 허용 범위를 벗어났습니다(0 초과 100MB 이하).' using errcode = 'P0001';
  end if;

  v_path := format('%s/%s/%s/r%s/%s', v_module, v_assignment, p_response_id, v_round, v_file);

  insert into public.file_collection_files
    (id, response_id, round, storage_path, original_name, content_type, byte_size, status, uploaded_by, program_module_id)
  values
    (v_file, p_response_id, v_round, v_path, p_original_name, p_content_type, p_byte_size,
     'PENDING', app.current_app_user_id(), v_module);

  return query select v_file, 'file-collection'::text, v_path;
end;
$$;

-- 8-8. 업로드 확정. **실물을 DB가 직접 본다** — storage.objects에서 정확한 버킷·이름으로
--      메타를 읽어 크기·형식을 가져온다. 클라이언트가 크기를 보내는 길은 없다(위조 불가).
--      실물이 없으면 확정되지 않으므로 '올리지 않고 READY'가 성립하지 않는다.
create or replace function public.file_collection_commit_upload(p_file_id uuid)
returns uuid
language plpgsql
security definer
set search_path = app, public
as $$
declare
  v_response uuid; v_assignment uuid; v_r_status public.file_collection_status; v_r_round integer;
  v_owner uuid; v_status text; v_declared bigint; v_round integer;
  v_bucket text; v_path text;
  v_actual_size bigint; v_actual_type text;
begin
  select f.response_id into v_response
    from public.file_collection_files f where f.id = p_file_id and f.deleted_at is null;
  if v_response is null then
    raise exception '파일을 찾을 수 없습니다.' using errcode = 'P0001';
  end if;

  -- 잠금 순서: response → file.
  select r.assignment_id, r.status, r.round into v_assignment, v_r_status, v_r_round
    from public.file_collection_responses r where r.id = v_response and r.deleted_at is null
   for update;
  if v_assignment is null then
    raise exception '응답 칸을 찾을 수 없습니다.' using errcode = 'P0001';
  end if;

  select f.uploaded_by, f.status, f.byte_size, f.round, f.storage_bucket, f.storage_path
    into v_owner, v_status, v_declared, v_round, v_bucket, v_path
    from public.file_collection_files f where f.id = p_file_id and f.deleted_at is null
   for update;

  -- 남의 PENDING을 대신 확정할 수 없다.
  if v_owner <> app.current_app_user_id() then
    raise exception '본인이 올린 파일만 확정할 수 있습니다.' using errcode = '42501';
  end if;
  if v_assignment not in (select app.file_collection_guest_writable_assignment_ids()) then
    raise exception '이 문항에 올릴 권한이 없습니다.' using errcode = '42501';
  end if;
  if v_status = 'READY' then
    return p_file_id;  -- 멱등
  end if;
  if v_r_status in ('SUBMITTED', 'APPROVED') then
    raise exception '제출한 문항에는 파일을 더할 수 없습니다.' using errcode = 'P0001';
  end if;
  if v_round <> v_r_round then
    raise exception '지난 회차의 파일은 확정할 수 없습니다.' using errcode = 'P0001';
  end if;

  -- 실물 확인. 버킷·이름이 정확히 일치하는 객체가 있어야 하며 메타는 그 객체가 답한다.
  select (o.metadata->>'size')::bigint, o.metadata->>'mimetype'
    into v_actual_size, v_actual_type
    from storage.objects o
   where o.bucket_id = v_bucket and o.name = v_path;
  if v_actual_size is null then
    raise exception '업로드된 실물을 확인하지 못했습니다.' using errcode = 'P0001';
  end if;
  if v_actual_size <= 0 then
    raise exception '빈 파일은 올릴 수 없습니다.' using errcode = 'P0001';
  end if;
  if v_actual_size > 104857600 then
    raise exception '파일이 너무 큽니다(100MB 초과).' using errcode = 'P0001';
  end if;
  if v_declared is not null and v_declared <> v_actual_size then
    raise exception '업로드된 파일 크기가 신고한 값과 다릅니다.' using errcode = 'P0001';
  end if;

  update public.file_collection_files
     set status = 'READY', ready_at = now(), byte_size = v_actual_size,
         content_type = coalesce(v_actual_type, content_type)
   where id = p_file_id;

  update public.file_collection_responses
     set status = case when status in ('NOT_SUBMITTED', 'REWORK_REQUESTED') then 'DRAFT' else status end
   where id = v_response;

  return p_file_id;
end;
$$;

-- 8-9. 파일 내리기(소프트). **현재 회차의 미제출 파일만** 내릴 수 있다 — 게스트든 WORKS든
--      제출된 회차와 지난 회차의 제출물·근거는 누구도 지우지 못한다(이력 불변).
create or replace function public.file_collection_remove_file(p_file_id uuid)
returns void
language plpgsql
security definer
set search_path = app, public
as $$
declare
  v_response uuid; v_assignment uuid; v_module uuid;
  v_r_status public.file_collection_status; v_r_round integer;
  v_owner uuid; v_round integer;
begin
  select f.response_id into v_response
    from public.file_collection_files f where f.id = p_file_id and f.deleted_at is null;
  if v_response is null then
    raise exception '파일을 찾을 수 없습니다.' using errcode = 'P0001';
  end if;

  select r.assignment_id, r.program_module_id, r.status, r.round
    into v_assignment, v_module, v_r_status, v_r_round
    from public.file_collection_responses r where r.id = v_response and r.deleted_at is null
   for update;
  if v_assignment is null then
    raise exception '응답 칸을 찾을 수 없습니다.' using errcode = 'P0001';
  end if;

  select f.uploaded_by, f.round into v_owner, v_round
    from public.file_collection_files f where f.id = p_file_id and f.deleted_at is null
   for update;

  if app.is_guest() then
    if v_owner <> app.current_app_user_id()
       or v_assignment not in (select app.file_collection_guest_writable_assignment_ids()) then
      raise exception '이 파일을 내릴 권한이 없습니다.' using errcode = '42501';
    end if;
  elsif not app.file_collection_internal_write(v_module) then
    raise exception '이 파일을 내릴 권한이 없습니다.' using errcode = '42501';
  end if;

  if v_r_status in ('SUBMITTED', 'APPROVED') then
    raise exception '제출한 문항의 파일은 내릴 수 없습니다.' using errcode = 'P0001';
  end if;
  if v_round <> v_r_round then
    raise exception '지난 회차의 파일은 내릴 수 없습니다.' using errcode = 'P0001';
  end if;

  update public.file_collection_files set deleted_at = now() where id = p_file_id;

  insert into public.audit_logs (actor_user_id, action, after_data, reason)
  values (
    app.current_app_user_id(), 'FILE_COLLECTION_FILE_REMOVE',
    jsonb_build_object('file_id', p_file_id, 'response_id', v_response,
                       'program_module_id', v_module, 'round', v_round),
    '파일받기 파일 내리기(소프트 삭제)'
  );
end;
$$;

-- 8-10. 제출 — **문항 단위**다. 다른 문항이 비어 있어도 이 문항은 제출된다.
--       전체 필수 진행률은 관제 화면이 응답 목록에서 파생해 보여 준다(여기서 막지 않는다).
create or replace function public.file_collection_submit(p_response_id uuid)
returns public.file_collection_status
language plpgsql
security definer
set search_path = app, public
as $$
declare v_assignment uuid; v_status public.file_collection_status; v_round integer;
begin
  select r.assignment_id, r.status, r.round into v_assignment, v_status, v_round
    from public.file_collection_responses r where r.id = p_response_id and r.deleted_at is null
   for update;
  if v_assignment is null then
    raise exception '응답 칸을 찾을 수 없습니다.' using errcode = 'P0001';
  end if;
  if v_assignment not in (select app.file_collection_guest_writable_assignment_ids()) then
    raise exception '제출할 권한이 없습니다.' using errcode = '42501';
  end if;
  if v_status not in ('NOT_SUBMITTED', 'DRAFT', 'REWORK_REQUESTED') then
    raise exception '이미 제출한 문항입니다.' using errcode = 'P0001';
  end if;
  if not exists (
    select 1 from public.file_collection_files f
     where f.response_id = p_response_id and f.round = v_round
       and f.status = 'READY' and f.deleted_at is null
  ) then
    raise exception '제출할 파일이 없습니다.' using errcode = 'P0001';
  end if;

  update public.file_collection_responses
     set status = 'SUBMITTED', submitted_at = now()
   where id = p_response_id;

  return 'SUBMITTED'::public.file_collection_status;
end;
$$;

-- 8-11. 검토(승인·보완요청). 보완요청은 회차를 올리고 이전 회차 파일은 그대로 둔다.
create or replace function public.file_collection_review(
  p_response_id uuid,
  p_decision    text,
  p_comment     text default null
) returns public.file_collection_status
language plpgsql
security definer
set search_path = app, public
as $$
declare v_module uuid; v_status public.file_collection_status; v_round integer; v_next public.file_collection_status;
begin
  select r.program_module_id, r.status, r.round into v_module, v_status, v_round
    from public.file_collection_responses r where r.id = p_response_id and r.deleted_at is null
   for update;
  if v_module is null then
    raise exception '응답 칸을 찾을 수 없습니다.' using errcode = 'P0001';
  end if;
  if not app.file_collection_internal_write(v_module) then
    raise exception '검토할 권한이 없습니다.' using errcode = '42501';
  end if;
  if p_decision not in ('APPROVED', 'REWORK_REQUESTED') then
    raise exception '알 수 없는 검토 결과입니다.' using errcode = 'P0001';
  end if;
  if v_status <> 'SUBMITTED' then
    raise exception '제출된 문항만 검토할 수 있습니다.' using errcode = 'P0001';
  end if;

  v_next := p_decision::public.file_collection_status;

  update public.file_collection_responses
     set status = v_next,
         round = case when v_next = 'REWORK_REQUESTED' then round + 1 else round end,
         reviewed_at = now(), reviewed_by = app.current_app_user_id()
   where id = p_response_id;

  if coalesce(p_comment, '') <> '' then
    insert into public.file_collection_comments
      (response_id, round, author_user_id, author_side, body, program_module_id)
    values (p_response_id, v_round, app.current_app_user_id(), 'WORKS', p_comment, v_module);
  end if;

  return v_next;
end;
$$;

-- 8-12. 코멘트. 작성자와 author_side는 서버가 정한다.
create or replace function public.file_collection_add_comment(
  p_response_id uuid,
  p_body        text
) returns uuid
language plpgsql
security definer
set search_path = app, public
as $$
declare v_module uuid; v_assignment uuid; v_round integer; v_side text; v_id uuid;
begin
  select r.program_module_id, r.assignment_id, r.round into v_module, v_assignment, v_round
    from public.file_collection_responses r where r.id = p_response_id and r.deleted_at is null
   for update;
  if v_module is null then
    raise exception '응답 칸을 찾을 수 없습니다.' using errcode = 'P0001';
  end if;
  if coalesce(p_body, '') = '' then
    raise exception '내용을 입력해 주세요.' using errcode = 'P0001';
  end if;

  if app.is_guest() then
    if v_assignment not in (select app.file_collection_guest_writable_assignment_ids()) then
      raise exception '댓글을 남길 권한이 없습니다.' using errcode = '42501';
    end if;
    v_side := 'GUEST';
  else
    if not app.file_collection_internal_write(v_module) then
      raise exception '댓글을 남길 권한이 없습니다.' using errcode = '42501';
    end if;
    v_side := 'WORKS';
  end if;

  insert into public.file_collection_comments
    (response_id, round, author_user_id, author_side, body, program_module_id)
  values (p_response_id, v_round, app.current_app_user_id(), v_side, p_body, v_module)
  returning id into v_id;
  return v_id;
end;
$$;

-- 8-13. 다운로드 인가. 경로만 답하고 실물은 열지 않는다 — 서명(60초)은 Edge가 access_logs
--       적재에 성공한 뒤에만 발급한다. 모듈이 닫히거나 배정이 회수되면 여기서 즉시 막힌다.
create or replace function public.file_collection_authorize_download(p_file_id uuid)
returns table (storage_bucket text, storage_path text, original_name text, content_type text)
language plpgsql
security definer
set search_path = app, public
as $$
declare v_module uuid; v_assignment uuid; v_status text;
begin
  select f.program_module_id, r.assignment_id, f.status
    into v_module, v_assignment, v_status
    from public.file_collection_files f
    join public.file_collection_responses r on r.id = f.response_id
   where f.id = p_file_id and f.deleted_at is null;
  if v_module is null then
    raise exception '파일을 찾을 수 없습니다.' using errcode = 'P0001';
  end if;
  if v_status <> 'READY' then
    raise exception '아직 업로드가 확인되지 않은 파일입니다.' using errcode = 'P0001';
  end if;

  -- 게스트의 인가 폭은 자기 RLS 폭과 같다(읽을 수 있는 것만 받는다).
  if app.is_guest() then
    if v_assignment not in (select app.file_collection_guest_assignment_ids()) then
      raise exception '이 파일을 받을 권한이 없습니다.' using errcode = '42501';
    end if;
  elsif not app.file_collection_internal_read(v_module) then
    raise exception '이 파일을 받을 권한이 없습니다.' using errcode = '42501';
  end if;

  return query
    select f.storage_bucket, f.storage_path, f.original_name, f.content_type
      from public.file_collection_files f where f.id = p_file_id;
end;
$$;

-- ---------------------------------------------------------------------
-- (9) EXECUTE — authenticated에만. PUBLIC·anon은 회수한다.
--     판정 헬퍼도 마찬가지다: RLS 정책 안의 함수 호출은 **호출자 권한으로** 평가되므로
--     EXECUTE가 없으면 SELECT 자체가 42501로 막힌다. 인가는 헬퍼 내부가 한다.
-- ---------------------------------------------------------------------
do $$
declare sig text;
begin
  foreach sig in array array[
    'public.file_collection_upsert(uuid, text, text)',
    'public.file_collection_save_node(uuid, uuid, uuid, text, text, text, boolean, integer, timestamptz)',
    'public.file_collection_move_node(uuid, uuid, integer)',
    'public.file_collection_reorder_node(uuid, text)',
    'public.file_collection_delete_node(uuid)',
    'public.file_collection_assign(uuid, uuid[])',
    'public.file_collection_revoke_assignment(uuid)',
    'public.file_collection_publish(uuid)',
    'public.file_collection_register_upload(uuid, text, text, bigint)',
    'public.file_collection_commit_upload(uuid)',
    'public.file_collection_remove_file(uuid)',
    'public.file_collection_submit(uuid)',
    'public.file_collection_review(uuid, text, text)',
    'public.file_collection_add_comment(uuid, text)',
    'public.file_collection_authorize_download(uuid)',
    'app.file_collection_internal_read(uuid)',
    'app.file_collection_internal_write(uuid)',
    'app.file_collection_guest_assignment_ids()',
    'app.file_collection_guest_writable_assignment_ids()'
  ] loop
    execute format('revoke all on function %s from public, anon', sig);
    execute format('grant execute on function %s to authenticated', sig);
  end loop;
end $$;
