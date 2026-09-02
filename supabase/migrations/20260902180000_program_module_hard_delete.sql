-- =====================================================================
-- 운영 모듈 하드 딜리트 — PM 전용 · 잔존 데이터 차단 · 따라쓰기 확인
--
-- 왜 물리 삭제인가
--   개발 수칙의 원칙은 여전히 soft delete다(docs/docs_dev/1_development_stack.md).
--   이 한 건이 예외인 이유는 지워지는 대상이 **업무 기록이 아니라 그릇**이기 때문이다.
--   모듈 인스턴스는 담당자가 화면에서 만든 배치물이고, 잘못 만든 배치물은 '껐다'가 아니라
--   '없다'여야 목록이 사실을 말한다. enabled=false는 되돌릴 수 있는 운영 중단이지 오생성
--   정리 수단이 아니어서, 잘못 만든 모듈이 계속 원장에 남아 모듈명 유일 제약
--   (uq_program_modules_title)과 OUTCOMES 단일 제약을 점유해 왔다.
--   그릇 안에 내용물이 있으면 그것은 업무 기록이므로 아래 (3)이 삭제를 아예 막는다.
--   즉 이 예외의 경계는 '빈 그릇만 지운다'이며, 기록을 지우는 경로는 여전히 없다.
--
-- 무엇을 세우는가
--   (0) app.ws_module_tables()          — 다형 키 → 모듈·담당자·타임라인 원장 이름
--   (1) app.module_content_tables()     — 모듈에 딸린 '내용물' 원장(카탈로그가 답한다)
--   (2) app.module_cascade_children()   — 내용물의 하위 원장(안내 문구용 건수)
--   (3) program_module_delete_blockers() — 삭제를 막는 잔존 데이터 집계(조회)
--   (4) delete_program_module()          — 삭제 RPC(PM 전용 · 따라쓰기 · 감사 로그)
--
-- 왜 목록을 손으로 나열하지 않는가
--   모듈 하위 원장은 지금도 20종을 넘고 템플릿이 늘 때마다 또 는다. 손 목록은 새 원장이
--   추가된 날 조용히 빠지고, 빠진 자리가 곧 '내용물이 있는데도 지워지는' 경로가 된다.
--   그래서 program_module_id FK를 건 테이블 전체를 pg_constraint에서 판정한다
--   (app.has_contribution_trigger()가 카탈로그로 판정하는 것과 같은 근거).
--
-- 차단 판정의 완전성
--   1단계(모듈 직속 자식)만 세어도 누락이 없다 — 더 깊은 행이 존재하면 FK 때문에 그 조상
--   행이 1단계에 반드시 있기 때문이다. 2단계는 차단 판정이 아니라 안내 문구
--   ('지원서 30건')를 위해서만 센다.
--
-- 담당자 배정·타임라인·링크는 '내용물'이 아니라 모듈 자신의 세간이다
--   배정(*_module_assignees)은 모듈 설정의 일부라 늘 존재하고, 이것을 차단 사유로 세면
--   어떤 모듈도 지울 수 없다. 타임라인(*_timeline_items)은 모듈 세션에서 파생된 인덱스라
--   원본이 비면 의미가 없고, 링크(program_module_public_links)는 모듈 설정이다.
--   셋 다 모듈과 함께 사라진다(배정은 cascade, 나머지 둘은 아래에서 명시 삭제).
--
-- ---------------------------------------------------------------------
-- 보안 게이트 자기점검 (docs/docs_dev/11_migration_security_gate.md)
--   · 소유 워크스페이스: ac / mna / project (행마다 entity_key가 답한다). 데이터 등급 Internal.
--   · 접근 주체: 내부 사용자만. 게스트·익명 경로 없음(GRANT는 authenticated 한정).
--   · Scope: program → module. 판정은 워크스페이스 쓰기 + 사업 접근 + **해당 사업의 PM**.
--   · 신규 테이블 없음 → 신규 RLS 정책 없음. 기존 정책은 손대지 않는다.
--   · DELETE 정책을 만들지 않는다 — 모듈 원장에 DELETE 정책을 열면 그 순간 멤버도 직접
--     DELETE를 쏠 수 있게 되어 'PM만'이라는 규칙이 화면 장식이 된다. 삭제 경로는 자체 인가를
--     하는 SECURITY DEFINER RPC 하나뿐이고, 그 밖에서는 여전히 Default Deny다.
--   · SECURITY DEFINER 신규 2종((3)(4)). 둘 다 search_path 고정 + 함수 첫머리 인가 검사.
--     set_program_module(20260716160000)과 동일 패턴이다.
--   · 감사 로그: 되돌릴 수 없는 작업이라 audit_logs에 적재한다(actor/before_data/reason).
--     audit_logs에는 INSERT 정책이 없어 DEFINER 안에서 직접 적재한다(기존 관례와 동일).
--   · 개인정보 노출 없음 — (3)은 원장명과 건수만 돌려주고 행 내용을 읽지 않는다.
--   · 시드·더미 데이터 없음.
-- 근거: 20260716160000_program_module_instances.sql(set_program_module 인가 패턴),
--       20260715160000_program_manager_assignment.sql(program_manager_role),
--       20260902130000_module_public_links.sql(다형 entity_key 화이트리스트),
--       20260721130000_program_entity_key_split.sql(entity_key_workspace),
--       20260720130000_ws_program_scope_helper.sql(can_access_ws_program)
-- =====================================================================

