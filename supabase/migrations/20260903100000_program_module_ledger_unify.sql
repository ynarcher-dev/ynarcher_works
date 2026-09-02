-- =====================================================================
-- [사업 공용] 모듈 계열 원장 통합 — 3벌(ac/ma/project) → 1벌 + entity_key
--
-- 배경:
--   화면(features/program)은 이미 세 워크스페이스가 공유하는데, 정형 운영 모듈 8종의
--   '내용물' 원장 30여 종이 전부 public.program_modules(id)에 FK로 매여 있어 M&A·PROJECT
--   모듈에는 안을 채울 수 없었다. 모듈 원장을 워크스페이스별로 셋으로 나눈 대가가,
--   그 위에 올라가는 모든 기능을 AC에만 존재하게 만든 것이다.
--
-- 선택:
--   내용물 30여 종에 각각 entity_key를 다는 대신, **모듈 원장 하나를 통합하고 그 하나가
--   워크스페이스를 답하게 한다.** 내용물은 구조도 FK도 손대지 않는다 — 모듈에 매달린 것은
--   모듈이 소유 워크스페이스를 답하면 그것으로 판정이 끝나기 때문이다. 하드 딜리트가
--   FK 카탈로그(app.module_content_tables)로 삭제 대상을 찾는 구조도 그대로 산다.
--
-- 통합 대상(모듈 축 + 모듈이 참조하는 명부):
--   program_modules / program_module_assignees / program_posts / program_links
--   program_participants — 평가자·멘토 지정 9곳이 이 원장을 FK로 물고 있어(evaluator_id,
--     mentor_participant_id 등) 명부가 갈라져 있으면 M&A 사업의 참가자를 평가자로 지정할 수 없다.
--
-- 통합하지 않는 것(사업 축):
--   programs / ma_programs / project_programs 본체와 담당자·부서·타임라인은 그대로 둔다.
--   사업 자체의 속성이 다르고, 내용물이 이들을 FK로 물지 않아 갈라져 있어도 막히는 것이 없다.
--
-- FK 대신 무엇이 무결성을 지키는가:
--   program_id가 세 원장 중 하나를 가리키므로 FK를 걸 수 없다. 대신
--   (1) BEFORE INSERT/UPDATE 트리거가 entity_key가 지목한 원장에 그 사업이 실재하는지 확인하고
--   (2) 세 사업 원장의 AFTER DELETE 트리거가 종전 on delete cascade를 대신한다.
--   둘을 함께 둬야 한다 — (1)만 두면 사업을 지웠을 때 고아 행이 남고, (2)만 두면 없는 사업을
--   가리키는 행이 처음부터 들어온다.
--
-- 보안 게이트(11_migration_security_gate.md) 답변:
--   - 소유 워크스페이스: ac / mna / project (행마다 entity_key가 답한다)
--   - 데이터 등급: Internal (참가자 명부는 개인정보 포함 — 목록 마스킹은 화면 책임, 종전과 동일)
--   - 접근 주체: 내부 사용자 + 게스트(SELECT 한정, 후속 마이그레이션에서 세 워크스페이스로 확장)
--   - Scope 기준: app.can_access_ws_program(app.entity_key_workspace(entity_key), program_id)
--   - 신규 SECURITY DEFINER: app.module_ws / app.module_program — 둘 다 판정용 조회 전용이며
--     인자로 받은 id의 소유 워크스페이스만 돌려준다. DEFINER인 이유는 RLS 정책 안에서
--     자기 자신(program_modules)을 읽어야 해 INVOKER면 정책이 재귀하기 때문이다.
--   - 감사 로그: 본 마이그레이션은 새 다운로드·Export 경로를 만들지 않는다.
--   - 운영 영향: 구 원장 10종을 이관 후 `_retired_` 접두사로 개명한다(드롭하지 않는다 —
--     이 환경에서는 pg_dump가 Docker를 요구해 백업을 뜰 수 없어, 되돌릴 수 없는 삭제를
--     되돌릴 수단 없이 할 수 없다). 이관 건수는 assert로 검증하며, 프론트 config
--     (tables.modules 등)는 같은 커밋에서 통합 이름으로 함께 바뀐다.
-- 근거: 20260705150100_ac_core.sql, 20260716160000_program_module_instances.sql,
--       20260720140000_ma_program_schema.sql, 20260720150000_project_program_schema.sql,
--       20260721130000_program_entity_key_split.sql(app.entity_key_workspace),
--       20260803230100_program_module_content.sql
-- =====================================================================

