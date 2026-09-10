-- =====================================================================
-- 전자결재 반려·보완 분리와 이어서 결재
--
-- 결정
--   · 반려는 종결이다. 기안자에게 수정·재상신 경로를 열지 않는다.
--   · 보완 요청은 현재 자리에서 문서를 멈추고 기안자에게 본문 수정을 연다.
--   · 재상신하면 이미 승인된 도장은 유지하고, 보완 요청 자리와 아직 처리하지
--     않은 자리만 다음 회차에 PENDING으로 세워 결재를 이어간다.
--   · 예전의 '돌아갈 순번/기안자 경유/합의 초기화' 입력은 폐기한다. 과거 행의
--     컬럼은 감사 이력을 위해 남기되 새 처리 경로에서는 쓰지 않는다.
--   · approval_lines에는 (문서, 사람) UNIQUE가 없으므로 같은 사람이 여러 자리에
--     서는 구조를 그대로 지원한다. 서버 차례 판정은 사람 아닌 step_order를 본다.
--
-- 보안 게이트 자기점검(docs/docs_dev/11_migration_security_gate.md)
--   · 소유 워크스페이스: office. 데이터 등급: Internal.
--   · 접근 주체: 내부 사용자. Scope: 현재 결재선의 본인 행 / 기안자 본인.
--   · 신규 테이블·정책·DELETE·Storage 없음. 기존 RLS 경계는 변경하지 않는다.
--   · SECURITY DEFINER RPC는 문서 상태 UPDATE와 회차 INSERT를 한 트랜잭션으로
--     묶기 위해 필요하다. search_path를 app, public으로 고정하고 함수 첫머리에서
--     current_app_user_id, 담당 행, 현재 회차, 현재 차례, 문서 상태를 모두 검증한다.
--   · public 실행권은 회수하고 authenticated에만 부여한다. 내부 복제 헬퍼는
--     authenticated에 grant하지 않는다.
--   · 개인정보·다운로드·Export·권한 변경이 아니므로 감사 로그 대상 아님.
-- =====================================================================

comment on column public.approval_lines.return_to_step is
  '2026-09-10 이전 되돌림 이력. 새 처리에서는 사용하지 않으며 과거 결재 사실 보존을 위해 유지한다.';
comment on column public.approval_lines.return_via_drafter is
  '2026-09-10 이전 기안자 경유 이력. 반려·보완 분리 후 새 처리에서는 사용하지 않는다.';
comment on column public.approval_lines.return_reset_agreement is
  '2026-09-10 이전 합의 재요청 이력. 보완 재상신은 모든 미처리 자리만 이어가므로 사용하지 않는다.';

-- 예전 되돌림 동작을 호출할 수 있는 6인자 RPC부터 닫는다. 같은 이름의 3인자 RPC만
-- 다시 열어 클라이언트가 돌아갈 순번을 주장할 입력면 자체를 없앤다.
drop function if exists public.decide_approval_document(
  uuid, public.approval_decision, text, integer, boolean, boolean
);
drop function if exists app.clone_approval_round(
  uuid, public.approval_line_kind, integer, boolean
);

-- 보완을 마친 뒤 새 회차에는 아직 판단이 끝나지 않은 자리만 세운다. 승인·반려 도장은
-- 복제하지 않으므로 과거 행이 업무 사실로 남고, 같은 사람이 여러 step에 있어도 각 행이
-- 독립적으로 복제된다.
create or replace function app.clone_approval_revision_round(p_document_id uuid)
returns integer
language plpgsql
security definer
set search_path = app, public
as $$
declare
  v_round integer := app.approval_current_round(p_document_id);
  v_next  integer := v_round + 1;
begin
  insert into public.approval_lines
    (document_id, approver_id, step_order, kind, round, decision)
  select l.document_id, l.approver_id, l.step_order, l.kind, v_next,
         'PENDING'::public.approval_decision
    from public.approval_lines l
   where l.document_id = p_document_id
     and l.round = v_round
     and l.decision in ('PENDING', 'REVISION_REQUESTED')
   order by l.kind, l.step_order, l.id;

  if not found then
    raise exception 'no approval lines remain after revision' using errcode = 'P0002';
  end if;

  return v_next;