-- ---------------------------------------------------------------------
-- (0) 다형 키 → 원장 이름. 링크 마이그레이션과 같은 화이트리스트라 주입면이 없다.
-- ---------------------------------------------------------------------
create or replace function app.ws_module_tables(p_entity_key text)
returns table (module_table text, managers_table text, timeline_table text)
language sql
immutable
set search_path = app, public
as $$
  -- 별칭 컬럼명을 반환 컬럼명과 다르게 둔다. 같게 두면 SQL 함수 본문에서 OUT 이름과
  -- 테이블 컬럼이 같은 이름으로 만나 모호성 오류가 난다.
  select t.c2, t.c3, t.c4
    from (values
      ('program',         'program_modules',         'program_managers',         'program_timeline_items'),
      ('ma_program',      'ma_program_modules',      'ma_program_managers',      'ma_program_timeline_items'),
      ('project_program', 'project_program_modules', 'project_program_managers', 'project_program_timeline_items')
    ) as t(c1, c2, c3, c4)
   where t.c1 = p_entity_key;
$$;

grant execute on function app.ws_module_tables(text) to authenticated;

comment on function app.ws_module_tables(text) is
  '다형 키(program/ma_program/project_program) → 모듈·담당자·타임라인 원장 이름. 화이트리스트라 동적 SQL 주입면이 없다.';

-- ---------------------------------------------------------------------
-- (1) 모듈 '내용물' 원장 — program_module_id FK를 건 테이블을 카탈로그가 답한다.
--     세간(배정·타임라인)은 접미사로 걸러낸다. 접미사로 거르는 이유는 워크스페이스가
--     늘어도(ma_/project_/그 다음) 손으로 더할 곳이 없게 하기 위함이다.
-- ---------------------------------------------------------------------
create or replace function app.module_content_tables(p_module_table text)
returns table (rel_name text, fk_col text, soft_delete boolean)
language sql
stable
set search_path = app, public
as $$
  select
    cl.relname::text,
    a.attname::text,
    -- soft delete 원장이면 살아 있는 행만 세야 한다. 담당자가 글·링크를 다 지우고 나서도
    -- 지운 흔적이 남아 모듈을 못 지우면, 화면에서 비어 보이는 모듈이 영영 안 지워진다.
    exists (
      select 1 from pg_attribute d
       where d.attrelid = cl.oid and d.attname = 'deleted_at' and d.attnum > 0 and not d.attisdropped
    )
    from pg_constraint c
    join pg_class      cl on cl.oid = c.conrelid
    join pg_namespace  n  on n.oid  = cl.relnamespace
    join pg_attribute  a  on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
   where c.contype = 'f'
     and n.nspname = 'public'
     and c.confrelid = ('public.' || p_module_table)::regclass
     and a.attname = 'program_module_id'
     and cl.relname not like '%module_assignees'
     and cl.relname not like '%timeline_items';
