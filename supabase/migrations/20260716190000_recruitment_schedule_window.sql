-- =====================================================================
-- [AC] 모집 공개 기간(타이머): 언제부터 언제까지 공개 URL이 열리는지 설정
-- 근거 기획: docs/docs_planning/3_4_3_ac_recruitment.md
-- 보안 게이트: docs/docs_dev/11_migration_security_gate.md
--   소유 ws=ac / 등급=Internal(모집 일정 메타) / scope=program
--   접근: 내부 운영자(설정) — 외부 신청자 공개 경로는 기존 Edge Function(service_role)이 중개.
--   - application_forms: 컬럼 추가만(open_at/close_at). 기존 program 스코프 RLS
--     (20260705150500_ac_rls.sql)가 그대로 커버(신규 테이블 없음 → 신규 RLS 불필요).
--   - set_application_form: 기존 SECURITY DEFINER 함수를 확장(파라미터 2개 추가).
--     자체 인가·search_path 고정·authenticated 한정은 그대로 유지.
--   - 실제 시간 게이트(now ∈ [open_at, close_at])는 공개 Edge Function이 authoritative하게 강제한다.
-- 배포 주의: 함수 시그니처가 바뀌므로 db push(함수 반영)가 프론트 배포보다 선행해야 한다.
-- =====================================================================

-- (1) 공개 기간 컬럼 추가 ----------------------------------------------------
alter table public.application_forms
  -- 공개 시작 일시(NULL이면 상태가 OPEN인 즉시 공개).
  add column if not exists open_at timestamptz,
  -- 공개 마감 일시(NULL이면 상태가 OPEN인 동안 무기한 공개).
  add column if not exists close_at timestamptz;

do $$ begin
  alter table public.application_forms
    add constraint application_forms_window_check
    check (open_at is null or close_at is null or close_at > open_at);
exception when duplicate_object then null; end $$;

comment on column public.application_forms.open_at is
  '공개 모집 시작 일시(timestamptz). NULL이면 public_status=OPEN 즉시 공개.';
comment on column public.application_forms.close_at is
  '공개 모집 마감 일시(timestamptz). NULL이면 무기한. 이 시각 이후 Edge Function이 접수를 거부.';

-- (2) 폼 빌더 RPC 확장(공개 기간 파라미터 추가) ------------------------------
--     시그니처가 바뀌므로 기존 7인자 함수를 제거하고 9인자로 재정의한다.
drop function if exists public.set_application_form(uuid, uuid, uuid, text, text, jsonb, jsonb);

