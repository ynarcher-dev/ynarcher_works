-- =====================================================================
-- 전자결재 되돌림·재상신 (기획: docs/docs_planning/3_1_3_approval_return_flow.md)
--
-- - 배경: 반려가 문서를 종결시켰다. 기안자 수정 경로(save_approval_draft)는
--   DRAFT에서만 열리고 회수 훅은 어느 화면도 부르지 않아, 오탈자 하나에도
--   양식 값을 손으로 옮겨 새 문서를 써야 했다. 설계 의도가 아니라 미구현이다.
-- - 결정: 반려에 **돌아갈 지점**(내 앞 순번 중 이미 승인한 행)과 **기안자 경유
--   여부** 두 축을 붙인다. 네 조합이 각각 현행 반려·보완 요청·반송·재판단이며,
--   아무것도 지정하지 않으면 지금과 똑같이 동작한다.
-- - 도장은 지우지 않고 **회차(round)**로 쌓는다. "3번이 1차에서 승인했다"는
--   업무 사실이라 물리 삭제 금지 원칙의 대상이며, save_approval_draft가 결재선을
--   통째로 갈아끼우는 것이 정당했던 근거("DRAFT 결재선에는 아직 결정이 실려
--   있지 않다")가 여기서는 성립하지 않는다.
-- - 현재 회차는 max(round) 파생이고 문서에 따로 적지 않는다 — 같은 사실을 두
--   곳에 적으면 트랜잭션이 끊겼을 때 어느 쪽이 진짜인지 답할 근거가 없다.
--
-- 함께 고치는 잠재 결함(같은 경로라 분리할 수 없다):
--   종전 승인·반려는 클라이언트가 approval_lines와 approval_documents를 각각
--   UPDATE했다. 그런데 approval_docs_update 정책은
--   `can_write_workspace('management') or drafter_id = 나`라, **management 쓰기가
--   없는 결재자가 남의 문서를 승인하면 문서 상태 UPDATE가 0행에 걸려 조용히
--   무시된다**(PostgREST는 0행 UPDATE를 오류로 내지 않는다). 결재선에는 도장이
--   찍혔는데 문서는 PENDING에 머무는 어긋남이다. 처리 경로를 RPC 하나로 모아
--   상태 전이를 서버가 책임진다.
--
-- 보안 게이트 자기점검(docs/docs_dev/11_migration_security_gate.md)
--   · 소유 워크스페이스: management(전자결재 원장과 동일). 데이터 등급: Internal.
--   · 접근 주체: 내부 사용자 — 결재 처리는 그 문서의 결재자 본인, 재상신은 기안자 본인.
--   · Scope: self. 신규 테이블 없음 / DELETE 정책 신설 없음 / 기존 정책 변경 없음.
--   · SECURITY DEFINER 사유(3종):
--     - decide_approval_document: 결재자가 approval_documents.status를 옮겨야 하는데
--       그 정책은 기안자·management만 연다. 정책을 넓히면 결재자에게 문서 본문
--       UPDATE까지 열리므로(제목·양식 값·부서가 함께 열린다) 함수 안에서만 status를
--       옮긴다. 회차 복제 INSERT도 결재선 INSERT 정책(기안자·management)을 넘는다.
--     - resubmit_approval_document: 같은 회차 복제 INSERT 때문.
--     - app.clone_approval_round: 위 둘이 공유하는 복제 본체(호출자 검증 없음 —
--       authenticated에 grant하지 않고 app 스키마에 둔다).
--   · 권한 복제 위험: 재현하는 정책은 approval_lines_update의
--     `approver_id = current_app_user_id()` 한 줄이며, 여기에 **더 좁은** 조건을
--     더한다(PENDING · 현재 회차 · 내 차례 · 문서가 진행 중). 재상신은
--     approval_docs_update의 `drafter_id = 나`에 `status = REJECTED`를 더한다.
--     열람 판정(can_read_approval)은 손대지 않는다 — 지난 회차 결재자도 문서를 본다.
--   · search_path = app, public 고정. GRANT EXECUTE: authenticated 한정, public 회수.
--   · 감사 로그: 해당 없음(개인정보 조회·다운로드·Export·권한 변경 아님).
--   · 운영 영향: 기존 행은 전부 round = 1로 백필된다(컬럼 기본값). 프론트가
--     RPC로 갈아타기 전에도 기존 직접 UPDATE 경로는 그대로 동작한다.
-- =====================================================================

-- ---------------------------------------------------------------------
-- (1) 결재선 원장 — 회차와 되돌림 지정
-- ---------------------------------------------------------------------
alter table public.approval_lines
  add column if not exists round                  integer not null default 1,
  add column if not exists return_to_step         integer,
  add column if not exists return_via_drafter     boolean,
  add column if not exists return_reset_agreement boolean;

comment on column public.approval_lines.round is
  '결재 회차. 되돌림·재상신은 기존 행을 지우거나 되돌리지 않고 다시 도는 구간만 '
  '다음 회차로 복제한다. 현재 회차는 max(round) 파생이며 문서에 따로 적지 않는다.';
comment on column public.approval_lines.return_to_step is
  '되돌릴 지점(같은 구분 안의 step_order). null이면 처음부터. 반려 행에만 실린다.';
comment on column public.approval_lines.return_via_drafter is
  '기안자를 거치는가. 참이면 문서가 REJECTED로 기안자에게 돌아가고 재상신 때 회차가 '
  '오른다. 거짓이면 내용을 고치지 않고 그 자리에서 대상 결재자에게 되돌아간다(반송).';
comment on column public.approval_lines.return_reset_agreement is
  '합의·재무합의 줄도 다시 받는가. 되돌린 사람이 고른다 — 무엇이 바뀌었는지는 그가 안다.';

-- 진행 판정 쿼리가 전부 회차로 좁혀지므로 인덱스도 회차를 태운다.
create index if not exists idx_approval_lines_doc_kind_round
  on public.approval_lines (document_id, kind, round, step_order);

-- ---------------------------------------------------------------------
-- (2) 현재 회차
--     DEFINER인 이유: RLS로 걸러진 부분집합에서 max를 내면 사람마다 다른 회차를
--     답한다(결재선 SELECT는 '내 행 또는 문서를 읽을 수 있을 때'라 범위가 갈린다).
--     회차 번호 자체는 문서 내용이 아니므로 노출로 잃는 것이 없다.
-- ---------------------------------------------------------------------
create or replace function app.approval_current_round(target_document_id uuid)
returns integer
language sql
stable
security definer
set search_path = app, public
as $$
  select coalesce(max(round), 1)
    from public.approval_lines
   where document_id = target_document_id;
$$;

comment on function app.approval_current_round is
  '문서의 현재 결재 회차(max(round), 결재선이 없으면 1). 모든 진행 판정의 기준.';

revoke all on function app.approval_current_round(uuid) from public;
grant execute on function app.approval_current_round(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- (3) 회차 복제 — 다시 도는 구간만 다음 회차로 세운다
--
--     새 회차에 서는 행은 셋이다.
--       · 되돌린 구분에서 돌아갈 지점 이후 — 다시 판단해야 하는 자리
--       · 합의 재요청을 골랐다면 다른 구분 전부
--       · 고르지 않았다면 다른 구분 중 **아직 처리하지 않은 행**
--     마지막 줄이 핵심이다. 아직 안 찍은 합의 행을 옮기지 않으면 그 줄은 지난
--     회차에 PENDING으로 남는데, 모든 판정이 현재 회차만 보므로 그 사람은 차례를
--     영영 잃고 문서는 합의 없이 최종 승인에 도달한다.
--
--     돌아갈 지점 앞의 승인 도장은 옮기지 않는다 — 그 자리를 건너뛰겠다는 것이
--     되돌린 사람의 지정이고, 도장은 지난 회차에 그대로 남아 표가 '1차 승인'으로
--     답한다.
-- ---------------------------------------------------------------------
create or replace function app.clone_approval_round(
  p_document_id     uuid,
  p_kind            public.approval_line_kind,
  p_from_step       integer,   -- null이면 그 구분의 처음부터
  p_reset_agreement boolean
)
returns integer
language plpgsql
security definer
set search_path = app, public
as $$
declare
  v_round integer := app.approval_current_round(p_document_id);
  v_from  integer;
begin
  select coalesce(p_from_step, min(step_order)) into v_from
    from public.approval_lines
   where document_id = p_document_id and round = v_round and kind = p_kind;

  insert into public.approval_lines (document_id, approver_id, step_order, kind, round, decision)
  select l.document_id, l.approver_id, l.step_order, l.kind, v_round + 1,
         'PENDING'::public.approval_decision
    from public.approval_lines l
   where l.document_id = p_document_id
     and l.round = v_round
     and (
       (l.kind = p_kind and l.step_order >= coalesce(v_from, l.step_order))
       or (l.kind <> p_kind and coalesce(p_reset_agreement, true))
       or (l.kind <> p_kind and l.decision = 'PENDING')
     );

  return v_round + 1;
end;
$$;

comment on function app.clone_approval_round is
  '다시 도는 결재선 구간을 다음 회차로 복제한다. 되돌린 구분은 지정 지점 이후, 다른 '
  '구분은 재요청을 골랐으면 전부·아니면 아직 처리하지 않은 행만. 호출자 검증은 하지 '
  '않으므로 authenticated에 grant하지 않는다(부르는 두 RPC가 검증을 마친 뒤 부른다).';

revoke all on function app.clone_approval_round(uuid, public.approval_line_kind, integer, boolean)
  from public;

-- ---------------------------------------------------------------------
-- (4) 되돌림 알림
--
--     **건너뛴 결재자에게 보내는 알림은 뺄 수 없다.** 자기 도장이 남은 채 내용이 바뀐
--     문서가 통과하는 유일한 구조이므로 그 사실을 당사자가 알아야 한다. 이의가 있으면
--     그들은 결재선에 있어 문서를 열람할 수 있고 대응은 오프라인으로 한다 — 이의 제기
--     기능은 만들지 않는다(되돌림을 되돌리는 축이 하나 더 생기면 문서가 어느 회차에
--     있는지 아무도 답하지 못한다).
--
--     유형을 넷으로 가르는 이유는 받는 사람이 할 일이 저마다 다르기 때문이다. 본문을
--     읽어 판정하지 않는다(반출 알림과 같은 규칙 — 파싱으로 결과를 알아내는 목록은 값이
--     조금만 바뀌어도 '승인'을 '반려'로 읽는다).
-- ---------------------------------------------------------------------
create or replace function app.notify_approval(
  p_document_id uuid,
  p_recipients  uuid[],
  p_type        text,
  p_actor       uuid
)
returns void
language plpgsql
security definer
set search_path = app, public
as $$
declare
  v_preview   text;
  v_actor_nm  text;
begin
  if p_recipients is null or array_length(p_recipients, 1) is null then
    return;
  end if;

  select left(coalesce(d.doc_no || ' · ', '') || d.title, 120)
    into v_preview
    from public.approval_documents d where d.id = p_document_id;

  select u.name into v_actor_nm from public.users u where u.id = p_actor;

  insert into public.notifications
    (recipient_id, actor_id, actor_name, type, target_type, target_id, ref_type, ref_id, body_preview)
  select distinct r, p_actor, v_actor_nm, p_type, 'approval', p_document_id,
         'approval_documents', p_document_id, v_preview
    from unnest(p_recipients) r
    join public.users u on u.id = r and u.deleted_at is null
   -- 자기 처리를 자기에게 알리지 않는다(반출 알림과 같은 규칙).
   where r is distinct from p_actor;
end;
$$;

comment on function app.notify_approval is
  '결재 알림 팬아웃. 되돌림·재상신 RPC만 부르며 authenticated에는 열지 않는다(알림 원장의 '
  'INSERT 정책은 with check(false)라 DEFINER 경로만 쓴다).';

revoke all on function app.notify_approval(uuid, uuid[], text, uuid) from public;

-- ---------------------------------------------------------------------
-- (5) 결재 처리 — 승인·되돌림 한 경로
-- ---------------------------------------------------------------------
create or replace function public.decide_approval_document(
  p_line_id          uuid,
  p_decision         public.approval_decision,
  p_comment          text    default null,
  p_return_to_step   integer default null,
  p_via_drafter      boolean default true,
  p_reset_agreement  boolean default null
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
  v_decision  public.approval_decision;
  v_status    public.approval_status;
  v_reset     boolean;
  v_remaining integer;
  v_notify    uuid[];
begin
  if v_uid is null then
    raise exception 'unauthenticated' using errcode = '42501';
  end if;
  if p_decision not in ('APPROVED', 'REJECTED') then
    raise exception 'decision must be APPROVED or REJECTED' using errcode = '22023';
  end if;

  select l.document_id, l.kind, l.step_order, l.round, l.approver_id, l.decision, d.status
    into v_doc, v_kind, v_step, v_line_rnd, v_approver, v_decision, v_status
    from public.approval_lines l
    join public.approval_documents d on d.id = l.document_id
   where l.id = p_line_id and d.deleted_at is null;

  if not found then
    raise exception 'approval line not found' using errcode = 'P0002';
  end if;
  -- 재현하는 정책은 approval_lines_update 한 줄이며, 아래로 갈수록 좁아진다.
  if v_approver is distinct from v_uid then
    raise exception 'only the assigned approver may decide' using errcode = '42501';
  end if;
  if v_decision <> 'PENDING' then
    raise exception 'this line is already decided' using errcode = '42501';
  end if;
  if v_status not in ('PENDING', 'IN_REVIEW') then
    raise exception 'document is not in progress' using errcode = '42501';
  end if;

  v_round := app.approval_current_round(v_doc);
  -- 지난 회차의 행으로는 처리할 수 없다. 화면이 현재 회차만 세우는 것은 보안이
  -- 아니므로 서버가 같은 기준을 다시 계산한다.
  if v_line_rnd <> v_round then
    raise exception 'this line belongs to an earlier round' using errcode = '42501';
  end if;
  -- 되돌려진 문서에는 남은 차례가 없다 — 구분이 무엇이든 되돌림 한 건이 흐름을 끊는다.
  if exists (
    select 1 from public.approval_lines
     where document_id = v_doc and round = v_round and decision = 'REJECTED'
  ) then
    raise exception 'document has already been returned' using errcode = '42501';
  end if;
  -- 내 차례인가 — 같은 구분의 앞 순번이 남아 있으면 아직 아니다(줄끼리는 기다리지 않는다).
  if exists (
    select 1 from public.approval_lines
     where document_id = v_doc and round = v_round and kind = v_kind
       and step_order < v_step and decision = 'PENDING'
  ) then
    raise exception 'it is not your turn yet' using errcode = '42501';
  end if;

  ------------------------------------------------------------------ 승인
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

  ---------------------------------------------------------------- 되돌림
  -- 돌아갈 지점은 **같은 구분의 앞 순번 중 이미 승인한 행**뿐이다. 아직 처리하지
  -- 않은 뒤 순번으로는 보낼 수 없다 — 그것은 되돌림이 아니라 건너뛰기다.
  if p_return_to_step is not null then
    if not exists (
      select 1 from public.approval_lines
       where document_id = v_doc and round = v_round and kind = v_kind
         and step_order = p_return_to_step and step_order < v_step
         and decision = 'APPROVED'
    ) then
      raise exception 'invalid return target step' using errcode = '22023';
    end if;
  end if;

  -- 합의 재요청의 기본값은 기안자 경유를 따른다(내용이 바뀌면 다시 받는 편이 안전).
  v_reset := coalesce(p_reset_agreement, coalesce(p_via_drafter, true));

  update public.approval_lines
     set decision               = 'REJECTED',
         decided_at             = now(),
         comment                = nullif(btrim(p_comment), ''),
         return_to_step         = p_return_to_step,
         return_via_drafter     = coalesce(p_via_drafter, true),
         return_reset_agreement = v_reset
   where id = p_line_id;

  if coalesce(p_via_drafter, true) then
    -- 기안자에게 돌아간다. 회차는 여기서 올리지 않는다 — 다시 도는 시점은
    -- 기안자가 고쳐 다시 올릴 때이고, 그 전까지 문서는 아무의 차례도 아니다.
    update public.approval_documents
       set status = 'REJECTED', updated_at = now()
     where id = v_doc;

    -- 건너뛴 사람에게는 지금 알리지 않는다 — 아직 아무 일도 일어나지 않았고, 기안자가
    -- 다시 올리지 않으면 영영 일어나지 않는다. 그 알림은 재상신이 보낸다.
    select array_agg(drafter_id) into v_notify
      from public.approval_documents where id = v_doc and drafter_id is not null;
    perform app.notify_approval(v_doc, v_notify, 'approval_returned', v_uid);
  else
    -- 반송 — 내용이 바뀌지 않으므로 그 자리에서 다음 회차를 세운다.
    perform app.clone_approval_round(v_doc, v_kind, p_return_to_step, v_reset);
    update public.approval_documents
       set status = 'IN_REVIEW', completed_at = null, updated_at = now()
     where id = v_doc;

    -- 되돌아간 자리의 사람에게 알린다. 건너뛴 앞 순번에는 알리지 않는다 — 내용이
    -- 그대로라 그들의 승인이 여전히 같은 문서에 대한 것이기 때문이다.
    select array_agg(approver_id) into v_notify
      from public.approval_lines
     where document_id = v_doc and round = v_round + 1 and kind = v_kind
       and decision = 'PENDING'
       and step_order = (
         select min(step_order) from public.approval_lines
          where document_id = v_doc and round = v_round + 1 and kind = v_kind
       );
    perform app.notify_approval(v_doc, v_notify, 'approval_sent_back', v_uid);
  end if;
end;
$$;

comment on function public.decide_approval_document is
  '결재 처리(승인·되돌림). 그 결재선의 담당자 본인이 현재 회차에서 자기 차례일 때만 '
  '통과한다. 되돌림은 돌아갈 지점(같은 구분의 앞 순번 중 승인한 행)과 기안자 경유 여부를 '
  '받으며, 경유하면 문서가 REJECTED로 기안자에게 가고 아니면 그 자리에서 회차가 오른다.';

revoke all on function public.decide_approval_document(
  uuid, public.approval_decision, text, integer, boolean, boolean
) from public;
grant execute on function public.decide_approval_document(
  uuid, public.approval_decision, text, integer, boolean, boolean
) to authenticated;

-- ---------------------------------------------------------------------
-- (5) 재상신 — 되돌아온 문서를 고쳐 다시 올린다
--
--     결재선은 고치지 못한다. 되돌린 사람이 지정한 재개 지점은 **그 결재선을
--     전제로 한 판단**이라, 기안자가 결재선을 갈아끼우면 "3번부터"가 누구를
--     가리키는지 알 수 없게 된다.
-- ---------------------------------------------------------------------
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
  v_kind     public.approval_line_kind;
  v_from     integer;
  v_reset    boolean;
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
  -- 기안자 본인만. 워크스페이스 쓰기 권한으로는 열지 않는다(남의 문서를 대신
  -- 올릴 이유가 없다 — save_approval_draft와 같은 판단).
  if v_drafter is distinct from v_uid then
    raise exception 'only the drafter may resubmit this document' using errcode = '42501';
  end if;
  if v_status <> 'REJECTED' then
    raise exception 'only returned documents may be resubmitted' using errcode = '42501';
  end if;

  v_round := app.approval_current_round(p_document_id);

  -- 되돌린 행이 재개 지점을 갖고 있다. 두 구분이 거의 동시에 되돌린 드문 경우에는
  -- 먼저 찍힌 도장을 따른다(문서를 멈춘 것이 그 판단이다).
  select kind, return_to_step, coalesce(return_reset_agreement, true)
    into v_kind, v_from, v_reset
    from public.approval_lines
   where document_id = p_document_id and round = v_round and decision = 'REJECTED'
   order by decided_at nulls last, step_order
   limit 1;

  -- 되돌림 도입 전에 반려된 옛 문서는 지정이 없다 — 처음부터 전부 다시 받는다.
  if not found then
    v_kind  := 'APPROVAL';
    v_from  := null;
    v_reset := true;
  end if;

  v_next := app.clone_approval_round(p_document_id, v_kind, v_from, v_reset);

  -- 지난 회차의 승인을 그대로 안고 가는 자리가 있으면 이미 '진행 중'이다.
  -- 전부 다시 받는 문서만 아무도 손대지 않은 PENDING으로 되돌아간다.
  select exists (
    select 1
      from public.approval_lines prev
     where prev.document_id = p_document_id and prev.round = v_round
       and prev.decision = 'APPROVED'
       and not exists (
         select 1 from public.approval_lines cur
          where cur.document_id = p_document_id and cur.round = v_next
            and cur.kind = prev.kind and cur.step_order = prev.step_order
       )
  ) into v_carried;

  update public.approval_documents
     set title        = coalesce(nullif(btrim(p_title), ''), title),
         field_values = coalesce(p_field_values, field_values),
         status       = case when v_carried then 'IN_REVIEW'::public.approval_status
                             else 'PENDING'::public.approval_status end,
         -- 되돌아온 문서는 끝난 문서가 아니다. 비우지 않으면 문서 머리가 살아 있는
         -- 문서에 완료 일시를 적는다(트리거는 종결 상태에서만 채운다).
         completed_at = null,
         updated_at   = now()
   where id = p_document_id;

  -- 새 회차에서 차례가 온 사람들(구분마다 첫 순번).
  select array_agg(l.approver_id) into v_notify
    from public.approval_lines l
   where l.document_id = p_document_id and l.round = v_next
     and l.step_order = (
       select min(step_order) from public.approval_lines
        where document_id = p_document_id and round = v_next and kind = l.kind
     );
  perform app.notify_approval(p_document_id, v_notify, 'approval_pending', v_uid);

  -- **건너뛴 사람들** — 자기 도장이 남은 채 내용이 바뀐 문서가 통과하는 유일한
  -- 자리다. 이 알림을 빼면 그들은 자기가 승인한 것과 다른 문서가 지나간 사실을
  -- 영영 모른다.
  select array_agg(prev.approver_id) into v_notify
    from public.approval_lines prev
   where prev.document_id = p_document_id and prev.round = v_round
     and prev.decision = 'APPROVED'
     and not exists (
       select 1 from public.approval_lines cur
        where cur.document_id = p_document_id and cur.round = v_next
          and cur.kind = prev.kind and cur.step_order = prev.step_order
     );
  perform app.notify_approval(p_document_id, v_notify, 'approval_skipped', v_uid);
end;
$$;

comment on function public.resubmit_approval_document is
  '되돌아온(REJECTED) 문서의 재상신. 기안자 본인만, 제목·양식 값만 고칠 수 있고 결재선은 '
  '고치지 못한다. 되돌린 사람이 지정한 재개 지점부터 새 회차를 세우며, 건너뛴 앞 순번의 '
  '도장은 지난 회차에 그대로 남는다. 문서 번호는 다시 채번하지 않는다(같은 문서의 두 번째 시도).';

revoke all on function public.resubmit_approval_document(uuid, text, jsonb) from public;
grant execute on function public.resubmit_approval_document(uuid, text, jsonb) to authenticated;
