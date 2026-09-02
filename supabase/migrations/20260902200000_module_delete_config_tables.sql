-- =====================================================================
-- 모듈 삭제 차단에서 '양식·항목 정의'를 뺀다 — 설정은 기록이 아니다
--
-- 무엇이 틀렸었나
--   20260902180000은 모듈에 딸린 것을 카탈로그로 전부 긁어 차단 사유로 셌다. 그 결과
--   **모집 폼 정의**(application_forms — 모듈과 1:1, uq_application_forms_module)와 그
--   **입력 항목**(application_form_fields)까지 '남아 있는 업무 기록'으로 계산되어,
--   지원서가 0건인 모집 모듈이 '모집 신청서 1건 · 신청서 항목 1건'으로 영영 지워지지
--   않았다. 모집 모듈은 설정을 마치는 순간 폼이 생기므로, 사실상 모집은 못 지우는
--   모듈이 되어 있었다(2026-09-02 사용자 확인).
--
-- 가르는 기준
--   **무엇을 받을지·무엇을 잴지 정해 둔 것은 설정이고, 사람이 제출·기록한 것은 내용물이다.**
--   폼과 평가표는 모듈을 세울 때 함께 만들어지는 모듈의 일부다 — 담당자 배정·링크 설정과
--   같은 자리이며, 모듈이 사라지면 함께 사라지는 것이 맞다. 지켜야 할 것은 그 양식으로
--   들어온 지원서·평가 제출·선정 결과이고, 그것들은 그대로 차단한다.
--
-- 왜 이번에는 손 목록인가
--   '무엇이 정의인가'는 스키마 모양이 답하지 못한다(폼의 자식 자리에 항목 정의와 지원서가
--   나란히 앉아 있다). 다만 **손 목록의 방향이 반대라 안전하다** — 이 목록에서 빠진 표는
--   계속 차단하므로, 빠뜨렸을 때의 결과는 '못 지운다'(불편)이지 '지워진다'(유실)가 아니다.
--   내용물 쪽을 손으로 나열했다면 빠뜨린 표가 곧 유실 경로가 되었을 것이고, 그래서 그쪽은
--   여전히 카탈로그가 답한다.
--
-- 설정으로 분류해도 세는 것은 멈추지 않는다
--   설정 표는 차단하지 않을 뿐 **그 아래로는 계속 내려간다**. 폼을 세지 않는다고 폼에 달린
--   지원서까지 놓치면, 정확히 막아야 할 것을 놓치게 된다.
--
-- ---------------------------------------------------------------------
-- 보안 게이트 자기점검 (docs/docs_dev/11_migration_security_gate.md)
--   · 함수 1종 본문 교체 + 판정 헬퍼 1종 신규(app.module_config_table). 시그니처·GRANT 변동 없음.
--   · 차단이 **느슨해지는 변경**이므로 경계를 좁혀 적었다 — 사람이 제출·기록·업로드한 표는
--     하나도 목록에 넣지 않았고, 넣은 넷은 모두 '무엇을 받을지/잴지'의 정의다.
--   · SECURITY DEFINER 유지 + search_path 고정 + 함수 첫머리 인가 검사 유지.
--   · 신규 테이블·정책·시드 없음.
-- 근거: 20260902180000_program_module_hard_delete.sql(원본 정의),
--       20260716170000_recruitment_form_customization.sql(uq_application_forms_module)
-- =====================================================================

-- ---------------------------------------------------------------------
-- (1) 설정(정의) 원장 판정
--     사업 3종은 원장이 접두사만 다르므로 접두사를 떼고 한 번만 나열한다.
-- ---------------------------------------------------------------------
create or replace function app.module_config_table(p_rel_name text)
returns boolean
language sql
immutable
set search_path = app, public
as $$
  select regexp_replace(p_rel_name, '^(?:ma|project)_', '') in (
    -- 모집: 무엇을 받을지의 정의(폼은 모듈과 1:1)
    'application_forms',
    'application_form_fields',
    -- 평가: 무엇을 잴지의 정의
    'evaluation_forms',
    'evaluation_criteria'
  );
$$;

comment on function app.module_config_table(text) is
  '모듈 삭제 차단에서 제외하는 설정(양식·항목 정의) 원장 판정. 목록에서 빠지면 차단하는 쪽으로 실패하므로 방향이 안전하다.';

-- ---------------------------------------------------------------------
-- (2) 차단 집계 — 설정 표는 세되 사유로 내세우지 않고, 그 아래로는 계속 내려간다.
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
      -- 설정 표는 사유로 내세우지 않는다. 다만 **아래로는 그대로 내려간다** —
      -- 폼을 세지 않는다고 폼에 달린 지원서까지 놓치면 정작 막을 것을 놓친다.
      if not app.module_config_table(r.rel_name) then
        rel_name := r.rel_name; row_count := c; return next;
      end if;

      for r2 in select * from app.module_cascade_children(r.rel_name) loop
        execute format(
          'select count(*) from public.%I ch join public.%I pt on ch.%I = pt.%I where pt.%I = $1%s',
          r2.rel_name, r.rel_name, r2.fk_col, r2.parent_col, r.fk_col,
          case when r2.soft_delete then ' and ch.deleted_at is null' else '' end)
          into c using p_module_id;
        if c > 0 and not app.module_config_table(r2.rel_name) then
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

comment on function public.program_module_delete_blockers(text, uuid) is
  '모듈 삭제를 막는 잔존 데이터(원장명·건수). 양식·항목 정의는 모듈 설정이라 사유에서 빠지되 그 하위 제출 기록은 그대로 센다. 비어 있으면 삭제 가능.';