-- ---------------------------------------------------------------------
-- (1) 통합 원장에 entity_key를 단다
--     기본값 'program'은 이관 전 기존 AC 행 전량을 한 번에 채우기 위한 것이고,
--     채운 뒤에도 남긴다 — AC 경로의 INSERT는 종전 그대로 컬럼을 생략해도 맞게 들어간다.
-- ---------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array[
    'program_modules', 'program_participants', 'program_posts', 'program_links'
  ] loop
    execute format(
      'alter table public.%I add column if not exists entity_key text not null default ''program''', t);
    execute format(
      'alter table public.%I drop constraint if exists %I', t, t || '_entity_key_check');
    execute format(
      'alter table public.%I add constraint %I check (entity_key in (''program'', ''ma_program'', ''project_program''))',
      t, t || '_entity_key_check');
    execute format(
      'create index if not exists %I on public.%I (entity_key, program_id)',
      'idx_' || t || '_entity', t);
  end loop;
end $$;

comment on column public.program_modules.entity_key is
  '소유 원장: program(AC) | ma_program(M&A) | project_program(PROJECT). program_id가 어느 사업 원장을 가리키는지와 RLS 워크스페이스 판정의 근거.';
comment on column public.program_participants.entity_key is
  '소유 원장: program(AC) | ma_program(M&A) | project_program(PROJECT).';

-- ---------------------------------------------------------------------
-- (2) program_id의 FK를 뗀다 — 세 원장 중 하나를 가리키게 되므로 FK로 표현할 수 없다
-- ---------------------------------------------------------------------
alter table public.program_modules      drop constraint if exists program_modules_program_id_fkey;
alter table public.program_participants drop constraint if exists program_participants_program_id_fkey;
alter table public.program_posts        drop constraint if exists program_posts_program_id_fkey;
alter table public.program_posts        drop constraint if exists custom_activities_program_id_fkey;
alter table public.program_links        drop constraint if exists program_links_program_id_fkey;

-- ---------------------------------------------------------------------
-- (3) FK를 대신할 무결성 장치
--     (3-1) 사업 실재 확인 — entity_key가 지목한 원장에 program_id가 있어야 한다.
-- ---------------------------------------------------------------------
create or replace function app.assert_program_exists(p_entity_key text, p_program_id uuid)
returns boolean
language plpgsql
stable
set search_path = app, public
as $$
declare
  v_table text;
  v_found boolean;
begin
  v_table := case p_entity_key
    when 'program'         then 'programs'
    when 'ma_program'      then 'ma_programs'
    when 'project_program' then 'project_programs'
  end;
  if v_table is null then
    return false;
  end if;
  -- 화이트리스트로 고른 이름만 들어가므로 동적 SQL 주입면이 없다.
  execute format('select exists (select 1 from public.%I where id = $1)', v_table)
    into v_found using p_program_id;
  return v_found;
end;
$$;

comment on function app.assert_program_exists(text, uuid) is
  '다형 program_id가 entity_key가 지목한 사업 원장에 실재하는가. FK를 걸 수 없는 통합 원장의 참조 무결성 검사.';

create or replace function app.enforce_program_ref()
returns trigger
language plpgsql
set search_path = app, public
as $$
begin
  if not app.assert_program_exists(new.entity_key, new.program_id) then
    raise exception '사업을 찾을 수 없습니다(원장 %, id %).', new.entity_key, new.program_id
      using errcode = '23503';
  end if;
  return new;
end;
$$;

