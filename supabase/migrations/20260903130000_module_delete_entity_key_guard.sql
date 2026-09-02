-- =====================================================================
-- [사업 공용] 모듈 삭제 RPC의 워크스페이스 경계 복원
-- 선행: 20260903100000_program_module_ledger_unify.sql (모듈 원장 통합)
--
-- 왜 필요한가:
--   두 함수는 모듈을 `select ... from <원장> where id = $1`로만 찾는다. 원장이 셋으로
--   갈려 있던 동안에는 그 한 줄이 곧 워크스페이스 경계였다 — 'program'으로 물으면
--   program_modules만 뒤지므로 M&A 모듈은 애초에 걸리지 않았다.
--
--   원장을 합치면서 그 경계가 사라졌다. app.can_access_ws_program(ws, id)는 **사용자의
--   스코프 부여**를 볼 뿐 그 id가 정말 그 워크스페이스 원장에 있는지는 보지 않으므로,
--   'ac' 전역 스코프를 가진 사람이 entity_key='program'과 M&A 모듈 id를 함께 보내면
--   인가를 통과한다. 남은 관문은 PM 확인뿐인데 그마저 ma_program_managers가 아니라
--   program_managers를 뒤지게 되어, 판정이 통째로 엉뚱한 원장 위에서 이뤄진다.
--
--   그래서 조회 조건에 entity_key를 함께 건다. 통합 원장에서 'id로만 찾는 것'은 언제나
--   경계를 하나 잃는 일이며, 이것이 그 규칙이 처음 적용되는 자리다.
--
-- 그 외에는 20260902210000의 본문과 같다(차단 대상·확인 문구·감사 로그·첨부 귀속 해제).
--
-- 보안 게이트(11_migration_security_gate.md) 답변:
--   - 소유 워크스페이스: ac / mna / project (p_entity_key가 답한다)
--   - 데이터 등급: Internal / 접근 주체: 내부 사용자(authenticated)
--   - Scope 기준: can_write_workspace(ws) + can_access_ws_program(ws, program_id)
--     + **모듈이 실제로 그 원장 소속인지**(본 마이그레이션이 더하는 조건) + 해당 사업 PM
--   - SECURITY DEFINER 유지: 자체 인가 + search_path 고정 + authenticated 한정(종전과 동일)
--   - 감사 로그: 삭제 전 audit_logs 적재(종전과 동일)
--   - 운영 영향: 인가가 좁아지기만 한다. 정상 경로(화면이 보고 있는 사업의 모듈)는 그대로다.
-- 근거: 20260902210000_module_delete_external_only.sql, 20260903100000_program_module_ledger_unify.sql
-- =====================================================================

-- ---------------------------------------------------------------------
-- (1) 잔존 데이터 집계 — 차단 여부를 행마다 함께 돌려준다.
--     막는 것과 고지하는 것을 한 번의 조회로 답해야 삭제창이 두 목록을 나눠 그릴 수 있다.
-- ---------------------------------------------------------------------
-- 반환 컬럼이 늘어나므로 create or replace로는 바꿀 수 없다(42P13). 먼저 떨군다.
-- 이 함수를 부르는 delete_program_module은 plpgsql이라 실행 시점에 이름을 다시 찾으므로
-- 떨궜다 다시 세워도 끊기지 않는다. 다만 **GRANT는 함수와 함께 사라지므로** 아래에서
-- 다시 부여한다 — 이것을 빠뜨리면 조회가 authenticated에게 막혀 삭제창이 통째로 죽는다.
drop function if exists public.program_module_delete_blockers(text, uuid);

create function public.program_module_delete_blockers(
  p_entity_key text,
  p_module_id  uuid
)
returns table (rel_name text, row_count bigint, blocking boolean)
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

  -- entity_key를 함께 건다. id로만 찾으면 다른 워크스페이스의 모듈이 자기 키로 걸린다.
  execute format('select program_id from public.%I where id = $1 and entity_key = $2', v_module)
    into v_program using p_module_id, p_entity_key;
  if v_program is null then
    return; -- 이미 없는 모듈. 막을 것도 알릴 것도 없다.
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
      rel_name := r.rel_name;
      row_count := c;
      blocking := app.module_external_record(r.rel_name);
      return next;

      -- 부모에 행이 있을 때만 자식을 센다. 부모가 비면 자식도 비기 때문이다(FK).
      for r2 in select * from app.module_cascade_children(r.rel_name) loop
        execute format(
          'select count(*) from public.%I ch join public.%I pt on ch.%I = pt.%I where pt.%I = $1%s',
          r2.rel_name, r.rel_name, r2.fk_col, r2.parent_col, r.fk_col,
          case when r2.soft_delete then ' and ch.deleted_at is null' else '' end)
          into c using p_module_id;
        if c > 0 then
          rel_name := r2.rel_name;
          row_count := c;
          blocking := app.module_external_record(r2.rel_name);
          return next;
        end if;
      end loop;
    end if;
  end loop;

  -- 첨부는 FK 없이 program_module_id 한 컬럼으로만 귀속된다(20260803230100). 지우지 않고
  -- 귀속만 푸는 대상이라 차단하지 않는다 — 화면이 '사업 자료로 옮겨집니다'로 안내한다.
  select count(*) into c
    from public.attachments
   where program_module_id = p_module_id and deleted_at is null;
  if c > 0 then
    rel_name := 'attachments'; row_count := c; blocking := false; return next;
  end if;
