-- =====================================================================
-- [사업 공용] 모듈 원장 통합에 따른 헬퍼·RPC 정리
-- 선행: 20260903100000_program_module_ledger_unify.sql (구 원장 드롭)
--
-- 범위:
--   (1) app.ws_module_tables / app.ws_module_row — 모듈 원장이 하나가 되었으므로
--       화이트리스트에서 ma_/project_ 모듈 테이블 이름을 걷어낸다. 담당자·타임라인은
--       여전히 워크스페이스별이라 그대로 남는다.
--   (2) set_program_module — 세 벌(set_program_module/set_ma_/set_project_)을 한 벌로 합치고
--       p_entity_key를 받는다. 구 3종은 드롭한다 — 둘 다 남기면 어느 쪽이 진짜인지가
--       호출자 취향이 되고, 검증 규칙이 갈라지기 시작한다.
--
-- 보안 게이트(11_migration_security_gate.md) 답변:
--   - 소유 워크스페이스: ac / mna / project (p_entity_key가 답한다)
--   - 데이터 등급: Internal
--   - 접근 주체: 내부 사용자(authenticated). 게스트·익명 경로 없음
--   - Scope 기준: app.can_write_workspace(ws) + app.can_access_ws_program(ws, program_id)
--   - SECURITY DEFINER 유지 이유: 담당자 풀·모듈명 유일성·기간 포함을 한 트랜잭션에서
--     강제해야 하며, 호출자 RLS로는 '다른 사업의 동명 모듈' 존재 여부를 볼 수 없어
--     유일성 검사가 조용히 통과한다. search_path 고정 + 자체 인가 + authenticated 한정.
--   - 감사 로그: 신규 Export·다운로드 경로 없음.
--   - 운영 영향: RPC 시그니처가 바뀐다(p_entity_key 추가). 프론트는 같은 커밋에서 함께 바뀐다.
-- 근거: 20260716160000_program_module_instances.sql, 20260902130000_module_public_links.sql,
--       20260902180000_program_module_hard_delete.sql, 20260902140000_module_templates.sql
-- =====================================================================

-- ---------------------------------------------------------------------
-- (1) 원장 이름 화이트리스트 — 모듈은 한 벌, 담당자·타임라인은 세 벌
-- ---------------------------------------------------------------------
create or replace function app.ws_module_tables(p_entity_key text)
returns table (module_table text, managers_table text, timeline_table text)
language sql
immutable
set search_path = app, public
as $fn$
  select t.c2, t.c3, t.c4
    from (values
      ('program',         'program_modules', 'program_managers',         'program_timeline_items'),
      ('ma_program',      'program_modules', 'ma_program_managers',      'ma_program_timeline_items'),
      ('project_program', 'program_modules', 'project_program_managers', 'project_program_timeline_items')
    ) as t(c1, c2, c3, c4)
   where t.c1 = p_entity_key;
$fn$;

comment on function app.ws_module_tables(text) is
  '다형 키 → 모듈·담당자·타임라인 원장 이름. 모듈 원장은 2026-09-03 통합되어 세 키 모두 program_modules를 가리킨다.';

-- 통합 이후에는 동적 SQL이 필요 없다. entity_key를 조건에 함께 두는 것이 핵심이다 —
-- id만으로 찾으면 다른 워크스페이스의 모듈을 자기 키로 부르는 호출이 통과한다.
create or replace function app.ws_module_row(p_entity_key text, p_module_id uuid)
returns table (program_id uuid, module_type text, enabled boolean, status text)
language sql
stable
set search_path = app, public
as $fn$
  select m.program_id, m.module_type::text, m.enabled, m.status::text
    from public.program_modules m
   where m.id = p_module_id
     and m.entity_key = p_entity_key;
$fn$;

grant execute on function app.ws_module_row(text, uuid) to authenticated;

comment on function app.ws_module_row(text, uuid) is
  '다형 키로 모듈 1행을 읽는 단일 창구. SECURITY INVOKER이므로 호출자의 모듈 RLS가 그대로 적용된다.';

