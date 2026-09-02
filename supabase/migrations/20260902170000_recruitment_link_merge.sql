-- =====================================================================
-- 모집 공개 링크를 링크 원장으로 합친다 (3_4_15 §6.5 — 2단계)
--
-- 왜 합치는가
--   공개 주소·공개 상태·공개 기간이 두 곳에 흩어져 있었다: 모집은 application_forms가,
--   나머지 템플릿은 program_module_public_links가 각자 들고 있었다. 그러면 "지금 이 사업에서
--   **바깥에 열려 있는 문이 무엇인가**"를 두 번 물어야 하고, 사업을 닫을 때 한쪽을 빠뜨리면
--   열린 채 남는다. ADMIN 모듈 관리의 상한도 한쪽에만 걸린다.
--
--   실제로 그 증상이 나 있었다 — 지금 운영에 `public_status='OPEN'`인 신청서가 하나 있는데
--   그 모듈은 `enabled=false`다. 옛 경로(`application-form-get`)는 모듈 생존을 보지 않아
--   **담당자가 모듈을 껐는데도 신청서는 바깥에 열려 있다.** 공용 게이트로 옮기면 모듈·사업
--   생존을 함께 보므로 이 구멍이 닫힌다.
--
-- 주소는 바뀌지 않는다
--   토큰 **값을 그대로 옮긴다**. 이미 배포된 `/apply/:token`은 그대로 살아 있고, 그 경로가
--   조회하는 곳만 링크 원장으로 바뀐다. 시스템이 임의로 주소를 바꾸지 않는다는 규칙(3_4_15
--   §6.2)은 이관에도 적용된다.
--
-- 미러를 만들지 않는다
--   application_forms의 public_token/public_status/open_at/close_at은 **동결한다**. 앞으로
--   아무도 쓰지 않으며(컬럼은 남겨 이력 보존), 링크 원장이 유일한 권위다. 두 곳에 같은 값을
--   두고 동기화하면 언젠가 어긋나고, 그때 어느 쪽이 진짜인지 판정할 근거가 없다.
--
-- 근거 기획: docs/docs_planning/3_4_15_ac_public_links.md §6.5,
--            docs/docs_planning/3_4_3_ac_recruitment.md §6.1
--
-- ---------------------------------------------------------------------
-- 보안 게이트 자기점검 (docs/docs_dev/11_migration_security_gate.md)
--   · 소유 ws=ac. 등급 Personal 인접(신청서는 개인정보를 수집하지만, 이 마이그레이션이 옮기는
--     것은 공개 메타(토큰·상태·기간)뿐이며 응답·신청자 정보는 손대지 않는다).
--   · 접근 주체 변화: **좁아진다**. 옛 경로는 모듈·사업 생존을 보지 않았으나 공용 게이트는
--     본다. 넓어지는 방향의 변경이 없다.
--   · 신규 테이블·정책 없음. 기존 SECURITY DEFINER 1종(set_application_form) 재정의 —
--     인가 조건(admin 또는 ac 쓰기 + 사업 접근)은 종전 그대로이며, 여기에 템플릿 상한 검사가
--     더해진다. DEFINER가 RLS를 우회하므로 상한을 함수 안에서 명시적으로 확인한다(정책에
--     기댈 수 없는 자리라 복제가 아니라 유일한 강제 지점이다).
--   · GRANT 변화 없음. 물리 삭제 없음(컬럼도 지우지 않는다).
--   · 파생 효과: 모집 링크가 이제 ADMIN 상한(module_templates.allow_public_link)에 걸린다.
--     RECRUITMENT는 공개 주소가 그 템플릿의 존재 이유이므로 상한을 켠 상태로 옮긴다 —
--     끄면 모집 모듈이 제 일을 못 하며, 끄고 켜는 판단은 ADMIN 모듈 관리에서 언제든 바뀐다.
-- 근거: 20260716170000, 20260716190000(옛 소유자), 20260902130000·140000(링크 원장·상한)
-- =====================================================================

-- ---------------------------------------------------------------------
-- (1) 모집 템플릿의 링크 상한을 켠다
--     공개 주소는 이 템플릿의 부가 기능이 아니라 존재 이유다.
-- ---------------------------------------------------------------------
update public.module_templates
   set allow_public_link = true, updated_at = now()
 where key = 'RECRUITMENT';

-- ---------------------------------------------------------------------
-- (2) 기존 신청서의 공개 메타를 링크 원장으로 이관 — 토큰 값 보존
--     모듈에 연결되지 않은 폼은 가리킬 모듈이 없어 링크를 만들 수 없다(현재 0건).
-- ---------------------------------------------------------------------
insert into public.program_module_public_links
  (entity_key, program_module_id, token, status, open_at, close_at)
select 'program', f.program_module_id, f.public_token,
       coalesce(f.public_status, 'PRIVATE'), f.open_at, f.close_at
  from public.application_forms f
 where f.public_token is not null
   and f.program_module_id is not null
on conflict (entity_key, program_module_id) do nothing;

comment on column public.application_forms.public_token is
  '[동결 2026-09-02] 이관 전 공개 주소 토큰. 권위는 program_module_public_links로 옮겨졌다. 이력 보존용이며 읽지도 쓰지도 않는다.';
