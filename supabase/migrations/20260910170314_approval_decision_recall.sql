-- =====================================================================
-- 전자결재 승인 취소 및 최종 승인 초기화
--
-- 규칙
--   · 진행 중 문서에서는 본인이 승인했고 아직 미결 결재가 남아 있으면 취소할 수 있다.
--     뒤에서 이미 처리된 다른 승인 이력은 보존한다.
--   · 최종 승인으로 완료된 문서는 실제 마지막 승인자만 초기화할 수 있다.
--     완료 회차는 보존하고, 같은 결재선 전체를 다음 회차 PENDING으로 복제한 뒤
--     문서를 반려 상태로 기안자에게 돌려보낸다.
--   · 재상신 시 미리 만든 초기화 회차를 그대로 시작한다. DELETE는 사용하지 않는다.
--
-- 보안 게이트
--   · 소유 워크스페이스: office. 데이터 등급: Internal.
--   · SECURITY DEFINER가 필요한 이유는 일반 결재자가 문서 상태·새 회차·감사 이벤트를
--     한 트랜잭션에서 갱신해야 하기 때문이다.
--   · 호출자는 함수 첫머리에서 현재 사용자, 본인 결재선, 현재 회차, 현재 문서 상태를
--     모두 검증한다. search_path를 고정하고 PUBLIC/anon/service_role 실행권을 회수한다.
--   · 신규 테이블·정책·Storage·개인정보 원본·DELETE 경로는 없다.
-- =====================================================================

create or replace function public.recall_approval_decision(
  p_line_id uuid,
  p_reason  text default null
)
returns text
language plpgsql
security definer
set search_path = app, public
as $$
declare
  v_uid         uuid := app.current_app_user_id();
  v_doc         uuid;
  v_line_round  integer;
  v_round       integer;
  v_approver    uuid;
  v_decision    public.approval_decision;
  v_status      public.approval_status;
  v_latest_line uuid;
  v_next_round  integer;
  v_has_approved boolean;
  v_notify      uuid[];
begin
  if v_uid is null then
    raise exception 'unauthenticated' using errcode = '42501';
  end if;

  select l.document_id, l.round, l.approver_id, l.decision, d.status
    into v_doc, v_line_round, v_approver, v_decision, v_status
    from public.approval_lines l
    join public.approval_documents d on d.id = l.document_id
   where l.id = p_line_id
     and d.deleted_at is null
   for update of l, d;

  if not found then
    raise exception 'approval line not found' using errcode = 'P0002';
  end if;
  if v_approver is distinct from v_uid then
    raise exception 'only the assigned approver may recall a decision' using errcode = '42501';
  end if;
  if v_decision <> 'APPROVED' then
    raise exception 'only an approved decision may be recalled' using errcode = '42501';
  end if;

  v_round := app.approval_current_round(v_doc);
  if v_line_round <> v_round then
    raise exception 'this line belongs to an earlier round' using errcode = '42501';
  end if;

  if v_status in ('PENDING', 'IN_REVIEW') then
    if not exists (
      select 1 from public.approval_lines
       where document_id = v_doc and round = v_round and decision = 'PENDING'
    ) then
      raise exception 'no later decision remains' using errcode = '42501';
    end if;

    update public.approval_lines
       set decision = 'PENDING',
           decided_at = null,
           comment = null
     where id = p_line_id;

    select exists (
      select 1 from public.approval_lines
       where document_id = v_doc and round = v_round and decision = 'APPROVED'
    ) into v_has_approved;

    update public.approval_documents
       set status = case when v_has_approved
                           then 'IN_REVIEW'::public.approval_status
                         else 'PENDING'::public.approval_status
                    end,
           completed_at = null,
           updated_at = now()
     where id = v_doc;

    insert into public.approval_document_events (
      document_id, source_system, event_type, actor_user_id,
      comment_snapshot, occurred_at, source_payload
    ) values (
      v_doc, 'NATIVE', 'APPROVAL_WITHDRAWN', v_uid,
      nullif(btrim(p_reason), ''), now(), jsonb_build_object('line_id', p_line_id, 'round', v_round)
    );

    select array_agg(drafter_id) into v_notify
      from public.approval_documents where id = v_doc and drafter_id is not null;
    perform app.notify_approval(v_doc, v_notify, 'approval_withdrawn', v_uid);
    return 'WITHDRAWN';
  end if;

  if v_status <> 'APPROVED' then
    raise exception 'document is not recallable' using errcode = '42501';
  end if;

  select l.id into v_latest_line
    from public.approval_lines l
   where l.document_id = v_doc
     and l.round = v_round
     and l.decision = 'APPROVED'
   order by l.decided_at desc nulls last, l.id desc
   limit 1;
  if v_latest_line is distinct from p_line_id then
    raise exception 'only the final approver may reset the document' using errcode = '42501';
  end if;

  if nullif(btrim(p_reason), '') is null then
    raise exception 'a reason is required for final approval reset' using errcode = '22023';
  end if;

  -- 최종 승인 취소는 완료 회차를 고쳐 쓰지 않는다. 결재선 전체를 새 회차로 복제해
  -- 과거 도장과 시각은 그대로 남기고 다음 재상신이 처음 사람부터 시작되게 한다.
  v_next_round := v_round + 1;
  insert into public.approval_lines (
    document_id, approver_id, step_order, kind, round, decision
  )
  select l.document_id, l.approver_id, l.step_order, l.kind, v_next_round,
         'PENDING'::public.approval_decision
    from public.approval_lines l
   where l.document_id = v_doc and l.round = v_round
   order by l.kind, l.step_order, l.id;

  if not found then
    raise exception 'approval lines not found' using errcode = 'P0002';
  end if;

  update public.approval_documents
     set status = 'REJECTED'::public.approval_status,
         completed_at = now(),
         updated_at = now()
   where id = v_doc;

  insert into public.approval_document_events (
    document_id, source_system, event_type, actor_user_id,
    comment_snapshot, occurred_at, source_payload
  ) values (
    v_doc, 'NATIVE', 'FINAL_APPROVAL_RESET', v_uid,
    nullif(btrim(p_reason), ''), now(),
    jsonb_build_object('line_id', p_line_id, 'previous_round', v_round, 'next_round', v_next_round)
  );

  select array_agg(drafter_id) into v_notify
    from public.approval_documents where id = v_doc and drafter_id is not null;
  perform app.notify_approval(v_doc, v_notify, 'approval_final_reset', v_uid);
  return 'RESET';