end;
$$;

comment on function app.clone_approval_revision_round is
  '보완 재상신 시 보완 요청 자리와 미처리 자리만 다음 회차로 복제한다. 호출자 검증은 '
  '하지 않으므로 public/authenticated에 열지 않고 검증을 마친 resubmit RPC만 부른다.';

revoke all on function app.clone_approval_revision_round(uuid) from public;

-- 승인·반려·보완 요청을 한 서버 경로에서 처리한다. 결재자가 문서 본문을 UPDATE할
-- 권한은 열지 않고, 함수가 판정 결과에 필요한 status만 옮긴다.
create or replace function public.decide_approval_document(
  p_line_id  uuid,
  p_decision public.approval_decision,
  p_comment  text default null
)
returns void
language plpgsql
security definer
set search_path = app, public
as $$
declare
  v_uid       uuid := app.current_app_user_id();
  v_doc       uuid;
  v_kind      public.approval_line_kind;
  v_step      integer;
  v_round     integer;
  v_line_rnd  integer;
  v_approver  uuid;
  v_current   public.approval_decision;
  v_status    public.approval_status;
  v_remaining integer;
  v_notify    uuid[];
begin
  if v_uid is null then
    raise exception 'unauthenticated' using errcode = '42501';
  end if;
  if p_decision not in ('APPROVED', 'REJECTED', 'REVISION_REQUESTED') then
    raise exception 'unsupported approval decision' using errcode = '22023';
  end if;
  if p_decision <> 'APPROVED' and nullif(btrim(p_comment), '') is null then
    raise exception 'a reason is required for rejection or revision' using errcode = '22023';
  end if;

  select l.document_id, l.kind, l.step_order, l.round, l.approver_id, l.decision, d.status
    into v_doc, v_kind, v_step, v_line_rnd, v_approver, v_current, v_status
    from public.approval_lines l
    join public.approval_documents d on d.id = l.document_id
   where l.id = p_line_id and d.deleted_at is null;

  if not found then
    raise exception 'approval line not found' using errcode = 'P0002';
  end if;
  if v_approver is distinct from v_uid then
    raise exception 'only the assigned approver may decide' using errcode = '42501';
  end if;
  if v_current <> 'PENDING' then
    raise exception 'this line is already decided' using errcode = '42501';
  end if;
  if v_status not in ('PENDING', 'IN_REVIEW') then
    raise exception 'document is not in progress' using errcode = '42501';
  end if;

  v_round := app.approval_current_round(v_doc);
  if v_line_rnd <> v_round then
    raise exception 'this line belongs to an earlier round' using errcode = '42501';
  end if;
  if exists (
    select 1 from public.approval_lines
     where document_id = v_doc and round = v_round
       and decision in ('REJECTED', 'REVISION_REQUESTED')
  ) then
    raise exception 'document has already stopped' using errcode = '42501';
  end if;
  if exists (
    select 1 from public.approval_lines
     where document_id = v_doc and round = v_round and kind = v_kind
       and step_order < v_step and decision = 'PENDING'
  ) then
    raise exception 'it is not your turn yet' using errcode = '42501';
  end if;

  if p_decision = 'APPROVED' then
    update public.approval_lines
       set decision = 'APPROVED', decided_at = now(), comment = nullif(btrim(p_comment), '')
     where id = p_line_id;

    select count(*) into v_remaining
      from public.approval_lines
     where document_id = v_doc and round = v_round and decision = 'PENDING';

    update public.approval_documents
       set status = case when v_remaining = 0 then 'APPROVED'::public.approval_status
                         else 'IN_REVIEW'::public.approval_status end,
           updated_at = now()
     where id = v_doc;
    return;
  end if;

  update public.approval_lines
     set decision = p_decision,
         decided_at = now(),
         comment = nullif(btrim(p_comment), ''),
         return_to_step = null,
         return_via_drafter = null,
         return_reset_agreement = null
   where id = p_line_id;

  update public.approval_documents
     set status = case
                    when p_decision = 'REJECTED'
                      then 'REJECTED'::public.approval_status
                    else 'REVISION_REQUIRED'::public.approval_status
                  end,
         completed_at = case when p_decision = 'REJECTED' then coalesce(completed_at, now())
                             else null end,
         updated_at = now()
   where id = v_doc;

  select array_agg(drafter_id) into v_notify
    from public.approval_documents where id = v_doc and drafter_id is not null;
  perform app.notify_approval(
    v_doc,
    v_notify,
    case when p_decision = 'REJECTED' then 'approval_rejected'
         else 'approval_revision_requested' end,
    v_uid
  );
