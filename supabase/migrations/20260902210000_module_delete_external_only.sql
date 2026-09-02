-- =====================================================================
-- 모듈 삭제 차단 기준을 '밖에서 들어온 것'으로 좁힌다
--
-- 무엇을 바꾸는가
--   20260902180000은 모듈에 딸린 모든 것을 차단 사유로 셌고, 20260902200000이 양식·항목
--   정의만 예외로 뺐다. 그래도 회차·세션·배정처럼 **내부에서 잡아 둔 배치**가 남아 있으면
--   여전히 못 지웠다. 사용자 결정(2026-09-02): **밖에서 들어온 데이터가 없으면 지울 수
--   있어야 한다.** 세팅만 해 두고 접은 모듈을 정리하지 못하는 것이 실제 불편이었고,
--   내부 배치는 그 모듈을 만든 사람이 만든 것이라 같은 사람이 거둘 수 있어야 한다.
--
-- 그래서 목록의 성격이 바뀐다
--   전에는 '남아 있으면 못 지우는 것' 한 종류였다. 이제 둘로 갈린다.
--     · **차단**: 밖에서 들어온 제출·응답·기록. 있으면 서버가 거부한다.
--     · **경고**: 그 밖에 남은 것. 막지 않되 **삭제창이 '함께 삭제됩니다'로 건수를 보여 준다.**
--   막지 않는 것과 말없이 지우는 것은 다르다 — 차단을 풀면서 고지까지 없애면, 담당자는
--   자기가 무엇을 지우는지 모른 채 확인 문구를 치게 된다. 그래서 판정은 느슨해지고
--   화면은 더 많이 말한다.
--
-- 첨부는 지우지 않고 귀속만 푼다
--   attachments는 신규 원장이 아니라 사업 자료와 **같은 행**이고 program_module_id는 귀속
--   표시일 뿐이다(20260803230100). 그러므로 모듈이 사라질 때 지울 것이 아니라 귀속을
--   NULL로 되돌리면 된다 — 파일은 사업 자료 목록으로 돌아가고 S3 객체도 고아가 되지 않는다.
--   행을 지우면 스토리지의 실물은 그대로 남아 아무도 못 찾는 파일이 된다.
--
-- 새 원장이 생기면 분류해야 한다
--   기본값이 '차단하지 않음'으로 뒤집혔으므로, 밖에서 들어오는 원장을 새로 만들고 아래
--   목록에 넣지 않으면 **조용히 함께 지워진다**. 이것이 이 변경이 지불하는 대가이며,
--   그래서 보안 게이트 체크리스트에 분류 항목을 함께 추가한다.
--
-- ---------------------------------------------------------------------
-- 보안 게이트 자기점검 (docs/docs_dev/11_migration_security_gate.md)
--   · 함수 2종 본문 교체 + 판정 헬퍼 1종 신규/1종 폐기. 시그니처는 blockers만 컬럼 1개 추가.
--   · **차단이 느슨해지는 변경**이다. 완화 장치는 셋 — 삭제는 여전히 PM 전용,
--     확인 문구 유지, 그리고 함께 사라지는 것을 삭제창이 건수로 고지한다.
--   · 되돌릴 수 없는 작업이므로 audit_logs 적재는 그대로 유지한다.
--   · SECURITY DEFINER 유지 + search_path 고정 + 함수 첫머리 인가 검사 유지.
--   · 신규 테이블·정책·시드 없음.
-- 근거: 20260902180000_program_module_hard_delete.sql, 20260902190000, 20260902200000
-- =====================================================================

-- 설정 판정은 '외부 여부' 판정으로 대체된다. 두 기준이 공존하면 어느 쪽이 답인지 모호해진다.
drop function if exists app.module_config_table(text);

-- ---------------------------------------------------------------------
-- (1) 밖에서 들어온 기록 판정 — 이 표에 행이 있으면 삭제를 막는다.
--     기준은 하나: **우리 밖의 누군가가 남긴 것인가.** 지원자가 낸 지원서, 평가자가 낸
--     채점, 참석자가 찍은 출석, 신청자가 잡은 예약, 멘티·멘토가 남긴 기록, 그리고 그
--     결과로 밖에 통보된 선정 결과다.
--     내부에서 잡아 둔 배치(폼·평가표·회차·세션·배정·발표 순서)는 여기 없다 — 만든 사람이
--     거둘 수 있어야 한다.
--     사업 3종은 원장이 접두사만 다르므로 접두사를 떼고 한 번만 나열한다.
-- ---------------------------------------------------------------------
create or replace function app.module_external_record(p_rel_name text)
returns boolean
language sql
immutable
set search_path = app, public
as $$
  select regexp_replace(p_rel_name, '^(?:ma|project)_', '') in (
    -- 모집: 지원자가 낸 것
    'application_submissions',
    'application_answers',
    -- 평가: 평가자가 낸 채점과, 그 결과로 밖에 통보되는 선정 결과
    'evaluation_submissions',
    'evaluation_answers',
    'selection_results',
    -- 참여: 참석자가 찍은 출석, 신청자가 잡은 예약, 관심표명
    'attendance_logs',
    'matching_bookings',
    'demoday_interests',
    'follow_up_meetings',
    -- 멘토링·상담: 멘토·멘티가 남긴 기록(세션 일정이 아니라 그 안에서 오간 것)
    'mentoring_logs',
    'mentor_satisfaction_records',
    'mentor_feedback_records',
    'counseling_logs'
  );
$$;

comment on function app.module_external_record(text) is
  '모듈 삭제를 막는 외부 유입 기록 판정. 여기 없는 표는 삭제를 막지 않으므로, 밖에서 들어오는 원장을 새로 만들면 반드시 여기에 넣어야 한다.';

-- ---------------------------------------------------------------------
-- (2) 잔존 데이터 집계 — 차단 여부를 행마다 함께 돌려준다.
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

  execute format('select program_id from public.%I where id = $1', v_module)
    into v_program using p_module_id;
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
-- (3) 삭제 RPC — 차단 판정을 blocking=true 행으로 좁히고, 첨부는 귀속만 푼다.
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

  execute format('select program_id, title, module_type::text from public.%I where id = $1', v_module)
    into v_program, v_title, v_type using p_module_id;
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
