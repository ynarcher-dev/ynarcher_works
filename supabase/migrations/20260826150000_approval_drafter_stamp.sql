-- =====================================================================
-- 전자결재 — 기안자·기안부서 서버 스탬프
-- 선행: 20260826130000_approval_forms_docboxes.sql
--
-- 배경(실제로 막히는 경로)
--   approval_documents 의 INSERT 정책은
--     app.can_write_workspace('management') or drafter_id = app.current_app_user_id()
--   인데, 원장에는 기안자를 채우는 트리거가 없었다. 즉 클라이언트가 drafter_id 를 손으로
--   실어 보내야만 통과하고, 보내지 않으면 management 쓰기 권한이 없는 대다수 임직원은
--   자기 기안조차 저장할 수 없다. 이어지는 결재선·참조자 INSERT(app.is_approval_drafter)와
--   첨부(target_type='approval')도 같은 값에 걸려 함께 막힌다.
--
-- 결정
--   기안자는 클라이언트가 주장하는 값이 아니라 **세션이 말하는 사실**이므로 트리거가 찍는다.
--   같은 이유로 INSERT 시 전달된 drafter_id 는 무시하고 덮어쓴다 — 남의 이름으로 기안한
--   문서를 만들 수 있으면 결재선·열람 경계 전체가 그 값 위에 서 있으므로 위험하다.
--   기안 부서도 비어 있으면 기안자의 현재 소속으로 채운다(부서 문서함의 기준).
--   UPDATE 시에는 기안자를 바꾸지 않는다 — 오등록 정리는 ADMIN '생성자 교체'의 몫이다.
--
-- 보안 게이트 메모(docs/docs_dev/11_migration_security_gate.md)
--   · 소유 워크스페이스: office(사용 화면) / 원장 게이트는 management 유지.
--   · 데이터 등급: Internal. 개인정보 원본·파일·Export 없음.
--   · 접근 주체: 내부 사용자(기안자 본인). 값의 출처가 클라이언트 → 세션으로 좁아지므로
--     권한 표면이 줄어드는 방향의 변경이다.
--   · Scope: self(기안자) · department(기안 부서 파생).
--   · 감사 로그: 해당 없음(다운로드·Export·권한 변경 아님).
--   · RLS: 정책 변경 없음. 기존 SELECT/INSERT/UPDATE 분리와 DELETE 부재를 그대로 둔다.
--   · SECURITY DEFINER: 기존 app.stamp_approval_document() 확장(search_path=app,public 고정
--     유지). 신규 함수·grant 없음.
--   · 시드/더미: 없음.
-- =====================================================================

create or replace function app.stamp_approval_document()
returns trigger
language plpgsql
security definer
set search_path = app, public
as $$
declare
  v_prefix text;
  v_date   text;
  v_seq    integer;
  v_fields jsonb;
  v_amount numeric;
begin
  -- 기안자·기안부서: 생성 시 세션이 정한다(클라이언트 입력을 신뢰하지 않는다).
  if tg_op = 'INSERT' then
    new.drafter_id := coalesce(app.current_app_user_id(), new.drafter_id);
    if new.department_id is null then
      select u.department_id into new.department_id
        from public.users u
       where u.id = new.drafter_id;
    end if;
  end if;

  -- 완료 일시: 종결 상태로 처음 들어올 때 찍는다.
  if new.status in ('APPROVED', 'REJECTED') and new.completed_at is null then
    new.completed_at := now();
  end if;

  -- 대표 금액: 양식 버전이 지정된 문서는 필드 값에서 파생한다.
  if new.form_version_id is not null then
    select fields into v_fields
      from public.approval_form_versions where id = new.form_version_id;
    v_amount := app.approval_primary_amount(v_fields, new.field_values);
    if v_amount is not null then
      new.amount := v_amount;
    end if;
  end if;

  -- 채번: DRAFT를 벗어난 문서에 1회만. 이미 번호가 있으면 불변.
  if new.doc_no is null and new.status <> 'DRAFT' and new.form_id is not null then
    select abbrev into v_prefix
      from public.approval_forms where id = new.form_id;
    if v_prefix is not null then
      v_date := to_char(timezone('Asia/Seoul', now()), 'YYMMDD');
      insert into public.approval_doc_counters as c (prefix, date_key, last_seq)
      values (v_prefix, v_date, 1)
      on conflict (prefix, date_key)
        do update set last_seq = c.last_seq + 1
      returning last_seq into v_seq;
      new.doc_no := v_prefix || '-' || v_date || '-' || lpad(v_seq::text, 4, '0');
    end if;
  end if;

  return new;
end;
$$;

comment on function app.stamp_approval_document() is
  '결재 문서 스탬프(before insert/update): 기안자·기안부서(INSERT 한정, 세션 기준) · 완료 일시 · '
  '대표 금액 파생 · 문서 번호 채번. 기안자는 클라이언트 입력을 덮어쓴다 — 결재선·열람 경계가 '
  '모두 이 값 위에 서 있어 남의 이름으로 기안할 수 있으면 안 된다.';