$$;

comment on function app.module_content_tables(text) is
  '모듈 인스턴스에 딸린 내용물 원장 목록. 손 목록이 아니라 pg_constraint가 답하므로 새 템플릿 원장이 추가돼도 자동 반영된다.';

-- ---------------------------------------------------------------------
-- (2) 내용물의 하위 원장(1단계 자식). 차단 판정에는 쓰지 않고 안내 문구의 건수만 만든다
--     — 모집을 지우려 할 때 '신청서 1건'이 아니라 '지원서 30건'이 보여야 판단이 선다.
-- ---------------------------------------------------------------------
create or replace function app.module_cascade_children(p_parent_table text)
returns table (rel_name text, fk_col text, parent_col text, soft_delete boolean)
language sql
stable
set search_path = app, public
as $$
  select
    cl.relname::text, a.attname::text, pa.attname::text,
    exists (
      select 1 from pg_attribute d
       where d.attrelid = cl.oid and d.attname = 'deleted_at' and d.attnum > 0 and not d.attisdropped
    )
    from pg_constraint c
    join pg_class      cl on cl.oid = c.conrelid
    join pg_namespace  n  on n.oid  = cl.relnamespace
    join pg_attribute  a  on a.attrelid  = c.conrelid  and a.attnum  = c.conkey[1]
    join pg_attribute  pa on pa.attrelid = c.confrelid and pa.attnum = c.confkey[1]
   where c.contype = 'f'
     and n.nspname = 'public'
     and c.confrelid = ('public.' || p_parent_table)::regclass
     and c.conrelid <> c.confrelid
     and array_length(c.conkey, 1) = 1;
$$;

comment on function app.module_cascade_children(text) is
  '내용물 원장의 1단계 자식. 삭제 차단 판정이 아니라 사용자에게 보여 줄 건수를 만들기 위한 조회용이다.';

-- ---------------------------------------------------------------------
-- (3) 삭제를 막는 잔존 데이터 — 원장명과 건수만 돌려준다.
--     화면은 이것을 미리 불러 '왜 못 지우는지'를 삭제창에서 먼저 보여 준다.
--     DEFINER인 이유는 차단이 **보는 사람에 따라 달라지면 안 되기 때문**이다 —
--     호출자에게 안 보이는 행이 있다고 삭제가 열리면 그것이 곧 데이터 유실 경로다.
-- ---------------------------------------------------------------------
create or replace function public.program_module_delete_blockers(
  p_entity_key text,
  p_module_id  uuid
)
returns table (rel_name text, row_count bigint)
language plpgsql
stable
security definer
set search_path = app, public
as $$
declare
  v_module   text;
  v_managers text;
  v_timeline text;
  v_ws       text := app.entity_key_workspace(p_entity_key);
  v_program  uuid;
  r          record;
  r2         record;
  c          bigint;