comment on column public.application_forms.public_status is
  '[동결 2026-09-02] 이관 전 공개 상태. 권위는 program_module_public_links.status.';
comment on column public.application_forms.open_at is
  '[동결 2026-09-02] 이관 전 공개 시작. 권위는 program_module_public_links.open_at.';
comment on column public.application_forms.close_at is
  '[동결 2026-09-02] 이관 전 공개 마감. 권위는 program_module_public_links.close_at.';

-- ---------------------------------------------------------------------
-- (3) set_application_form — 공개 메타를 링크 원장에 쓴다
--     시그니처는 그대로 둔다. 화면에게는 여전히 '모집 설정 저장' 한 동작이며,
--     어느 원장에 담기는지는 화면이 알 필요가 없다.
-- ---------------------------------------------------------------------
create or replace function public.set_application_form(
  p_program_id        uuid,
  p_program_module_id uuid,
  p_form_id           uuid,
  p_title             text,
  p_public_status     text,
  p_landing           jsonb,
  p_fields            jsonb,
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
  v_module   uuid := p_program_module_id;
  v_keep_ids uuid[];
  v_field    jsonb;
  v_fid      uuid;
begin
  -- 인가: 관리자 또는 (ac 쓰기 + 해당 프로그램 접근권). 종전 그대로 — 모집을 열고 닫는 것은
  -- 사업 담당자의 일이다(ADMIN이 정하는 것은 그 종류가 나갈 수 있는지의 상한뿐이다).
  if not (
    app.is_admin()
    or (app.can_write_workspace('ac') and app.can_access_program(p_program_id))
  ) then
    raise exception '신청서를 변경할 권한이 없습니다.' using errcode = '42501';
  end if;

  if v_status not in ('PRIVATE', 'OPEN', 'CLOSED') then
    raise exception '공개 상태 값이 올바르지 않습니다: %', v_status;
  end if;
  if p_open_at is not null and p_close_at is not null and p_close_at <= p_open_at then
    raise exception '모집 마감 일시는 시작 일시보다 뒤여야 합니다.';
  end if;

  if p_program_module_id is not null and not exists (
    select 1 from public.program_modules pm
    where pm.id = p_program_module_id
      and pm.program_id = p_program_id
      and pm.module_type = 'RECRUITMENT'
  ) then
    raise exception '모집 신청서는 해당 프로그램의 모집 모듈 인스턴스에만 연결할 수 있습니다.';
  end if;

  if v_id is not null and not exists (
    select 1 from public.application_forms where id = v_id and program_id = p_program_id
  ) then
    raise exception '수정할 신청서를 찾을 수 없습니다.';
  end if;

  -- 폼 본문(제목·랜딩)만 저장한다. 공개 메타(토큰·상태·기간)는 더 이상 여기 담기지 않는다.
  if v_id is null then
    insert into public.application_forms
      (program_id, program_module_id, title, status, landing)
    values (p_program_id, p_program_module_id, coalesce(v_title, '모집 신청서'),
            'DRAFT', coalesce(p_landing, '{}'::jsonb))
    returning id into v_id;
  else
    update public.application_forms set
      program_module_id = coalesce(p_program_module_id, program_module_id),
      title             = coalesce(v_title, title),
      landing           = coalesce(p_landing, landing),
      updated_at        = now()
    where id = v_id
    returning program_module_id into v_module;
  end if;

  -- 공개 메타 → 링크 원장. 이 함수는 DEFINER라 RLS가 걸리지 않으므로 템플릿 상한을 여기서
  -- 직접 확인한다. 닫는 방향(PRIVATE)은 상한과 무관하게 허용한다 — 상한이 내려간 뒤에도
  -- 담당자가 자기 손으로 정리할 수 있어야 한다.
  if v_module is not null then
    if v_status <> 'PRIVATE' and not app.module_public_linkable('RECRUITMENT') then
      raise exception '모집 템플릿의 링크 공유가 꺼져 있습니다. ADMIN 모듈 관리에서 켜 주세요.'
        using errcode = '42501';
    end if;
    insert into public.program_module_public_links
      (entity_key, program_module_id, token, status, open_at, close_at, created_by)
    values ('program', v_module, app.new_public_link_token(), v_status,
            p_open_at, p_close_at, app.current_app_user_id())
    on conflict (entity_key, program_module_id) do update set
      -- 토큰은 건드리지 않는다: 이미 배포된 주소가 죽으면 수습할 방법이 없다.
      status     = excluded.status,
      open_at    = excluded.open_at,
      close_at   = excluded.close_at,
      updated_at = now()
    returning token into v_token;
  end if;

  -- 필드 reconcile: p_fields가 배열일 때만 수행(NULL이면 필드 미변경).
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

comment on function public.set_application_form(uuid, uuid, uuid, text, text, jsonb, jsonb, timestamptz, timestamptz) is
  '모집 신청서 저장. 폼 본문은 application_forms, 공개 메타(주소·상태·기간)는 program_module_public_links에 담는다(2026-09-02 이관).';
