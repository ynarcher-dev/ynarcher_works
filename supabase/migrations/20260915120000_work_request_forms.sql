-- ---------------------------------------------------------------------
-- 연장근무신청서·휴일근무신청서 양식 시드
--
-- 기획: docs/docs_planning/3_7_3_management_attendance.md
--
-- 세 신청(휴가·연장근무·휴일근무)은 모두 마이오피스 `근태현황`의 전용 화면이 받고, 만들어지는
-- 것은 지금까지와 같은 전자결재 문서입니다. 휴가신청서는 2026-08-26 시드에 이미 있고, 여기서
-- 나머지 둘을 같은 방식으로 세웁니다.
--
-- 재실행 안전: 약칭 기준으로 없을 때만 만들고, 버전 1도 없을 때만 발행합니다
-- (20260826130000_approval_forms_docboxes.sql의 (11) 블록과 같은 규약).
--
-- 시각 두 칸을 TEXT로 두는 이유: 양식 필드 종류에 시각(TIME)이 없습니다. 화면은 `HH:mm`으로만
-- 적고, 신청 시간(분)은 화면이 계산해 `minutes`에 함께 적습니다 — 읽는 쪽마다 다시 계산하면
-- 같은 신청이 자리에 따라 다른 시간으로 읽힙니다.
-- ---------------------------------------------------------------------
do $$
declare
  r      record;
  v_form uuid;
  v_ver  uuid;
begin
  for r in
    select * from (values
      ('연장근무신청서', '연장', '[
        {"key":"work_date","label":"근무일","type":"DATE","required":true},
        {"key":"start_time","label":"연장 시작","type":"TEXT","required":true},
        {"key":"end_time","label":"연장 종료","type":"TEXT","required":true},
        {"key":"minutes","label":"신청 시간(분)","type":"NUMBER"},
        {"key":"reason","label":"사유","type":"TEXT"}
      ]'::jsonb),
      ('휴일근무신청서', '휴일', '[
        {"key":"work_date","label":"근무일","type":"DATE","required":true},
        {"key":"start_time","label":"출근","type":"TEXT","required":true},
        {"key":"end_time","label":"퇴근","type":"TEXT","required":true},
        {"key":"break_minutes","label":"휴게시간(분)","type":"NUMBER"},
        {"key":"minutes","label":"신청 시간(분)","type":"NUMBER"},
        {"key":"reason","label":"사유","type":"TEXT"}
      ]'::jsonb)
    ) as t(name, abbrev, fields)
  loop
    select id into v_form
      from public.approval_forms
     where abbrev = r.abbrev and deleted_at is null;
    if v_form is null then
      insert into public.approval_forms (name, abbrev, sort_order)
      values (r.name, r.abbrev, 0)
      returning id into v_form;
    end if;

    select id into v_ver
      from public.approval_form_versions
     where form_id = v_form and version_no = 1;
    if v_ver is null then
      insert into public.approval_form_versions (form_id, version_no, fields)
      values (v_form, 1, r.fields)
      returning id into v_ver;
    end if;

    update public.approval_forms
       set current_version_id = v_ver
     where id = v_form and current_version_id is null;
  end loop;
end $$;