end;
$$;

comment on function public.recall_approval_decision(uuid, text) is
  '미결 결재가 남은 진행 중 문서에서 본인 승인을 취소한다. 최종 승인 완료 뒤면 완료 회차를 보존한 채 전체 결재선을 새 회차로 복제해 기안자에게 반려한다.';

revoke all on function public.recall_approval_decision(uuid, text)
  from public, anon, service_role;
grant execute on function public.recall_approval_decision(uuid, text) to authenticated;

-- 최종 승인 초기화는 새 회차를 이미 만들어 둔다. 이 특수 반려만 REJECTED 상태에서
-- 재상신을 허용하며, 일반 반려 문서는 계속 종결 상태라 재상신할 수 없다.
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
  v_uid         uuid := app.current_app_user_id();
  v_drafter     uuid;
  v_status      public.approval_status;
  v_round       integer;
  v_next        integer;
  v_carried     boolean := false;
  v_final_reset boolean := false;
  v_notify      uuid[];
begin
  if v_uid is null then
    raise exception 'unauthenticated' using errcode = '42501';
  end if;

  select drafter_id, status into v_drafter, v_status
    from public.approval_documents
   where id = p_document_id and deleted_at is null
   for update;

  if not found then
    raise exception 'document not found' using errcode = 'P0002';
  end if;
  if v_drafter is distinct from v_uid then
    raise exception 'only the drafter may resubmit this document' using errcode = '42501';
  end if;

  v_round := app.approval_current_round(p_document_id);
  if v_status = 'REJECTED' then
    select exists (
      select 1
        from public.approval_document_events e
       where e.document_id = p_document_id
         and e.event_type = 'FINAL_APPROVAL_RESET'
         and (e.source_payload ->> 'next_round')::integer = v_round
    ) and exists (
      select 1 from public.approval_lines
       where document_id = p_document_id and round = v_round
    ) and not exists (
      select 1 from public.approval_lines
       where document_id = p_document_id and round = v_round and decision <> 'PENDING'
    ) into v_final_reset;

    if not v_final_reset then
      raise exception 'rejected document is terminal' using errcode = '42501';
    end if;
  elsif v_status <> 'REVISION_REQUIRED' then
    raise exception 'only returned documents may be resubmitted' using errcode = '42501';
  end if;

  if v_final_reset then
    -- recall RPC가 이미 전 결재선을 다음 회차 PENDING으로 만들어 두었다.
    v_next := v_round;
  else
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
  end if;

  update public.approval_documents
     set title = coalesce(nullif(btrim(p_title), ''), title),
         field_values = coalesce(p_field_values, field_values),
         status = case when v_carried then 'IN_REVIEW'::public.approval_status
                       else 'PENDING'::public.approval_status end,
         completed_at = null,
         updated_at = now()
   where id = p_document_id;

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

  if v_final_reset then
    select array_agg(distinct approver_id) into v_notify
      from public.approval_lines
     where document_id = p_document_id and round = v_round - 1 and approver_id is not null;
    perform app.notify_approval(p_document_id, v_notify, 'approval_reset_resubmitted', v_uid);
  else
    select array_agg(approver_id) into v_notify
      from public.approval_lines
     where document_id = p_document_id and round = v_round and decision = 'APPROVED';
    perform app.notify_approval(p_document_id, v_notify, 'approval_revision_resubmitted', v_uid);
  end if;
end;
$$;

comment on function public.resubmit_approval_document(uuid, text, jsonb) is
  '보완 요청 또는 최종 승인 초기화로 돌아온 문서를 기안자가 재상신한다. 최종 승인 초기화는 미리 복제한 전체 PENDING 회차를 처음부터 시작한다.';

revoke all on function public.resubmit_approval_document(uuid, text, jsonb)
  from public, anon, service_role;
grant execute on function public.resubmit_approval_document(uuid, text, jsonb) to authenticated;