do $$
declare t text;
begin
  foreach t in array array[
    'program_modules', 'program_participants', 'program_posts', 'program_links'
  ] loop
    execute format('drop trigger if exists trg_%s_program_ref on public.%I', t, t);
    execute format(
      'create trigger trg_%s_program_ref before insert or update of entity_key, program_id
         on public.%I for each row execute function app.enforce_program_ref()', t, t);
  end loop;
end $$;

-- (3-2) 사업 삭제 시 연쇄 삭제 — 종전 on delete cascade를 대신한다.
create or replace function app.cascade_program_children()
returns trigger
language plpgsql
set search_path = app, public
as $$
declare
  v_key text := tg_argv[0];
begin
  -- 자식(assignees·내용물)은 program_modules FK의 on delete cascade가 이어서 지운다.
  delete from public.program_modules      where entity_key = v_key and program_id = old.id;
  delete from public.program_posts        where entity_key = v_key and program_id = old.id;
  delete from public.program_links        where entity_key = v_key and program_id = old.id;
  delete from public.program_participants where entity_key = v_key and program_id = old.id;
  return old;
end;
$$;

comment on function app.cascade_program_children() is
  '사업 물리 삭제 시 통합 원장의 소속 행을 함께 지운다. FK를 뗀 자리를 메우는 장치이며, 운영에서는 사업이 soft delete되므로 실제로는 시드 정리 경로에서만 탄다.';

do $$
declare spec record;
begin
  for spec in
    select * from (values
      ('programs',         'program'),
      ('ma_programs',      'ma_program'),
      ('project_programs', 'project_program')
    ) as t(tbl, key)
  loop
    execute format('drop trigger if exists trg_%s_cascade_children on public.%I', spec.tbl, spec.tbl);
    execute format(
      'create trigger trg_%s_cascade_children after delete on public.%I
         for each row execute function app.cascade_program_children(%L)',
      spec.tbl, spec.tbl, spec.key);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- (4) 담당자 풀 검사도 다형으로 — 이관보다 먼저 고쳐야 한다.
--     먼저 고치지 않으면 M&A 배정 행을 옮기는 순간 AC 담당자 풀(program_managers)에서
--     사람을 찾지 못해 이관 자체가 막힌다.
-- ---------------------------------------------------------------------
create or replace function public.enforce_module_assignee_in_pool()
returns trigger
language plpgsql
security definer
set search_path = app, public
as $$
declare
  v_key     text;
  v_program uuid;
  v_table   text;
  v_ok      boolean;
begin
  select entity_key, program_id into v_key, v_program
    from public.program_modules where id = new.program_module_id;
  if v_program is null then
    raise exception '모듈 인스턴스를 찾을 수 없습니다.';
  end if;

  v_table := case v_key
    when 'program'         then 'program_managers'
    when 'ma_program'      then 'ma_program_managers'
    when 'project_program' then 'project_program_managers'
  end;

  execute format(
    'select exists (select 1 from public.%I where program_id = $1 and user_id = $2)', v_table)
    into v_ok using v_program, new.user_id;

  if not v_ok then
    raise exception '담당자는 사업 담당자 풀에 있는 사용자만 지정할 수 있습니다.' using errcode = '23514';
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- (5) 이관 — 구 원장의 행을 통합 원장으로 옮긴다. id는 그대로 유지하므로
--     기존 참조(타임라인의 program_module_id 등)가 끊기지 않는다.
-- ---------------------------------------------------------------------
do $$
declare
  spec       record;
  v_before   bigint;
  v_moved    bigint;
begin
  for spec in
    select * from (values
      ('ma_program_modules',      'ma_program'),
      ('project_program_modules', 'project_program')
    ) as t(src, key)
  loop
    if to_regclass('public.' || spec.src) is null then continue; end if;

    execute format('select count(*) from public.%I', spec.src) into v_before;
    execute format($f$
      insert into public.program_modules
        (id, entity_key, program_id, module_type, title, enabled, status, visibility,
         participation_mode, settings, created_at, updated_at)
      select id, %L, program_id, module_type, title, enabled, status, visibility,
             participation_mode, settings, created_at, updated_at
        from public.%I
      on conflict (id) do nothing
    $f$, spec.key, spec.src);
    get diagnostics v_moved = row_count;

    if v_moved <> v_before then
      raise exception '% 이관 건수 불일치: 원본 %건 중 %건만 옮겨졌습니다.', spec.src, v_before, v_moved;
    end if;
    raise notice '% → program_modules: %건 이관', spec.src, v_moved;
  end loop;
end $$;

do $$
declare
  spec     record;
  v_before bigint;
  v_moved  bigint;
begin
  for spec in
    select * from (values
      ('ma_program_module_assignees',      'program_module_assignees',
       '(id, program_module_id, user_id, assigned_by, assigned_at)',
       'id, program_module_id, user_id, assigned_by, assigned_at', null),
      ('project_program_module_assignees', 'program_module_assignees',
       '(id, program_module_id, user_id, assigned_by, assigned_at)',
       'id, program_module_id, user_id, assigned_by, assigned_at', null),
      ('ma_program_posts',      'program_posts',
       '(id, entity_key, program_id, program_module_id, session_source_id, activity_type, title, activity_date, visibility, body, created_by, deleted_at, created_at, updated_at)',
       'id, %L, program_id, program_module_id, session_source_id, activity_type, title, activity_date, visibility, body, created_by, deleted_at, created_at, updated_at',
       'ma_program'),
      ('project_program_posts', 'program_posts',
       '(id, entity_key, program_id, program_module_id, session_source_id, activity_type, title, activity_date, visibility, body, created_by, deleted_at, created_at, updated_at)',
       'id, %L, program_id, program_module_id, session_source_id, activity_type, title, activity_date, visibility, body, created_by, deleted_at, created_at, updated_at',
       'project_program'),
      ('ma_program_links',      'program_links',
       '(id, entity_key, program_id, program_module_id, label, url, description, sort_order, created_by, created_at, updated_at, deleted_at)',
       'id, %L, program_id, program_module_id, label, url, description, sort_order, created_by, created_at, updated_at, deleted_at',
       'ma_program'),
      ('project_program_links', 'program_links',
       '(id, entity_key, program_id, program_module_id, label, url, description, sort_order, created_by, created_at, updated_at, deleted_at)',
       'id, %L, program_id, program_module_id, label, url, description, sort_order, created_by, created_at, updated_at, deleted_at',
       'project_program')
    ) as t(src, dst, cols, sel, key)
  loop
    if to_regclass('public.' || spec.src) is null then continue; end if;

    execute format('select count(*) from public.%I', spec.src) into v_before;
    execute format(
      'insert into public.%I %s select ' ||
      case when spec.key is null then spec.sel else format(spec.sel, spec.key) end ||
      ' from public.%I on conflict (id) do nothing',
      spec.dst, spec.cols, spec.src);
    get diagnostics v_moved = row_count;

    if v_moved <> v_before then
      raise exception '% 이관 건수 불일치: 원본 %건 중 %건만 옮겨졌습니다.', spec.src, v_before, v_moved;
    end if;
    raise notice '% → %: %건 이관', spec.src, spec.dst, v_moved;
  end loop;
end $$;

do $$
declare
  spec     record;
  v_before bigint;
  v_moved  bigint;
begin
  for spec in
    select * from (values
      ('ma_program_participants',      'ma_program'),
      ('project_program_participants', 'project_program')
    ) as t(src, key)
  loop
    if to_regclass('public.' || spec.src) is null then continue; end if;

    execute format('select count(*) from public.%I', spec.src) into v_before;
    execute format($f$
      insert into public.program_participants
        (id, entity_key, program_id, user_id, master_id, role, role_tags, status,
         invited_at, joined_at, created_at, updated_at)
      select id, %L, program_id, user_id, master_id, role, role_tags, status,
             invited_at, joined_at, created_at, updated_at
        from public.%I
      on conflict (id) do nothing
    $f$, spec.key, spec.src);
    get diagnostics v_moved = row_count;

    if v_moved <> v_before then
      raise exception '% 이관 건수 불일치: 원본 %건 중 %건만 옮겨졌습니다.', spec.src, v_before, v_moved;
    end if;
    raise notice '% → program_participants: %건 이관', spec.src, v_moved;
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- (6) 남은 참조를 통합 원장으로 돌린다
--     구 모듈 원장을 물고 있던 것 중 살아남는 것은 워크스페이스별 타임라인뿐이다
--     (배정·글·링크는 위에서 이관했고 구 테이블은 아래에서 드롭한다).
-- ---------------------------------------------------------------------
do $$
declare
  spec record;
  con  text;
begin
  for spec in
    select * from (values
      ('ma_program_timeline_items'),
      ('project_program_timeline_items')
    ) as t(tbl)
  loop
    if to_regclass('public.' || spec.tbl) is null then continue; end if;

    for con in
      select c.conname
        from pg_constraint c
        join pg_class cl on cl.oid = c.conrelid
        join pg_namespace n on n.oid = cl.relnamespace
        join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
       where c.contype = 'f' and n.nspname = 'public'
         and cl.relname = spec.tbl and a.attname = 'program_module_id'
    loop
      execute format('alter table public.%I drop constraint %I', spec.tbl, con);
    end loop;

    execute format(
      'alter table public.%I add constraint %I foreign key (program_module_id)
         references public.program_modules(id) on delete set null',
      spec.tbl, spec.tbl || '_program_module_id_fkey');
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- (7) 구 원장 퇴역 — 드롭이 아니라 개명이다
--
--     옛 이름을 그 자리에 남겨 둘 수는 없다. FK 카탈로그로 내용물·삭제 대상을 찾는 로직
--     (app.module_content_tables 등)이 계속 집어 오고, 다음 사람이 두 이름 사이에서
--     어느 쪽이 진짜인지 헤맨다. 그렇다고 지금 지우지도 않는다 — **이 환경에서는
--     pg_dump가 Docker를 요구해 백업을 뜰 수 없다.** 되돌릴 수 없는 삭제를 되돌릴 수단
--     없이 하는 것과, 이름을 비켜 두는 것 사이에서는 후자가 옳다.
--
--     `_retired_` 접두사는 '쓰지 않는다'를 이름 자체가 말하게 한다. 이관 검증이 끝나면
--     별도 마이그레이션이 지운다(PROGRESS Phase 9 항목).
--     여기 닿는 것은 (5)의 건수 assert를 통과한 뒤뿐이다.
-- ---------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array[
    'ma_program_module_assignees', 'project_program_module_assignees',
    'ma_program_posts',            'project_program_posts',
    'ma_program_links',            'project_program_links',
    'ma_program_participants',     'project_program_participants',
    'ma_program_modules',          'project_program_modules'
  ] loop
    if to_regclass('public.' || t) is not null then
      execute format('alter table public.%I rename to %I', t, '_retired_' || t);
      execute format('comment on table public.%I is %L',
        '_retired_' || t,
        '2026-09-03 모듈 원장 통합으로 퇴역. 행은 program_modules 계열로 이관 완료(건수 검증). 읽지도 쓰지도 않으며, 이관 검증 후 별도 마이그레이션이 삭제한다.');
    end if;
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- (8) 통합 원장 RLS — 'ac' 하드코딩을 entity_key 경유 판정으로 바꾼다.
--     이 교체를 구조 변경과 같은 마이그레이션에 두는 것이 중요하다. 뒤 파일로 미루면
--     그 사이 동안 M&A·PROJECT 행이 AC 권한자에게 열린 채로 존재한다.
--     게스트 정책(modules_guest_select 등)은 이름이 달라 그대로 살아 있고,
--     조회 범위 자체는 후속 마이그레이션에서 세 워크스페이스로 넓힌다.
-- ---------------------------------------------------------------------
do $$
declare
  t       text;
  ws_expr text := 'app.entity_key_workspace(entity_key)';
  sel     text;
  wr      text;
begin
  sel := format('app.can_read_workspace(%s) and app.can_access_ws_program(%s, program_id)', ws_expr, ws_expr);
  wr  := format('app.can_write_workspace(%s) and app.can_access_ws_program(%s, program_id)', ws_expr, ws_expr);

  foreach t in array array[
    'program_modules', 'program_participants', 'program_posts', 'program_links'
  ] loop
    execute format('alter table public.%I enable row level security', t);

    -- 구 이름(일괄 루프가 만든 _ac_*)과 신규 이름을 모두 지우고 다시 만든다.
    execute format('drop policy if exists %I on public.%I', t || '_ac_select', t);
    execute format('drop policy if exists %I on public.%I', t || '_ac_insert', t);
    execute format('drop policy if exists %I on public.%I', t || '_ac_update', t);
    execute format('drop policy if exists %I on public.%I', t || '_ws_select', t);
    execute format('drop policy if exists %I on public.%I', t || '_ws_insert', t);
    execute format('drop policy if exists %I on public.%I', t || '_ws_update', t);

    execute format('create policy %I on public.%I for select using (%s)', t || '_ws_select', t, sel);
    execute format('create policy %I on public.%I for insert with check (%s)', t || '_ws_insert', t, wr);
    execute format('create policy %I on public.%I for update using (%s) with check (%s)',
      t || '_ws_update', t, wr, wr);
  end loop;
end $$;

-- 배정(junction)은 자기 컬럼에 entity_key가 없으므로 상위 모듈이 워크스페이스를 답한다.
do $$
declare
  gate text := $g$
    exists (
      select 1 from public.program_modules pm
       where pm.id = program_module_id
         and app.can_%1$s_workspace(app.entity_key_workspace(pm.entity_key))
         and app.can_access_ws_program(app.entity_key_workspace(pm.entity_key), pm.program_id)
    )
  $g$;
  sel text := format(gate, 'read');
  wr  text := format(gate, 'write');
begin
  execute format('drop policy if exists %I on public.program_module_assignees', 'program_module_assignees_select');
  execute format('drop policy if exists %I on public.program_module_assignees', 'program_module_assignees_insert');
  execute format('drop policy if exists %I on public.program_module_assignees', 'program_module_assignees_update');
  execute format('drop policy if exists %I on public.program_module_assignees', 'program_module_assignees_delete');

  execute format('create policy program_module_assignees_select on public.program_module_assignees for select using (%s)', sel);
  execute format('create policy program_module_assignees_insert on public.program_module_assignees for insert with check (%s)', wr);
  execute format('create policy program_module_assignees_update on public.program_module_assignees for update using (%s) with check (%s)', wr, wr);
  execute format('create policy program_module_assignees_delete on public.program_module_assignees for delete using (%s)', wr);
end $$;

-- ---------------------------------------------------------------------
-- (9) 이관된 명부 행 보정
--     구 ma_/project_ 명부에는 master_table·login_status 열 자체가 없었다(게스트 로그인이
--     AC에만 열려 있었으므로 필요가 없었다). 통합 원장의 규약에 맞춰 채운다.
--
--     login_status는 컬럼 기본값 'NOT_ALLOWED'로 들어오므로 **문은 닫힌 채로 시작한다** —
--     원장을 합쳤다는 이유로 이미 명부에 있던 사람들의 문이 저절로 열려서는 안 된다.
--     다만 계정으로만 잡힌 내부 인원은 애초에 문을 열 대상이 아니라 'NOT_APPLICABLE'로
--     구분한다(20260827130000이 AC 행에 한 것과 같은 처리 — 두 원장의 뜻이 갈리면
--     명부 화면의 상태 열이 워크스페이스마다 다른 말을 하게 된다).
-- ---------------------------------------------------------------------
update public.program_participants p
   set master_table = 'startups'
 where p.entity_key <> 'program'
   and p.master_table is null
   and p.master_id is not null
   and exists (select 1 from public.startups s where s.id = p.master_id);

update public.program_participants p
   set master_table = 'experts'
 where p.entity_key <> 'program'
   and p.master_table is null
   and p.master_id is not null
   and exists (select 1 from public.experts e where e.id = p.master_id);

update public.program_participants
   set login_status = 'NOT_APPLICABLE'
 where entity_key <> 'program'
   and master_id is null
   and login_status = 'NOT_ALLOWED';