begin
  select t.module_table, t.managers_table, t.timeline_table
    into v_module, v_managers, v_timeline
    from app.ws_module_tables(p_entity_key) t;
  if v_module is null then
    raise exception '알 수 없는 사업 원장입니다.' using errcode = '22023';
  end if;

  execute format('select program_id from public.%I where id = $1', v_module)
    into v_program using p_module_id;
  if v_program is null then
    return; -- 이미 없는 모듈. 막을 것도 없다.
  end if;

  -- 인가: 이 사업을 볼 수 있는 사람만 잔존 건수를 볼 수 있다(건수도 업무 정보다).
  if not (app.can_read_workspace(v_ws) and app.can_access_ws_program(v_ws, v_program)) then
    raise exception '이 사업의 모듈을 조회할 권한이 없습니다.' using errcode = '42501';
  end if;

  for r in select * from app.module_content_tables(v_module) loop
    execute format('select count(*) from public.%I where %I = $1%s',
                   r.rel_name, r.fk_col,
                   case when r.soft_delete then ' and deleted_at is null' else '' end)
      into c using p_module_id;
    if c > 0 then
      rel_name := r.rel_name; row_count := c; return next;

      -- 2단계는 안내용. 1단계가 비어 있으면 2단계도 비어 있으므로(FK) 여기서만 센다.
      for r2 in select * from app.module_cascade_children(r.rel_name) loop
        execute format(
          'select count(*) from public.%I ch join public.%I pt on ch.%I = pt.%I where pt.%I = $1%s',
          r2.rel_name, r.rel_name, r2.fk_col, r2.parent_col, r.fk_col,
          case when r2.soft_delete then ' and ch.deleted_at is null' else '' end)
          into c using p_module_id;
        if c > 0 then
          rel_name := r2.rel_name; row_count := c; return next;
        end if;
      end loop;
    end if;
  end loop;

  -- 첨부는 FK 없이 program_module_id 한 컬럼으로만 귀속된다(20260803230100). 카탈로그가
  -- 잡지 못하므로 여기서 따로 센다. soft delete 원장이라 살아 있는 행만 센다.
  select count(*) into c
    from public.attachments
   where program_module_id = p_module_id and deleted_at is null;
  if c > 0 then
    rel_name := 'attachments'; row_count := c; return next;
  end if;
end;
$$;

revoke all on function public.program_module_delete_blockers(text, uuid) from public;
grant execute on function public.program_module_delete_blockers(text, uuid) to authenticated;

comment on function public.program_module_delete_blockers(text, uuid) is
  '모듈 삭제를 막는 잔존 데이터(원장명·건수). 행 내용은 읽지 않는다. 비어 있으면 삭제 가능.';

-- ---------------------------------------------------------------------
-- (4) 삭제 RPC
--     세 관문을 모두 통과해야 지운다: PM 인가 → 따라쓰기 문구 → 잔존 데이터 없음.
--     순서가 중요하다 — 권한 없는 사람에게 잔존 건수를 알려 주지 않는다.
-- ---------------------------------------------------------------------
create or replace function public.delete_program_module(
  p_entity_key   text,
  p_module_id    uuid,
  p_confirm_text text
)
returns void
language plpgsql
security definer
set search_path = app, public
as $$
declare
  v_module   text;
  v_managers text;
  v_timeline text;
  v_ws       text := app.entity_key_workspace(p_entity_key);
  v_program  uuid;
  v_title    text;
  v_type     text;
  v_phrase   text;
  v_uid      uuid := app.current_app_user_id();
  v_is_pm    boolean;
  v_block    text;
  r          record;
