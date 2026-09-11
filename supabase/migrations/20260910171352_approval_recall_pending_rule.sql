-- 진행 중 문서는 후속 승인이 일부 처리됐더라도 미결 결재가 남아 있으면
-- 현재 회차의 본인 승인을 취소할 수 있다. 완료 문서 초기화는 실제 마지막 승인자만 가능하다.
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
  v_uid          uuid := app.current_app_user_id();
  v_doc          uuid;
  v_line_round   integer;
  v_round        integer;
  v_approver     uuid;
  v_decision     public.approval_decision;
  v_status       public.approval_status;
  v_latest_line  uuid;
  v_next_round   integer;
  v_has_approved boolean;
  v_notify       uuid[];
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
  '미결 결재가 남은 진행 중 문서에서 본인 승인을 취소한다. 완료 문서는 실제 마지막 승인자가 전체 결재선을 초기화해 기안자에게 반려한다.';

revoke all on function public.recall_approval_decision(uuid, text)
  from public, anon, service_role;
grant execute on function public.recall_approval_decision(uuid, text) to authenticated;
