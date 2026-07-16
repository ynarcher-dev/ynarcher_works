-- =====================================================================
-- [AC] 모집/신청서 커스터마이즈 토대: 인스턴스 연결 + 공개 URL 토큰 + 랜딩 콘텐츠 + 동의
-- 근거 기획: docs/docs_planning/3_4_3_ac_recruitment.md (프로젝트별 신청 항목·제출 서류 커스터마이즈)
-- 보안 게이트: docs/docs_dev/11_migration_security_gate.md
--   소유 ws=ac / 등급=Personal(신청자 개인정보 수집) / scope=program
--   접근: 내부 운영자(작성·조회) — 외부 신청자의 공개 제출은 후속 Edge Function(service_role)로 중개.
--   - application_forms / application_submissions: 컬럼 추가만. 기존 program 스코프 RLS
--     (20260705150500_ac_rls.sql)가 그대로 커버(신규 테이블 없음 → 신규 RLS 불필요).
--   - set_application_form(SECURITY DEFINER 신규): 자체 인가(admin 또는 ac 쓰기+program 접근),
--     search_path 고정(app, public), authenticated 한정. 필드는 id 기준 upsert하며
--     응답이 존재하는 필드의 삭제는 거부(참조 무결성 보존). 공개 토큰은 최초 1회 생성 후 고정.
--   - 공개 토큰/공개 상태는 컬럼만 준비하며, 실제 익명 조회·제출 경로(anon)는 이 마이그레이션에
--     포함하지 않는다 → 토큰 컬럼 존재만으로 외부 노출되지 않음(RLS는 여전히 내부 전용).
-- 배포 주의: 기존 프론트 RecruitmentPanel은 신규 컬럼을 사용하지 않으므로 프론트 선/후 배포 무관.
-- =====================================================================

-- (1) application_forms 확장 -------------------------------------------------
alter table public.application_forms
  -- 모집 모듈 인스턴스와 1:1 연결(프로그램 내 다중 모집 인스턴스가 각자 다른 신청서를 가짐).
  add column if not exists program_module_id uuid references public.program_modules(id) on delete cascade,
  -- 배포 URL 토큰(/apply/:token). 추측 불가능한 랜덤. 최초 생성 후 고정.
  add column if not exists public_token text,
  -- 공개 상태: PRIVATE(비공개) | OPEN(공개 모집중) | CLOSED(마감).
  add column if not exists public_status text not null default 'PRIVATE',
  -- 랜딩 콘텐츠 전체(포스터 경로/랜딩 제목/모집 개요/일정/지원 대상/제출서류 안내/
  --   개인정보 수집·이용 동의 문구/문의처). 텍스트 위주라 컬럼 남발 대신 jsonb 단일 보관.
  add column if not exists landing jsonb not null default '{}'::jsonb;

do $$ begin
  alter table public.application_forms
    add constraint application_forms_public_status_check
    check (public_status in ('PRIVATE', 'OPEN', 'CLOSED'));
exception when duplicate_object then null; end $$;

-- 토큰 유일성 + 모듈 인스턴스당 신청서 1개(부분 유니크; NULL 다수 허용).
create unique index if not exists uq_application_forms_public_token
  on public.application_forms (public_token) where public_token is not null;
create unique index if not exists uq_application_forms_module
  on public.application_forms (program_module_id) where program_module_id is not null;
create index if not exists idx_application_forms_program
  on public.application_forms (program_id);

comment on column public.application_forms.program_module_id is
  '모집 모듈 인스턴스(program_modules.id, module_type=RECRUITMENT)와 1:1 연결. NULL이면 프로그램 직속 레거시 폼.';
comment on column public.application_forms.public_token is
  '배포 URL(/apply/:token) 토큰. 최초 생성 후 고정, 추측 불가능한 랜덤.';
comment on column public.application_forms.landing is
  '랜딩 콘텐츠(poster_path/landing_title/overview/schedule/target/doc_guide/privacy_consent_text/contact).';

-- (2) application_submissions 확장 ------------------------------------------
alter table public.application_submissions
  -- 개인정보 수집·이용 동의 시각(동의 없이는 제출 불가 → NULL이면 미동의).
  add column if not exists consented_at timestamptz,
  -- 접수 경로: INTERNAL(내부 대리 입력) | PUBLIC(공개 링크 신청).
  add column if not exists source text not null default 'INTERNAL',
  -- 공개 신청자 스냅샷(기업명/담당자/연락처/이메일 등 — 마스터 확정 전 임시 보관, 목록 마스킹 대상).
  add column if not exists applicant_meta jsonb;

do $$ begin
  alter table public.application_submissions
    add constraint application_submissions_source_check
    check (source in ('INTERNAL', 'PUBLIC'));
exception when duplicate_object then null; end $$;

comment on column public.application_submissions.consented_at is
  '개인정보 수집·이용 동의 시각. NULL=미동의(공개 제출 시 필수).';
comment on column public.application_submissions.applicant_meta is
  '공개 신청자 연락 스냅샷(개인정보). 목록 노출 시 마스킹 의무.';

-- (3) 신청서 폼 빌더 RPC(내부) ----------------------------------------------
--     폼 1건(랜딩/공개상태) + 필드 목록을 원자적으로 반영하고 {id, public_token}을 반환.
--     p_form_id NULL이면 신규 생성. 필드는 id 기준 upsert(응답 존재 필드 삭제는 거부).
create or replace function public.set_application_form(
  p_program_id        uuid,
  p_program_module_id uuid,
  p_form_id           uuid,
  p_title             text,
  p_public_status     text,
  p_landing           jsonb,
  p_fields            jsonb  -- [{id?, field_type, label, is_required, options, file_constraints, sort_order}]
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
      (program_id, program_module_id, title, status, public_token, public_status, landing)
    values (
      p_program_id, p_program_module_id, coalesce(v_title, '모집 신청서'),
      'DRAFT', v_token, v_status, coalesce(p_landing, '{}'::jsonb)
    )
    returning id, public_token into v_id, v_token;
  else
    update public.application_forms set
      program_module_id = coalesce(p_program_module_id, program_module_id),
      title             = coalesce(v_title, title),
      public_status     = v_status,
      landing           = coalesce(p_landing, landing),
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

grant execute on function public.set_application_form(uuid, uuid, uuid, text, text, jsonb, jsonb) to authenticated;

comment on function public.set_application_form(uuid, uuid, uuid, text, text, jsonb, jsonb) is
  'AC 모집 신청서 생성/수정(원자): 랜딩·공개상태 + 필드 id기준 upsert. 응답 존재 필드 삭제 거부, 공개 토큰 최초 1회 고정.';