-- ---------------------------------------------------------------------
-- (2) 모듈 생성/수정 RPC 통합
-- ---------------------------------------------------------------------
drop function if exists public.set_program_module(uuid, uuid, text, text, text, text, text, jsonb, uuid[]);
drop function if exists public.set_ma_program_module(uuid, uuid, text, text, text, text, text, jsonb, uuid[]);
drop function if exists public.set_project_program_module(uuid, uuid, text, text, text, text, text, jsonb, uuid[]);

create or replace function public.set_program_module(
  p_entity_key         text,
  p_program_id         uuid,
  p_module_id          uuid,
  p_module_type        text,
  p_title              text,
  p_status             text,
  p_visibility         text,
  p_participation_mode text,
  p_settings           jsonb,
  p_assignee_user_ids  uuid[]
)
returns uuid
language plpgsql
security definer
set search_path = app, public
as $fn$
declare
  v_ws         text := app.entity_key_workspace(p_entity_key);
  v_managers   text;
  v_prog_table text;
  v_id         uuid := p_module_id;
  v_title      text := nullif(btrim(p_title), '');
  v_mode       text;
  v_ps         date := (p_settings->>'start_date')::date;
  v_pe         date := (p_settings->>'end_date')::date;
  v_prog       jsonb;
  v_prop_start date;
  v_prop_end   date;
  v_op_start   date;
  v_op_end     date;
  v_uid        uuid;
  v_ok         boolean;
