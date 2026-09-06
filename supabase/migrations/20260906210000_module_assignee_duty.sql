-- =====================================================================
-- [사업 공용] 모듈 담당자에 '업무롤'(하는 일) 한 줄을 더한다
--
-- 배경: 모듈 카드가 담당자를 이름만 나열해서, 두 사람이 걸린 모듈에서 누가 무엇을 맡았는지
--       화면이 답하지 못했다. 사업 담당자 원장(program_managers)의 PM/멤버는 '이 사업에서의
--       지위'라 그 물음에 답하지 못한다 — 답해야 하는 것은 '이 모듈에서 무엇을 하는가'다.
--
-- 가르는 기준: **역할은 사업이 알고, 하는 일은 모듈이 안다.**
--   * 역할(PM·멤버)은 program_managers가 이미 가진 사실이므로 여기 복제하지 않는다. 복제하면
--     한쪽만 고치는 날 같은 사람이 두 화면에서 다른 역할이 된다.
--   * 업무롤은 모듈마다 다르므로(같은 사람이 모집에서는 서류 검토, 회의록에서는 기록) 모듈
--     담당자 행이 갖는다.
--
-- 범위:
--   (1) program_module_assignees.duty 신설(nullable, 200자 상한)
--   (2) set_program_module — 담당자 인자를 uuid[]에서 jsonb([{user_id, duty}])로 바꾼다.
--       구 시그니처는 드롭한다: 둘 다 남기면 어느 쪽이 진짜인지가 호출자 취향이 되고,
--       담당자 검증 규칙이 두 벌로 갈라지기 시작한다(20260903101000이 세 벌을 합친 근거와 같다).
--
-- 상한을 두는 이유: 이 값이 서는 자리는 카드의 한 줄이다. 길이를 열어 두면 본문이 들어와
--   카드가 화면을 밀고, 목록에서 '무엇을 맡았는가'를 훑는 일이 안 된다. 200자는 서버가
--   최종 강제하고 폼도 같은 값으로 막는다.
--
-- 보안 게이트(11_migration_security_gate.md) 답변:
--   - 소유 워크스페이스: ac / mna / project (p_entity_key가 답한다)
--   - 데이터 등급: Internal (업무 배정 메모 — 개인정보가 아니다)
--   - 접근 주체: 내부 사용자(authenticated). 게스트·익명 경로 없음
--   - Scope 기준: 기존과 동일(program) — 새 정책을 만들지 않는다. duty는 이미 RLS가 걸린
--     행의 컬럼 하나이므로 program_module_assignees의 정책이 그대로 판정한다
--   - 감사 로그: 신규 Export·다운로드 경로 없음
--   - 모듈 하드 딜리트 분류: 해당 없음 — 신규 원장이 아니고, 담당자는 밖에서 들어온 기록이
--     아니라 내부에서 잡아 둔 배치라 종전대로 함께 지워진다(app.module_external_record 무변경)
--   - 운영 영향: RPC 시그니처가 바뀐다(p_assignee_user_ids → p_assignees). 프론트는 같은
--     커밋에서 함께 바뀌며, DB를 먼저 반영하고 프론트를 뒤에 내보내는 순서라 그 사이 옛
--     번들의 모듈 저장 1회가 실패할 수 있다(저장 실패 토스트로 드러나고 재시도로 복구된다)
-- 근거: 20260716160000_program_module_instances.sql, 20260903101000_program_module_rpc_unify.sql,
--       20260903140000_module_assignee_pool_sync.sql
-- =====================================================================

-- ---------------------------------------------------------------------
-- (1) 업무롤 컬럼
-- ---------------------------------------------------------------------
alter table public.program_module_assignees
  add column if not exists duty text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.program_module_assignees'::regclass
       and conname = 'program_module_assignees_duty_len'
  ) then
    alter table public.program_module_assignees
      add constraint program_module_assignees_duty_len
      check (duty is null or char_length(duty) <= 200);
  end if;
end $$;