create or replace function public.set_application_form(
  p_program_id        uuid,
  p_program_module_id uuid,
  p_form_id           uuid,
  p_title             text,
  p_public_status     text,
  p_landing           jsonb,
  p_fields            jsonb,  -- [{id?, field_type, label, is_required, options, file_constraints, sort_order}]
  p_open_at           timestamptz default null,
  p_close_at          timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = app, public
as $$
declare
  v_id       uuid := p_form_id;
  v_token    text;
  v_title    text := nullif(btrim(p_title), '');
  v_status   text := coalesce(nullif(btrim(p_public_status), ''), 'PRIVATE');
  v_keep_ids uuid[];
  v_field    jsonb;
  v_fid      uuid;
begin
  -- 인가: 관리자 또는 (ac 쓰기 + 해당 프로그램 접근권).
  if not (
    app.is_admin()
    or (app.can_write_workspace('ac') and app.can_access_program(p_program_id))
  ) then
    raise exception '신청서를 변경할 권한이 없습니다.' using errcode = '42501';
  end if;

  if v_status not in ('PRIVATE', 'OPEN', 'CLOSED') then
    raise exception '공개 상태 값이 올바르지 않습니다: %', v_status;
  end if;

  -- 공개 기간 유효성: 마감은 시작 이후여야 한다.
  if p_open_at is not null and p_close_at is not null and p_close_at <= p_open_at then
    raise exception '모집 마감 일시는 시작 일시보다 뒤여야 합니다.';
  end if;

  -- 모듈 인스턴스가 이 프로그램의 모집(RECRUITMENT) 인스턴스인지 확인.
  if p_program_module_id is not null and not exists (
    select 1 from public.program_modules pm
    where pm.id = p_program_module_id
      and pm.program_id = p_program_id
      and pm.module_type = 'RECRUITMENT'
  ) then
    raise exception '모집 신청서는 해당 프로그램의 모집 모듈 인스턴스에만 연결할 수 있습니다.';
  end if;

  -- 수정 대상 폼이 이 프로그램 소속인지 확인.
  if v_id is not null and not exists (
    select 1 from public.application_forms where id = v_id and program_id = p_program_id
  ) then
    raise exception '수정할 신청서를 찾을 수 없습니다.';
  end if;

  -- 폼 upsert(생성/수정). 공개 토큰은 최초 생성 시 1회만 부여하고 이후 고정.
  if v_id is null then
    v_token := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
    insert into public.application_forms
      (program_id, program_module_id, title, status, public_token, public_status, landing, open_at, close_at)
    values (
      p_program_id, p_program_module_id, coalesce(v_title, '모집 신청서'),
      'DRAFT', v_token, v_status, coalesce(p_landing, '{}'::jsonb), p_open_at, p_close_at
    )
    returning id, public_token into v_id, v_token;
  else
    update public.application_forms set
      program_module_id = coalesce(p_program_module_id, program_module_id),
      title             = coalesce(v_title, title),
      public_status     = v_status,
      landing           = coalesce(p_landing, landing),
      open_at           = p_open_at,
      close_at          = p_close_at,
      -- 토큰 미보유(레거시 폼) 최초 공개 시에만 부여.
      public_token      = coalesce(public_token,
                            replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '')),
      updated_at        = now()
    where id = v_id
    returning public_token into v_token;
  end if;

  -- 필드 reconcile: p_fields가 배열일 때만 수행(NULL이면 필드 미변경).
  --   넘어온 항목은 id 기준 갱신/삽입, 목록에 없는 기존 필드는 삭제.
  if p_fields is not null and jsonb_typeof(p_fields) = 'array' then
    v_keep_ids := '{}'::uuid[];
    for v_field in select * from jsonb_array_elements(p_fields) loop
      v_fid := nullif(v_field->>'id', '')::uuid;
      if v_fid is null then
        insert into public.application_form_fields
          (form_id, field_type, label, is_required, options, file_constraints, sort_order)
        values (
          v_id,
          coalesce(v_field->>'field_type', 'text'),
          coalesce(v_field->>'label', ''),
          coalesce((v_field->>'is_required')::boolean, false),
          coalesce(v_field->'options', '[]'::jsonb),
          coalesce(v_field->'file_constraints', '{}'::jsonb),
          coalesce((v_field->>'sort_order')::integer, 0)
        )
        returning id into v_fid;
      else
        update public.application_form_fields set
          field_type       = coalesce(v_field->>'field_type', field_type),
          label            = coalesce(v_field->>'label', label),
          is_required      = coalesce((v_field->>'is_required')::boolean, is_required),
          options          = coalesce(v_field->'options', options),
          file_constraints = coalesce(v_field->'file_constraints', file_constraints),
          sort_order       = coalesce((v_field->>'sort_order')::integer, sort_order)
        where id = v_fid and form_id = v_id;
      end if;
      v_keep_ids := array_append(v_keep_ids, v_fid);
    end loop;

    -- 제거된 필드 삭제. 단, 이미 응답(application_answers)이 달린 필드는 삭제 거부.
    if exists (
      select 1 from public.application_form_fields f
      where f.form_id = v_id
        and not (f.id = any(v_keep_ids))
        and exists (select 1 from public.application_answers a where a.field_id = f.id)
    ) then
      raise exception '이미 접수된 응답이 있는 필드는 삭제할 수 없습니다. (해당 필드를 유지하세요)';
    end if;

    delete from public.application_form_fields f
    where f.form_id = v_id and not (f.id = any(v_keep_ids));
  end if;

  return jsonb_build_object('id', v_id, 'public_token', v_token);
end;
$$;

grant execute on function
  public.set_application_form(uuid, uuid, uuid, text, text, jsonb, jsonb, timestamptz, timestamptz)
  to authenticated;

comment on function
  public.set_application_form(uuid, uuid, uuid, text, text, jsonb, jsonb, timestamptz, timestamptz) is
  'AC 모집 신청서 생성/수정(원자): 랜딩·공개상태·공개기간(open_at/close_at) + 필드 id기준 upsert. 응답 존재 필드 삭제 거부, 공개 토큰 최초 1회 고정.';