begin
  if p_entity_key not in ('program', 'ma_program', 'project_program') then
    raise exception '알 수 없는 사업 원장입니다: %', p_entity_key using errcode = '22023';
  end if;

  select managers_table into v_managers from app.ws_module_tables(p_entity_key);
  v_prog_table := case p_entity_key
    when 'program'         then 'programs'
    when 'ma_program'      then 'ma_programs'
    when 'project_program' then 'project_programs'
  end;

  -- 인가: 관리자 또는 (해당 워크스페이스 쓰기 + 그 사업 접근권)
  if not (
    app.is_admin()
    or (app.can_write_workspace(v_ws) and app.can_access_ws_program(v_ws, p_program_id))
  ) then
    raise exception '운영 모듈을 변경할 권한이 없습니다.' using errcode = '42501';
  end if;

  -- 배치 가능한 템플릿인가(ADMIN 카탈로그가 답한다). 화면에서 감추는 것은 보안이 아니다.
  if v_id is null and not app.module_template_available(p_module_type, v_ws) then
    raise exception '이 워크스페이스에서 배치할 수 없는 모듈 종류입니다: %', p_module_type
      using errcode = '42501';
  end if;

  -- 수정 대상 인스턴스가 이 사업 소속인지 확인(원장까지 함께 본다).
  if v_id is not null and not exists (
    select 1 from public.program_modules
     where id = v_id and program_id = p_program_id and entity_key = p_entity_key
  ) then
    raise exception '수정할 모듈 인스턴스를 찾을 수 없습니다.';
  end if;

  -- 배정 방식: 미지정 시 템플릿 기본값으로 강제.
  v_mode := coalesce(p_participation_mode, case p_module_type
    when 'RECRUITMENT'       then 'OPEN_APPLICATION'
    when 'DOC_REVIEW'        then 'REVIEWER_ASSIGNMENT'
    when 'ONSITE_EVAL'       then 'REVIEWER_ASSIGNMENT'
    when 'DEMO_DAY'          then 'REVIEWER_ASSIGNMENT'
    when 'ORIENTATION'       then 'ADMIN_ONLY'
    when 'OUTCOMES'          then 'ADMIN_ONLY'
    when 'CUSTOM_ACTIVITY'   then 'ADMIN_ONLY'
    when 'MENTORING'         then 'MANUAL_ALLOCATION'
    when 'BUSINESS_MATCHING' then 'STARTUP_FCFS'
  end);

  -- 모듈명 중복 금지(사업 내, 정규화 비교; 수정 시 자기 자신 제외).
  if v_title is not null and exists (
    select 1 from public.program_modules pm
     where pm.program_id = p_program_id
       and lower(btrim(pm.title)) = lower(v_title)
       and (v_id is null or pm.id <> v_id)
  ) then
    raise exception '이미 같은 이름의 모듈이 있습니다: %', v_title;
  end if;

  -- OUTCOMES 단일성(신규 생성 시).
  if p_module_type = 'OUTCOMES' and v_id is null and exists (
    select 1 from public.program_modules
     where program_id = p_program_id and module_type = 'OUTCOMES'
  ) then
    raise exception '성과/KPI 모듈은 사업당 1개만 배치할 수 있습니다.';
  end if;

  -- 기간 검증: start<=end 및 제안/운영 기간 중 한 구간에 완전 포함.
  -- 세 사업 원장의 기간 컬럼명이 같으므로 jsonb로 한 번에 읽는다.
  if v_ps is not null and v_pe is not null then
    if v_ps > v_pe then
      raise exception '종료일은 시작일 이후여야 합니다.';
    end if;
    execute format('select to_jsonb(p) from public.%I p where p.id = $1', v_prog_table)
      into v_prog using p_program_id;
    v_prop_start := (v_prog->>'proposal_start_date')::date;
    v_prop_end   := (v_prog->>'proposal_end_date')::date;
    v_op_start   := (v_prog->>'start_date')::date;
    v_op_end     := (v_prog->>'end_date')::date;
    if (v_prop_start is not null and v_prop_end is not null)
       or (v_op_start is not null and v_op_end is not null) then
      if not (
        (v_prop_start is not null and v_prop_end is not null and v_ps >= v_prop_start and v_pe <= v_prop_end)
        or (v_op_start is not null and v_op_end is not null and v_ps >= v_op_start and v_pe <= v_op_end)
      ) then
        raise exception '모듈 기간은 제안 기간 또는 운영 기간 내에서만 설정할 수 있습니다.';
      end if;
    end if;
  end if;

  -- 담당자 풀 소속 검증(전체 사전 확인; 트리거와 이중 방어).
  if p_assignee_user_ids is not null then
    foreach v_uid in array p_assignee_user_ids loop
      execute format(
        'select exists (select 1 from public.%I where program_id = $1 and user_id = $2)', v_managers)
        into v_ok using p_program_id, v_uid;
      if not v_ok then
        raise exception '담당자는 사업 담당자 풀에 있는 사용자만 지정할 수 있습니다.' using errcode = '42501';
      end if;
    end loop;
  end if;

  -- 인스턴스 upsert(생성/수정).
  if v_id is null then
    insert into public.program_modules
      (entity_key, program_id, module_type, title, enabled, status, participation_mode, visibility, settings)
    values (
      p_entity_key, p_program_id, p_module_type::public.module_type, v_title, true,
      p_status::public.module_status, v_mode::public.participation_mode,
      p_visibility::public.module_visibility, coalesce(p_settings, '{}'::jsonb)
    )
    returning id into v_id;
  else
    update public.program_modules set
      title              = v_title,
      status             = p_status::public.module_status,
      participation_mode = v_mode::public.participation_mode,
      visibility         = p_visibility::public.module_visibility,
      settings           = coalesce(p_settings, '{}'::jsonb),
      updated_at         = now()
    where id = v_id;
  end if;

  -- 담당자 전량 교체.
  delete from public.program_module_assignees where program_module_id = v_id;
  if p_assignee_user_ids is not null then
    insert into public.program_module_assignees (program_module_id, user_id, assigned_by)
    select v_id, u, app.current_app_user_id()
      from unnest(p_assignee_user_ids) as u
    on conflict (program_module_id, user_id) do nothing;
  end if;

  return v_id;
end;
$fn$;

revoke all on function public.set_program_module(text, uuid, uuid, text, text, text, text, text, jsonb, uuid[]) from public;
grant execute on function public.set_program_module(text, uuid, uuid, text, text, text, text, text, jsonb, uuid[]) to authenticated;

comment on function public.set_program_module(text, uuid, uuid, text, text, text, text, text, jsonb, uuid[]) is
  '사업 운영 모듈 인스턴스 생성/수정 + 담당자 전량 교체(원자). AC·M&A·PROJECT 공용이며 소유 원장은 p_entity_key가 정한다. 모듈명 유일·담당자 풀 소속·OUTCOMES 단일·기간 포함·템플릿 카탈로그 허용을 서버에서 강제한다.';