end;
$$;

comment on function public.decide_approval_document is
  '현재 회차의 자기 차례에서 승인·반려·보완 요청을 처리한다. 반려는 종결하고 보완 요청은 '
  '문서를 REVISION_REQUIRED로 멈춘다. 돌아갈 순번 입력은 받지 않는다.';

revoke all on function public.decide_approval_document(
  uuid, public.approval_decision, text
) from public, anon, service_role;
grant execute on function public.decide_approval_document(
  uuid, public.approval_decision, text
) to authenticated;

-- 기존 3인자 함수의 본문을 교체한다. 이름은 호출 계약을 유지하지만 통과 상태는
-- REJECTED가 아니라 REVISION_REQUIRED뿐이다.
create or replace function public.resubmit_approval_document(
  p_document_id  uuid,
  p_title        text,
  p_field_values jsonb
)
returns void
language plpgsql
security definer
set search_path = app, public
as $$
declare
  v_uid      uuid := app.current_app_user_id();
  v_drafter  uuid;
  v_status   public.approval_status;
  v_round    integer;
  v_next     integer;
  v_carried  boolean;
  v_notify   uuid[];
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
  if v_drafter is distinct from v_uid then
    raise exception 'only the drafter may resubmit this document' using errcode = '42501';
  end if;
  if v_status <> 'REVISION_REQUIRED' then
    raise exception 'only documents awaiting revision may be resubmitted' using errcode = '42501';
  end if;

  v_round := app.approval_current_round(p_document_id);
  if not exists (
    select 1 from public.approval_lines
     where document_id = p_document_id and round = v_round
       and decision = 'REVISION_REQUESTED'
  ) then
    raise exception 'revision request not found' using errcode = 'P0002';
  end if;

  v_next := app.clone_approval_revision_round(p_document_id);

  select exists (
    select 1 from public.approval_lines
     where document_id = p_document_id and round = v_round and decision = 'APPROVED'
  ) into v_carried;

  update public.approval_documents
     set title = coalesce(nullif(btrim(p_title), ''), title),
         field_values = coalesce(p_field_values, field_values),
         status = case when v_carried then 'IN_REVIEW'::public.approval_status
                       else 'PENDING'::public.approval_status end,
         completed_at = null,
         updated_at = now()
   where id = p_document_id;

  -- 새 회차에서 구분별 첫 차례. 같은 사람이 여러 줄의 첫 자리를 맡아도 알림 원장은
  -- app.notify_approval의 distinct가 한 건으로 접는다.
  select array_agg(l.approver_id) into v_notify
    from public.approval_lines l
   where l.document_id = p_document_id and l.round = v_next
     and l.step_order = (
       select min(first_line.step_order)
         from public.approval_lines first_line
        where first_line.document_id = p_document_id
          and first_line.round = v_next and first_line.kind = l.kind
     );
  perform app.notify_approval(p_document_id, v_notify, 'approval_pending', v_uid);

  -- 본문이 바뀌었지만 다시 도장을 받지 않는 앞 순번에게는 승인 유지 사실을 알린다.
  select array_agg(approver_id) into v_notify
    from public.approval_lines
   where document_id = p_document_id and round = v_round and decision = 'APPROVED';
  perform app.notify_approval(p_document_id, v_notify, 'approval_revision_resubmitted', v_uid);
end;
$$;

comment on function public.resubmit_approval_document is
  '보완 요청으로 멈춘 문서를 기안자가 수정 후 재상신한다. 기존 승인은 유지하고 보완 요청 '
  '자리와 미처리 자리만 다음 회차로 복제해 결재를 이어간다.';

revoke all on function public.resubmit_approval_document(uuid, text, jsonb)
  from public, anon, service_role;
grant execute on function public.resubmit_approval_document(uuid, text, jsonb) to authenticated;
