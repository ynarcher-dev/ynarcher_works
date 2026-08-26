-- =====================================================================
-- 임시저장(DRAFT) 문서 수정
-- - 배경: 임시저장은 아직 조직에 내보내지 않은 문서인데 고칠 길이 없었다.
--   상신 전에 제목·양식 값·결재선을 다듬는 것이 임시저장의 존재 이유다.
-- - 문제: 결재선을 바꾸려면 기존 approval_lines / approval_recipients 행을
--   치워야 하는데 두 테이블에는 DELETE 정책이 없다(Default Deny). 그렇다고
--   DELETE 정책을 여는 것은 [11] 보안 게이트가 금지한다("일반 업무 테이블에는
--   DELETE 정책을 만들지 않는다"). 또 soft delete로 바꾸면 결재 진행 판정
--   (isMyTurn/isLastPending)과 집계가 전부 deleted_at을 걸러야 해서, 한 곳만
--   빠뜨려도 이미 뗀 결재자가 살아 있는 것처럼 읽힌다.
-- - 해결: 결재선 교체를 원자적으로 수행하는 RPC 하나만 연다. 삭제 권한을
--   테이블에 상시로 여는 대신, "내가 기안한 DRAFT 문서"라는 단 하나의 조건을
--   함수 안에서 먼저 확인하고 그 트랜잭션에서만 교체가 일어나게 한다.
--
-- 보안 게이트 자기점검(docs/docs_dev/11_migration_security_gate.md)
--   · 소유 워크스페이스: management(전자결재 원장과 동일).
--   · 데이터 등급: Internal. 접근 주체: 내부 사용자(기안자 본인).
--   · Scope: self — 문서의 drafter_id = 호출자, 그리고 status = DRAFT.
--   · 신규 테이블 없음 / DELETE 정책 신설 없음 / 기존 정책 변경 없음.
--   · SECURITY DEFINER 사유: 위 두 테이블에 DELETE 정책을 여는 대신 교체
--     경로를 이 함수로만 좁히기 위함. search_path를 app, public으로 고정하고
--     호출자 권한 확인을 함수 본문 첫머리에서 수행한다(아래 3중 검사).
--   · 권한 복제 위험: 이 함수가 재현하는 정책은 approval_docs_update의
--     `drafter_id = current_app_user_id()` 한 줄뿐이고, 여기에 DRAFT 조건을
--     더 좁게 건다. 워크스페이스 쓰기 권한자(can_write_workspace)에게는 이
--     경로를 열지 않는다 — 남의 임시저장을 대신 고칠 이유가 없다.
--   · GRANT EXECUTE: authenticated 한정, public 회수.
--   · 감사 로그: 해당 없음(개인정보 원본 조회·다운로드·Export·권한 변경 아님).
--   · 운영 영향: 프론트 신규 호출 경로만 추가. 기존 쿼리 영향 없음.
-- =====================================================================

create or replace function public.save_approval_draft(
  p_document_id     uuid,
  p_title           text,
  p_form_id         uuid,
  p_form_version_id uuid,
  p_field_values    jsonb,
  p_department_id   uuid,
  p_lines           jsonb,   -- [{approver_id, step_order, kind}, ...]
  p_recipient_ids   uuid[],
  p_submit          boolean  -- true면 상신(PENDING), false면 임시저장 유지
)
returns void
language plpgsql
security definer
set search_path = app, public
as $$
declare
  v_uid     uuid := app.current_app_user_id();
  v_drafter uuid;
  v_status  public.approval_status;
begin
  if v_uid is null then
    raise exception 'unauthenticated' using errcode = '42501';
  end if;

  select drafter_id, status into v_drafter, v_status
    from public.approval_documents
   where id = p_document_id and deleted_at is null;

  if not found then
    raise exception 'document not found' using errcode = 'P0002';
  end if;
  -- 기안자 본인만. 워크스페이스 쓰기 권한으로는 열지 않는다.
  if v_drafter is distinct from v_uid then
    raise exception 'only the drafter may edit this document' using errcode = '42501';
  end if;
  -- 상신된 문서는 이 경로로 손대지 못한다 — 결재가 돌기 시작한 뒤 결재선을
  -- 갈아끼우면 이미 찍힌 도장이 누구의 것이었는지 판정할 근거가 사라진다.
  if v_status <> 'DRAFT' then
    raise exception 'only DRAFT documents may be edited' using errcode = '42501';
  end if;

  update public.approval_documents set
    title           = p_title,
    form_id         = p_form_id,
    form_version_id = p_form_version_id,
    field_values    = p_field_values,
    department_id   = p_department_id,
    status          = case when p_submit then 'PENDING'::public.approval_status else 'DRAFT'::public.approval_status end,
    updated_at      = now()
  where id = p_document_id;

  -- 결재선·참조자는 통째로 갈아끼운다. DRAFT 문서의 결재선에는 아직 결정이
  -- 실려 있지 않으므로(도장은 상신 이후에만 찍힌다) 지워도 잃는 사실이 없다.
  delete from public.approval_lines where document_id = p_document_id;
  insert into public.approval_lines (document_id, approver_id, step_order, kind)
  select p_document_id,
         (e ->> 'approver_id')::uuid,
         (e ->> 'step_order')::integer,
         (e ->> 'kind')::public.approval_line_kind
    from jsonb_array_elements(coalesce(p_lines, '[]'::jsonb)) e;

  delete from public.approval_recipients where document_id = p_document_id;
  insert into public.approval_recipients (document_id, user_id, sort_order)
  select p_document_id, t.user_id, (t.ord - 1)::integer
    from unnest(coalesce(p_recipient_ids, '{}'::uuid[])) with ordinality as t(user_id, ord);
end;
$$;

comment on function public.save_approval_draft is
  '임시저장 문서 수정/상신. 기안자 본인 + DRAFT 상태에서만 통과하며 결재선·참조자를 '
  '원자적으로 교체한다. 두 자식 테이블에 DELETE 정책을 여는 대신 이 경로만 연다.';

revoke all on function public.save_approval_draft(
  uuid, text, uuid, uuid, jsonb, uuid, jsonb, uuid[], boolean
) from public;
grant execute on function public.save_approval_draft(
  uuid, text, uuid, uuid, jsonb, uuid, jsonb, uuid[], boolean
) to authenticated;