begin
  select t.module_table, t.managers_table, t.timeline_table
    into v_module, v_managers, v_timeline
    from app.ws_module_tables(p_entity_key) t;
  if v_module is null then
    raise exception '알 수 없는 사업 원장입니다.' using errcode = '22023';
  end if;

  execute format('select program_id, title, module_type::text from public.%I where id = $1', v_module)
    into v_program, v_title, v_type using p_module_id;
  if v_program is null then
    raise exception '삭제할 모듈을 찾을 수 없습니다.' using errcode = '02000';
  end if;

  -- (4-1) 인가. 워크스페이스 쓰기 + 사업 접근을 먼저 보고, 그 위에 PM을 얹는다.
  if not (app.can_write_workspace(v_ws) and app.can_access_ws_program(v_ws, v_program)) then
    raise exception '이 사업의 모듈을 변경할 권한이 없습니다.' using errcode = '42501';
  end if;

  -- PM 요구에는 관리자 우회가 없다. 우회를 두면 'PM만 지운다'가 PM을 비워 두는 것으로
  -- 뒤집히기 때문이다 — PM이 없는 사업에서는 아무도 지울 수 없고, 먼저 PM을 지정해야 하며,
  -- 그 지정 자체가 누가 책임지고 지웠는지를 남긴다.
  execute format(
    'select exists (select 1 from public.%I m
       where m.program_id = $1 and m.user_id = $2 and m.role = ''PM'')', v_managers)
    into v_is_pm using v_program, v_uid;
  if not coalesce(v_is_pm, false) then
    raise exception '모듈 삭제는 이 사업의 PM만 할 수 있습니다.' using errcode = '42501';
  end if;

  -- (4-2) 따라쓰기. 모듈명이 없으면 템플릿 키가 문구가 된다(화면도 같은 규칙으로 제시한다).
  --       앞뒤 공백과 대소문자는 눈감아 준다 — 확인하려는 것은 정확한 타자가 아니라
  --       '지금 지우는 것이 이 모듈이 맞다'는 의도다.
  v_phrase := coalesce(nullif(btrim(v_title), ''), v_type);
  if lower(btrim(coalesce(p_confirm_text, ''))) <> lower(v_phrase) then
    raise exception '확인 문구가 모듈명과 일치하지 않습니다.' using errcode = '22023';
  end if;

  -- (4-3) 잔존 데이터. 하나라도 있으면 멈춘다.
  select string_agg(b.rel_name || ' ' || b.row_count || '건', ', ')
    into v_block
    from public.program_module_delete_blockers(p_entity_key, p_module_id) b;
  if v_block is not null then
    raise exception '남아 있는 데이터가 있어 삭제할 수 없습니다: %', v_block
      using errcode = '23001';
  end if;

  -- (4-4) 감사 로그. 되돌릴 수 없는 작업이라 지우기 전에 남긴다.
  insert into public.audit_logs (actor_user_id, action, changed_workspace, before_data, reason)
  values (
    v_uid, 'MODULE_DELETE', v_ws,
    jsonb_build_object('entity_key', p_entity_key, 'module_id', p_module_id,
                       'program_id', v_program, 'title', v_title, 'module_type', v_type),
    '운영 모듈 하드 삭제(PM)'
  );

  -- (4-5) 세간 정리 후 본체 삭제.
  --       타임라인은 cascade가 걸려 있지 않고(FK RESTRICT), 링크는 다형이라 FK 자체가 없다.
  execute format('delete from public.%I where program_module_id = $1', v_timeline)
    using p_module_id;

  delete from public.program_module_public_links
   where entity_key = p_entity_key and program_module_id = p_module_id;

  -- 내용물 원장도 cascade에 맡기지 않고 직접 비운다. 이 시점에 남아 있는 것은 (4-3)을
  -- 통과했으므로 **이미 지워진 행(deleted_at)** 뿐이다. 그럼에도 명시 삭제하는 이유는
  -- FK의 on delete 동작이 원장마다 다르기 때문이다 — program_posts처럼 cascade가 아닌
  -- 원장이 섞여 있어, 지운 흔적 하나 때문에 아래 본체 삭제가 FK 오류로 끝나면
  -- 사용자에게는 '비어 있는데도 안 지워진다'로 보인다.
  for r in select * from app.module_content_tables(v_module) loop
    execute format('delete from public.%I where %I = $1', r.rel_name, r.fk_col)
      using p_module_id;
  end loop;

  -- 담당자 배정은 cascade라 본체 삭제가 함께 지운다.
  -- 첨부는 FK가 없어 (4-3)이 살아 있는 행을 이미 막았고, 지워진 행은 파일 기록으로
  -- 남겨 둔다 — 원장을 지우는 것과 업로드 이력을 지우는 것은 다른 결정이다.
  execute format('delete from public.%I where id = $1', v_module)
    using p_module_id;
end;
$$;

revoke all on function public.delete_program_module(text, uuid, text) from public;
grant execute on function public.delete_program_module(text, uuid, text) to authenticated;

comment on function public.delete_program_module(text, uuid, text) is
  '운영 모듈 인스턴스 물리 삭제. PM 전용 · 확인 문구 일치 · 잔존 데이터 없음의 세 관문을 모두 통과해야 실행되며 audit_logs에 적재한다.';
