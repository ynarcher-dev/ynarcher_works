-- =====================================================================
-- 전자결재 기안 취소 · 기안 삭제
--
-- 배경
--   기안자가 쥔 축은 임시저장 수정과 보완 후 재상신 둘뿐이었다. 한 번 상신한 문서는
--   최종 승인이 나기 전에도 되가져올 길이 없어, 금액 한 자리를 잘못 적은 문서도
--   결재자에게 전화해 보완 요청을 눌러 달라고 부탁해야 했다.
--
-- 규칙 (2026-09-11 사용자 확정)
--   · 기안 취소: 기안자가 최종 승인 전(PENDING·IN_REVIEW·REVISION_REQUIRED) 문서를
--     기안 단계(DRAFT)로 되돌리고 후열 결재를 초기화한다. 사유는 필수다.
--   · 기안 삭제: 기안 단계(DRAFT) 문서는 기안자가 물리 삭제한다.
--
-- 왜 도장을 지우지 않고 회차로 쌓는가
--   decide_approval_document는 이벤트를 적재하지 않으므로 **도장이 유일한 기록**이다.
--   현재 회차를 고쳐 쓰면 "2번이 1차에서 승인했다"는 사실이 흔적 없이 사라진다. 그래서
--   초기화는 전 결재선을 다음 회차 PENDING으로 복제하는 방식으로 한다 — 최종 승인
--   초기화(20260910170314)가 이미 같은 모양이고, 그 인라인 복제를 이 파일에서 공용
--   헬퍼로 꺼내 둘이 함께 쓴다(같은 규칙을 두 곳에 적으면 어긋나는 날 어느 쪽이
--   진짜인지 판정할 근거가 없다).
--
--   이어서 수정·재상신하면 2차가 처음 사람부터 돈다. **이미 받은 승인을 이어받지
--   않는 것이 보완과 갈리는 지점이다** — 보완은 결재자가 "이 부분만 고쳐 오라"고
--   멈춘 것이라 앞사람의 판단이 그대로 유효하지만, 기안 취소는 기안자가 내용을 고치려고
--   되가져온 것이라 앞사람이 승인한 그 문서가 아니게 된다.
--
-- 왜 물리 삭제인가 (물리 삭제 금지 원칙의 세 번째 예외)
--   예외 기준은 하나다 — 지워지는 것이 업무 기록이 아니라 **담당자가 만든 그릇인가**.
--   기안 단계 문서는 아직 조직에 내보내지 않은 기안자 자신의 그릇이고, 잘못 만든
--   그릇은 '껐다'가 아니라 '없다'여야 임시저장함이 사실을 말한다(운영 모듈 인스턴스·
--   게스트 명부 행과 같은 판단). 취소된 문서도 같은 칸으로 돌아오므로 같은 규칙을 받는다.
--
--   함께 사라지는 것과 남는 것을 가르는 기준은 **스토리지 실물이 있는가**다. 첨부와
--   의견은 소프트 삭제로 남긴다 — attachments에는 DELETE 정책이 없고(20260723236000)
--   버킷에도 DELETE 정책이 없어 SQL로 실물을 지울 수 없으므로, 행을 지우면 아무도
--   찾을 수 없는 파일만 남는다. 문서가 사라지면 그 행을 세우는 화면도 없다.
--   이벤트와 알림은 지운다 — 이벤트는 FK가 cascade가 아니라 삭제를 막기도 하고,
--   둘 다 가리킬 문서가 없으면 열 수 없는 줄로 남는다.
--
-- 겸해서 닫는 구멍
--   approval_docs_update는 기안자에게 자기 문서의 UPDATE를 상시로 열어 두어, PostgREST로
--   deleted_at을 직접 쏘면 **최종 승인된 문서까지** 목록에서 사라졌다(그 경로를 쓰는
--   화면은 없었지만 정책이 허용하는 것이 곧 경계다). 'DRAFT만, RPC로만'을 세우는 김에
--   소프트 삭제 경로를 WITH CHECK로 막는다 — 막지 않으면 새 규칙이 화면 장식이 된다.
--
-- 보안 게이트 자기점검 (docs/docs_dev/11_migration_security_gate.md)
--   · 소유 워크스페이스: management(전자결재 원장과 동일). 데이터 등급: Internal.
--   · 접근 주체: 내부 사용자. Scope: self — 두 RPC 모두 drafter_id = 호출자.
--   · 신규 테이블 없음 → 신규 RLS 정책 없음. DELETE 정책도 만들지 않는다 — 문서 원장에
--     DELETE를 열면 기안자가 PostgREST로 직접 쏘아 상태 검사·감사 적재를 건너뛴다.
--     유일한 경로는 자체 인가하는 DEFINER RPC다.
--   · SECURITY DEFINER 신규 3종. 사유: (a) 결재선·문서·이벤트·알림을 한 트랜잭션에서
--     갱신해야 하고, (b) 이벤트·감사 원장에는 INSERT 정책이 없으며, (c) 문서 원장에
--     DELETE 정책을 여는 대신 경로를 여기로 좁힌다. 셋 다 search_path 고정 +
--     함수 첫머리 인가 검사 + authenticated 한정 GRANT.
--   · 권한 복제 위험: 재현하는 정책은 approval_docs_update의
--     `drafter_id = current_app_user_id()` 한 줄뿐이고 거기에 상태 조건을 더 좁게 건다.
--     워크스페이스 쓰기 권한자에게는 열지 않는다(save_approval_draft와 같은 판단) —
--     남의 기안을 대신 취소하거나 지울 이유가 없다.
--   · 감사 로그: 기안 삭제는 되돌릴 수 없어 audit_logs에 적재한다(도장 이력 전체를
--     before_data 스냅샷으로 남긴다). 기안 취소는 문서 이벤트 원장에 적재한다.
--   · 운영 영향: save_approval_draft가 결재선을 '통째로'에서 '현재 회차만' 교체로
--     바뀐다. 한 번도 상신하지 않은 문서는 회차가 1이라 동작이 같다.
--   · 시드·더미 데이터 없음. 개인정보 원본 조회·Export 없음.
-- =====================================================================