end;
$$;

revoke all on function public.program_module_delete_blockers(text, uuid) from public;
grant execute on function public.program_module_delete_blockers(text, uuid) to authenticated;

comment on function public.program_module_delete_blockers(text, uuid) is
  '모듈 삭제 시 남아 있는 데이터(원장명·건수·차단 여부). blocking=true는 밖에서 들어온 기록이라 삭제를 막고, false는 모듈과 함께 사라지므로 삭제창이 고지한다.';

-- ---------------------------------------------------------------------
-- (2) 삭제 RPC — 차단 판정을 blocking=true 행으로 좁히고, 첨부는 귀속만 푼다.
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
  v_uid      uuid := app.current_app_user_id();
  v_is_pm    boolean;
  v_block    text;
  r          record;
  r2         record;
begin
  select t.module_table, t.managers_table, t.timeline_table
    into v_module, v_managers, v_timeline
    from app.ws_module_tables(p_entity_key) t;
  if v_module is null then
    raise exception '알 수 없는 사업 원장입니다.' using errcode = '22023';
  end if;

  -- entity_key를 함께 건다(위 blockers와 같은 이유). 이 조건이 워크스페이스 경계다.
  execute format('select program_id, title, module_type::text from public.%I
                    where id = $1 and entity_key = $2', v_module)
    into v_program, v_title, v_type using p_module_id, p_entity_key;
  if v_program is null then
    raise exception '삭제할 모듈을 찾을 수 없습니다.' using errcode = '02000';
  end if;

  -- (1) 인가. 워크스페이스 쓰기 + 사업 접근을 먼저 보고, 그 위에 PM을 얹는다.
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

  -- (2) 따라쓰기. 모듈 종류·이름과 무관하게 언제나 '삭제합니다'다.
  --     앞뒤 공백과 마침표만 눈감아 준다.
  if btrim(coalesce(p_confirm_text, ''), E' .\t\r\n') <> '삭제합니다' then
    raise exception '확인 문구가 일치하지 않습니다.' using errcode = '22023';
  end if;

  -- (3) 밖에서 들어온 기록만 막는다. 내부에서 잡아 둔 배치는 함께 사라지며,
  --     무엇이 사라지는지는 삭제창이 이미 건수로 알렸다.
  select string_agg(b.rel_name || ' ' || b.row_count || '건', ', ')
    into v_block
    from public.program_module_delete_blockers(p_entity_key, p_module_id) b
   where b.blocking;
  if v_block is not null then
    raise exception '남아 있는 데이터가 있어 삭제할 수 없습니다: %', v_block
      using errcode = '23001';
  end if;

  -- (4) 감사 로그. 되돌릴 수 없는 작업이라 지우기 전에 남긴다.
  insert into public.audit_logs (actor_user_id, action, changed_workspace, before_data, reason)
  values (
    v_uid, 'MODULE_DELETE', v_ws,
    jsonb_build_object('entity_key', p_entity_key, 'module_id', p_module_id,
                       'program_id', v_program, 'title', v_title, 'module_type', v_type),
    '운영 모듈 하드 삭제(PM)'
  );

  -- (5) 첨부는 지우지 않고 귀속만 푼다 — 파일은 사업 자료로 돌아간다.
  --     행을 지우면 스토리지 실물이 남아 아무도 못 찾는 파일이 된다.
  update public.attachments
     set program_module_id = null
   where program_module_id = p_module_id;

  -- (6) 세간 정리 후 본체 삭제.
  --     타임라인은 cascade가 걸려 있지 않고(FK RESTRICT), 링크는 다형이라 FK 자체가 없다.
  execute format('delete from public.%I where program_module_id = $1', v_timeline)
    using p_module_id;

  delete from public.program_module_public_links
   where entity_key = p_entity_key and program_module_id = p_module_id;

  -- 자식 먼저, 부모 나중이다. 자식의 FK가 모두 cascade는 아니기 때문이다 —
  -- application_submissions는 form_id로 폼에 매달려 있고 그 FK에 on delete가 없어서,
  -- 이미 지운 지원서 한 건(deleted_at)만 남아 있어도 폼 삭제가 FK 오류로 끝난다.
  for r in select * from app.module_content_tables(v_module) loop
    for r2 in select * from app.module_cascade_children(r.rel_name) loop
      execute format(
        'delete from public.%I ch using public.%I pt
          where ch.%I = pt.%I and pt.%I = $1',
        r2.rel_name, r.rel_name, r2.fk_col, r2.parent_col, r.fk_col)
        using p_module_id;
    end loop;
    execute format('delete from public.%I where %I = $1', r.rel_name, r.fk_col)
      using p_module_id;
  end loop;

  -- 담당자 배정은 cascade라 본체 삭제가 함께 지운다.
  execute format('delete from public.%I where id = $1', v_module)
    using p_module_id;
end;
$$;

comment on function public.delete_program_module(text, uuid, text) is
  '운영 모듈 인스턴스 물리 삭제. PM 전용 · 확인 문구(''삭제합니다'') · 밖에서 들어온 기록 0건의 세 관문을 통과해야 실행된다. 내부 배치는 함께 삭제되고 첨부는 귀속만 풀린다. audit_logs 적재.';