comment on column public.program_module_assignees.duty is
  '이 모듈에서 이 담당자가 하는 일(업무롤) 한 줄. 역할(PM·멤버)은 사업 담당자 원장이 답하므로 여기 적지 않는다. 빈 문자열은 저장하지 않고 null로 접는다.';

-- ---------------------------------------------------------------------
-- (2) set_program_module — 담당자 인자를 jsonb로
-- ---------------------------------------------------------------------
drop function if exists public.set_program_module(text, uuid, uuid, text, text, text, text, text, jsonb, uuid[]);

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
  -- [{ "user_id": uuid, "duty": text|null }, ...] — 순서는 화면이 보여 준 순서 그대로다.
  p_assignees          jsonb
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
  v_row        jsonb;
  v_uid        uuid;
  v_ok         boolean;
begin
  if p_entity_key not in ('program', 'ma_program', 'project_program') then
    raise exception '알 수 없는 사업 원장입니다: %', p_entity_key using errcode = '22023';
  end if;

  if p_assignees is not null and jsonb_typeof(p_assignees) <> 'array' then
    raise exception '담당자 목록의 형식이 올바르지 않습니다.' using errcode = '22023';
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

  -- 담당자 검증(전체 사전 확인; 풀 소속은 트리거와 이중 방어).
  -- 업무롤 길이도 여기서 함께 본다 — CHECK가 최종 강제하지만, 그때 나오는 오류 문구는
  -- 담당자에게 무엇이 잘못됐는지 말해 주지 못한다.
  if p_assignees is not null then
    for v_row in select * from jsonb_array_elements(p_assignees) loop
      v_uid := (v_row->>'user_id')::uuid;
      if v_uid is null then
        raise exception '담당자 목록에 사용자 없이 들어온 항목이 있습니다.' using errcode = '22023';
      end if;
      execute format(
        'select exists (select 1 from public.%I where program_id = $1 and user_id = $2)', v_managers)
        into v_ok using p_program_id, v_uid;
      if not v_ok then
        raise exception '담당자는 사업 담당자 풀에 있는 사용자만 지정할 수 있습니다.' using errcode = '42501';
      end if;
      if char_length(coalesce(btrim(v_row->>'duty'), '')) > 200 then
        raise exception '업무롤은 200자를 넘을 수 없습니다.';
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

  -- 담당자 전량 교체. 같은 사람이 두 번 들어오면 **앞엣것만** 남긴다 — 화면이 중복 선택을
  -- 막지만 서버가 그 가정 위에 서면 안 되고, 같은 명령 안의 중복은 on conflict가 걸러 주지
  -- 못하는 자리(DO UPDATE는 같은 행을 두 번 건드릴 수 없다)라 먼저 접어서 넣는다.
  delete from public.program_module_assignees where program_module_id = v_id;
  if p_assignees is not null then
    insert into public.program_module_assignees (program_module_id, user_id, duty, assigned_by)
    select distinct on (uid) v_id, uid, duty, app.current_app_user_id()
      from (
        select (a.value->>'user_id')::uuid                        as uid,
               nullif(btrim(coalesce(a.value->>'duty', '')), '')  as duty,
               a.ordinality                                       as pos
          from jsonb_array_elements(p_assignees) with ordinality as a(value, ordinality)
      ) src
     order by uid, pos
    on conflict (program_module_id, user_id) do nothing;
  end if;

  return v_id;
end;
$fn$;

revoke all on function public.set_program_module(text, uuid, uuid, text, text, text, text, text, jsonb, jsonb) from public;
grant execute on function public.set_program_module(text, uuid, uuid, text, text, text, text, text, jsonb, jsonb) to authenticated;

comment on function public.set_program_module(text, uuid, uuid, text, text, text, text, text, jsonb, jsonb) is
  '사업 운영 모듈 인스턴스 생성/수정 + 담당자(업무롤 포함) 전량 교체(원자). AC·M&A·PROJECT 공용이며 소유 원장은 p_entity_key가 정한다. 모듈명 유일·담당자 풀 소속·OUTCOMES 단일·기간 포함·템플릿 카탈로그 허용·업무롤 길이를 서버에서 강제한다.';
