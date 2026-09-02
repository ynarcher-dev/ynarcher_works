-- =====================================================================
-- 모듈 삭제 확인 문구를 고정 문구('삭제합니다')로 통일
--
-- 왜 바꾸는가
--   20260902180000은 모듈명을 그대로 치게 했다. 확인 대상을 문구 자체가 지목한다는 점은
--   좋았지만 실무에서 두 가지가 걸린다 — 모듈명이 길거나 괄호·중점·연도가 섞인 이름
--   ('2026 1차 모집(예비)')이면 사용자가 계속 실패하고, 모듈명을 비워 둔 인스턴스는
--   폴백이 템플릿 키('RECRUITMENT')여서 한글 화면에서 갑자기 영문 대문자를 치라고 한다.
--   따라쓰기가 확인하려는 것은 정확한 타자가 아니라 **지금 지운다는 의식적 동의**이므로,
--   한 문구로 통일해 실패하지 않으면서 조작을 의식하게 만든다.
--
--   대신 '무엇을 지우는가'의 확인은 문구가 아니라 삭제창의 경고 배너가 맡는다(모듈명을
--   굵게 박아 보여 준다). 문구와 배너 둘 다에 모듈명을 실으면 같은 말을 두 번 하는 것이고,
--   둘 중 실패할 수 있는 쪽(입력)에만 실으면 정작 읽어야 할 쪽(배너)을 건너뛰게 된다.
--
-- 관대함의 경계
--   앞뒤 공백과 마침표는 눈감아 준다('삭제합니다.'도 통과). 화면이 마침표 없이 제시하지만
--   문장으로 받아들여 점을 찍는 것은 오조작이 아니라 자연스러운 타자이고, 그것 때문에
--   막히면 사용자는 자기가 무엇을 틀렸는지 알 수 없다. 그 밖의 글자는 그대로 대조한다.
--
-- ---------------------------------------------------------------------
-- 보안 게이트 자기점검 (docs/docs_dev/11_migration_security_gate.md)
--   · 함수 1종 본문 교체(create or replace). 시그니처·GRANT·소유 워크스페이스 변동 없음.
--   · 권한 판정(PM 전용)·잔존 데이터 차단·audit_logs 적재는 그대로다. 바뀌는 것은
--     두 번째 관문의 비교 대상뿐이며, 관문이 사라지지 않는다.
--   · SECURITY DEFINER 유지 + search_path 고정 + 함수 첫머리 인가 검사 유지.
--   · 신규 테이블·정책·시드 없음.
-- 근거: 20260902180000_program_module_hard_delete.sql(원본 정의)
-- =====================================================================

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

  -- (4-2) 따라쓰기. 모듈 종류·이름과 무관하게 언제나 '삭제합니다'다(2026-09-02 통일).
  --       앞뒤 공백과 마침표만 눈감아 준다 — 화면은 점 없이 제시하지만 문장으로 받아들여
  --       점을 찍는 것은 오조작이 아니며, 그것 때문에 막히면 무엇을 틀렸는지 알 수 없다.
  if btrim(coalesce(p_confirm_text, ''), E' .\t\r\n') <> '삭제합니다' then
    raise exception '확인 문구가 일치하지 않습니다.' using errcode = '22023';
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
  --
  -- 자식 먼저, 부모 나중이다. 자식의 FK가 모두 cascade는 아니기 때문이다 —
  -- application_submissions는 form_id로 폼에 매달려 있고 그 FK에 on delete가 없어서,
  -- 이미 지운 지원서 한 건(deleted_at)만 남아 있어도 폼 삭제가 FK 오류로 끝난다.
  -- 그러면 사용자에게는 또 '비어 있는데 안 지워진다'로 보인다.
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
  -- 첨부는 FK가 없어 (4-3)이 살아 있는 행을 이미 막았고, 지워진 행은 파일 기록으로
  -- 남겨 둔다 — 원장을 지우는 것과 업로드 이력을 지우는 것은 다른 결정이다.
  execute format('delete from public.%I where id = $1', v_module)
    using p_module_id;
end;
$$;

comment on function public.delete_program_module(text, uuid, text) is
  '운영 모듈 인스턴스 물리 삭제. PM 전용 · 확인 문구(''삭제합니다'') 일치 · 잔존 데이터 없음의 세 관문을 모두 통과해야 실행되며 audit_logs에 적재한다.';