-- ---------------------------------------------------------------------
-- (1) 현재 회차 전체를 다음 회차 PENDING으로 복제 — 기안 취소와 최종 승인 초기화의 공용부.
--     호출자 검증을 하지 않으므로 authenticated에 열지 않는다.
-- ---------------------------------------------------------------------
create or replace function app.clone_approval_full_round(p_document_id uuid)
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
   order by l.kind, l.step_order, l.id;

  if not found then
    raise exception 'approval lines not found' using errcode = 'P0002';
  end if;

  return v_next;
end;
$$;

comment on function app.clone_approval_full_round is
  '현재 회차 결재선 전체를 다음 회차 PENDING으로 복제한다(도장은 지우지 않고 회차로 쌓는다). '
  '보완 복제(clone_approval_revision_round)와 달리 이미 처리된 자리까지 복제해 처음부터 다시 '
  '받는다. 호출자 검증은 하지 않으므로 검증을 마친 RPC만 부른다.';

revoke all on function app.clone_approval_full_round(uuid) from public;

-- ---------------------------------------------------------------------
-- (2) 기안 취소 — 최종 승인 전 문서를 기안 단계로 되돌리고 후열 결재를 초기화한다.
-- ---------------------------------------------------------------------
create or replace function public.withdraw_approval_document(
  p_document_id uuid,
  p_reason      text
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
  v_round   integer;
  v_next    integer;
  v_notify  uuid[];
begin
  if v_uid is null then
    raise exception 'unauthenticated' using errcode = '42501';
  end if;
  -- 사유는 필수다 — 결재선에 선 사람들에게 알림이 가고, 그들이 왜 자기 도장이 무효가
  -- 됐는지 알아야 한다(반려·보완 요청이 사유를 필수로 받는 것과 같은 근거).
  if nullif(btrim(p_reason), '') is null then
    raise exception 'a reason is required to withdraw a document' using errcode = '22023';
  end if;

  select drafter_id, status into v_drafter, v_status
    from public.approval_documents
   where id = p_document_id and deleted_at is null
   for update;

  if not found then
    raise exception 'document not found' using errcode = 'P0002';
  end if;
  if v_drafter is distinct from v_uid then
    raise exception 'only the drafter may withdraw this document' using errcode = '42501';
  end if;
  -- 최종 승인·반려된 문서는 끝난 문서다. 끝난 결재를 되돌리는 축은 여기가 아니라
  -- 최종 승인자의 결재 초기화(recall_approval_decision)가 갖는다.
  if v_status not in ('PENDING', 'IN_REVIEW', 'REVISION_REQUIRED') then
    raise exception 'only a document in progress may be withdrawn' using errcode = '42501';
  end if;
  -- 이관 문서(하이웍스 복원본)는 결재선이 approval_lines가 아니라 참여자 원장에 있어
  -- 복제할 것이 없다. 막지 않으면 '결재선이 없다'는 엉뚱한 오류로 죽는다.
  if exists (
    select 1 from public.approval_legacy_documents where document_id = p_document_id
  ) then
    raise exception 'an imported document may not be withdrawn' using errcode = '42501';
  end if;

  v_round := app.approval_current_round(p_document_id);

  -- 알릴 사람은 상태를 바꾸기 전에 모은다(현재 회차에 세워진 결재자 + 참조자).
  -- 참조자를 빼지 않는 이유는 그들에게 '확인'이 할 일로 떠 있기 때문이다.
  select array_agg(distinct t.uid) into v_notify
    from (
      select l.approver_id as uid
        from public.approval_lines l
       where l.document_id = p_document_id
         and l.round = v_round
         and l.approver_id is not null
      union
      select r.user_id
        from public.approval_recipients r
       where r.document_id = p_document_id
    ) t;

  v_next := app.clone_approval_full_round(p_document_id);

  update public.approval_documents
     set status = 'DRAFT'::public.approval_status,
         completed_at = null,
         updated_at = now()
   where id = p_document_id;

  insert into public.approval_document_events (
    document_id, source_system, event_type, actor_user_id,
    comment_snapshot, occurred_at, source_payload
  ) values (
    p_document_id, 'NATIVE', 'DRAFT_WITHDRAWN', v_uid,
    btrim(p_reason), now(),
    jsonb_build_object('previous_round', v_round, 'next_round', v_next)
  );

  perform app.notify_approval(p_document_id, v_notify, 'approval_draft_withdrawn', v_uid);
end;
$$;

comment on function public.withdraw_approval_document(uuid, text) is
  '기안 취소 — 기안자가 최종 승인 전 문서를 기안 단계(DRAFT)로 되돌린다. 지난 회차 도장은 '
  '이력으로 보존하고 전 결재선을 다음 회차 PENDING으로 복제하므로, 재상신하면 처음 사람부터 '
  '다시 받는다. 사유 필수.';

revoke all on function public.withdraw_approval_document(uuid, text)
  from public, anon, service_role;
grant execute on function public.withdraw_approval_document(uuid, text) to authenticated;

-- ---------------------------------------------------------------------
-- (3) 기안 삭제 — 기안 단계 문서의 물리 삭제(기안자 전용).
-- ---------------------------------------------------------------------
create or replace function public.delete_approval_document(p_document_id uuid)
returns void
language plpgsql
security definer
set search_path = app, public
as $$
declare
  v_uid     uuid := app.current_app_user_id();
  v_drafter uuid;
  v_status  public.approval_status;
  v_title   text;
  v_doc_no  text;
  v_round   integer;
begin
  if v_uid is null then
    raise exception 'unauthenticated' using errcode = '42501';
  end if;

  select drafter_id, status, title, doc_no
    into v_drafter, v_status, v_title, v_doc_no
    from public.approval_documents
   where id = p_document_id and deleted_at is null
   for update;

  if not found then
    raise exception 'document not found' using errcode = 'P0002';
  end if;
  if v_drafter is distinct from v_uid then
    raise exception 'only the drafter may delete this document' using errcode = '42501';
  end if;
  -- 기안 단계만. 흐르는 중인 문서를 지우려면 먼저 기안 취소로 되가져와야 하고, 그 취소
  -- 사실은 결재선에 선 사람들에게 알림으로 간다 — 지우는 일이 알림을 건너뛰지 못한다.
  if v_status <> 'DRAFT' then
    raise exception 'only a draft may be deleted' using errcode = '42501';
  end if;
  -- 이관 문서는 그때의 기록이라 지우지 않는다(하이웍스 복원본).
  if exists (
    select 1 from public.approval_legacy_documents where document_id = p_document_id
  ) then
    raise exception 'an imported document may not be deleted' using errcode = '42501';
  end if;
  -- 이 문서를 근거 품의로 가리키는 지출·변경 문서가 있으면 지울 수 없다(FK도 막지만,
  -- 오류 문구로 이유를 말하기 위해 먼저 본다).
  if exists (
    select 1 from public.approval_documents
     where budget_document_id = p_document_id and deleted_at is null
  ) then
    raise exception 'another document refers to this one as its budget source'
      using errcode = '23503';
  end if;
  if exists (
    select 1 from public.approval_legacy_document_links
     where resolved_document_id = p_document_id
  ) then
    raise exception 'a legacy link resolves to this document' using errcode = '23503';
  end if;

  v_round := app.approval_current_round(p_document_id);

  -- 되돌릴 수 없으므로 지우기 전에 스냅샷을 남긴다. 도장 이력을 통째로 담는 이유는
  -- 취소된 문서에는 결재자의 판단이 실려 있었고, 지우고 나면 그것을 되짚을 곳이
  -- 이 한 줄뿐이기 때문이다.
  insert into public.audit_logs (actor_user_id, action, changed_workspace, before_data, reason)
  values (
    v_uid, 'APPROVAL_DRAFT_DELETE', 'management',
    jsonb_build_object(
      'document_id', p_document_id,
      'title', v_title,
      'doc_no', v_doc_no,
      'rounds', v_round,
      'lines', (
        select jsonb_agg(
                 jsonb_build_object(
                   'approver_id', l.approver_id, 'kind', l.kind, 'step_order', l.step_order,
                   'round', l.round, 'decision', l.decision, 'decided_at', l.decided_at,
                   'comment', l.comment
                 ) order by l.round, l.kind, l.step_order
               )
          from public.approval_lines l where l.document_id = p_document_id
      ),
      'event_count', (
        select count(*) from public.approval_document_events where document_id = p_document_id
      )
    ),
    '기안 삭제(기안자)'
  );

  -- 첨부·의견은 소프트 삭제로 남긴다 — 스토리지 실물을 SQL에서 지울 수 없어 행만 지우면
  -- 아무도 찾을 수 없는 파일이 남는다. 문서가 사라지면 이 행을 세우는 화면도 없다.
  update public.attachments
     set deleted_at = now()
   where target_type = 'approval'
     and target_id = p_document_id
     and deleted_at is null;
  update public.entity_feedback
     set deleted_at = now()
   where target_type = 'approval'
     and target_id = p_document_id
     and deleted_at is null;

  -- 이벤트는 FK가 cascade가 아니라 삭제를 막는다. 문서가 없으면 가리킬 대상도 없다.
  delete from public.approval_document_events where document_id = p_document_id;
  -- 열 수 없는 알림을 받은함에 남기지 않는다(결재 알림과 의견 멘션 알림 둘 다).
  delete from public.notifications
   where target_type = 'approval' and target_id = p_document_id;

  -- 결재선·참조자·확인·상호참조·사업연동·예산변경은 FK cascade가 함께 거둔다.
  delete from public.approval_documents where id = p_document_id;
end;
$$;

comment on function public.delete_approval_document(uuid) is
  '기안 삭제 — 기안 단계(DRAFT) 문서를 기안자가 물리 삭제한다. 첨부·의견은 소프트 삭제로 '
  '남기고(스토리지 실물을 SQL에서 지울 수 없다) 이벤트·알림은 함께 지운다. 되돌릴 수 없어 '
  'audit_logs에 도장 이력 스냅샷을 적재한다.';

revoke all on function public.delete_approval_document(uuid)
  from public, anon, service_role;
grant execute on function public.delete_approval_document(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- (4) 임시저장 수정 — 결재선 교체를 '통째로'에서 '현재 회차만'으로 좁힌다.
--
--     종전 근거는 "DRAFT 문서의 결재선에는 아직 결정이 실려 있지 않다"였는데, 기안 취소로
--     돌아온 문서에는 지난 회차 도장이 실려 있어 그 전제가 성립하지 않는다. 통째로 지우면
--     수정하러 들어간 순간 1차 이력이 사라진다.
--
--     시그니처는 10인자(20260911140000의 근거 품의 포함)를 그대로 쓴다. 9인자 옛 시그니처는
--     그때 이미 걷혔으므로 되살리지 않는다 — create or replace로 되살리면 오버로드가 되어
--     어느 쪽이 불리는지 호출 인자에 따라 갈리고, 근거 품의를 지우는 저장이 조용히 무시된다.
-- ---------------------------------------------------------------------
create or replace function public.save_approval_draft(
  p_document_id        uuid,
  p_title              text,
  p_form_id            uuid,
  p_form_version_id    uuid,
  p_field_values       jsonb,
  p_department_id      uuid,
  p_lines              jsonb,   -- [{approver_id, step_order, kind}, ...]
  p_recipient_ids      uuid[],
  p_submit             boolean, -- true면 상신(PENDING), false면 임시저장 유지
  p_budget_document_id uuid default null
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
  v_round   integer;
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
  -- 상신된 문서는 이 경로로 손대지 못한다.
  if v_status <> 'DRAFT' then
    raise exception 'only DRAFT documents may be edited' using errcode = '42501';
  end if;

  update public.approval_documents set
    title              = p_title,
    form_id            = p_form_id,
    form_version_id    = p_form_version_id,
    field_values       = p_field_values,
    department_id      = p_department_id,
    budget_document_id = p_budget_document_id,
    status             = case when p_submit then 'PENDING'::public.approval_status
                              else 'DRAFT'::public.approval_status end,
    updated_at         = now()
  where id = p_document_id;

  -- 현재 회차만 갈아끼운다. 회차는 지우기 전에 읽어야 한다 — 지운 뒤에는 max(round)가
  -- 지난 회차를 가리켜, 새 결재선이 이미 끝난 회차에 섞여 들어간다.
  v_round := app.approval_current_round(p_document_id);
  delete from public.approval_lines
   where document_id = p_document_id and round = v_round;
  insert into public.approval_lines (document_id, approver_id, step_order, kind, round)
  select p_document_id,
         (e ->> 'approver_id')::uuid,
         (e ->> 'step_order')::integer,
         (e ->> 'kind')::public.approval_line_kind,
         v_round
    from jsonb_array_elements(coalesce(p_lines, '[]'::jsonb)) e;

  delete from public.approval_recipients where document_id = p_document_id;
  insert into public.approval_recipients (document_id, user_id, sort_order)
  select p_document_id, u, i - 1
    from unnest(coalesce(p_recipient_ids, '{}'::uuid[])) with ordinality as t(u, i);
end;
$$;

comment on function public.save_approval_draft(
  uuid, text, uuid, uuid, jsonb, uuid, jsonb, uuid[], boolean, uuid
) is
  '임시저장 문서의 값·참조자·근거 품의와 **현재 회차** 결재선을 갈아끼운다. 기안자 본인의 '
  'DRAFT만 통과하며, 기안 취소로 돌아온 문서의 지난 회차 도장은 건드리지 않는다.';

revoke all on function public.save_approval_draft(
  uuid, text, uuid, uuid, jsonb, uuid, jsonb, uuid[], boolean, uuid
) from public, anon, service_role;
grant execute on function public.save_approval_draft(
  uuid, text, uuid, uuid, jsonb, uuid, jsonb, uuid[], boolean, uuid
) to authenticated;


-- ---------------------------------------------------------------------
-- (5) 소프트 삭제 경로 차단 — 기안자·management 쓰기 권한자가 PostgREST로 deleted_at을
--     직접 쏘던 길을 닫는다. 문서를 없애는 유일한 경로는 (3)의 RPC다.
--     USING은 그대로 두어 이미 비활성된 문서의 복구(deleted_at → null)는 막지 않는다.
-- ---------------------------------------------------------------------
drop policy if exists approval_docs_update on public.approval_documents;
create policy approval_docs_update on public.approval_documents for update
  using (app.can_write_workspace('management') or drafter_id = app.current_app_user_id())
  with check (
    (app.can_write_workspace('management') or drafter_id = app.current_app_user_id())
    and deleted_at is null
  );

-- ---------------------------------------------------------------------
-- (6) 최종 승인 초기화가 인라인으로 갖고 있던 '전 결재선 복제'를 (1)의 공용 헬퍼로 돌린다.
--     판정·상태 전이는 한 줄도 바뀌지 않는다 — 같은 규칙이 두 곳에 살지 않게 하는 것이
--     전부다(표를 지울 때 함수 본문을 전수 조사하는 것과 같은 이유: 두 벌은 어긋나는
--     날이 오고, 어긋난 것을 알려 주는 것이 없다).
-- ---------------------------------------------------------------------
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

  -- 최종 승인 취소는 완료 회차를 고쳐 쓰지 않는다. 결재선 전체를 새 회차로 복제해
  -- 과거 도장과 시각은 그대로 남기고 다음 재상신이 처음 사람부터 시작되게 한다.
  v_next_round := app.clone_approval_full_round(v_doc);

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
  '미결 결재가 남은 진행 중 문서에서 본인 승인을 취소한다. 완료 문서는 실제 마지막 승인자가 '
  '전체 결재선을 초기화해 기안자에게 반려한다(복제는 app.clone_approval_full_round 공용).';

revoke all on function public.recall_approval_decision(uuid, text)
  from public, anon, service_role;
grant execute on function public.recall_approval_decision(uuid, text) to authenticated;
