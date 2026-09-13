-- =====================================================================
-- 예산 줄별 지출 내역 — 워크스페이스 예산/지출 탭이 읽는 자리.
--
-- 왜 새 함수인가: `public.approval_budget_status`는 줄별 **합계**만 답한다. 담당자가
-- 실제로 묻는 것은 "이 줄에서 나간 300만 원이 어느 결재였나"이고, 그 답은 합계로는
-- 나오지 않는다. 화면이 직접 지출 문서를 훑어 집계하는 길도 있지만, 그러면 열람할 수
-- 없는 지출이 조용히 빠져 **합계보다 모자란 목록**이 서고 남은 예산이 거짓으로 보인다.
--
-- 노출 범위: 이 함수는 **줄 id·금액·상태·일자**까지만 돌려준다. 문서 제목과 번호는
-- 호출자가 그 지출 문서를 읽을 수 있을 때에만 채워지고, 아니면 null + readable=false다.
-- 본문(field_values)·기안자·결재선은 어떤 경우에도 나가지 않는다 — 숨은 문서를 통째로
-- 펴 보이지 않으면서도 "여기서 얼마가 나갔다"는 사실은 지켜진다. 합계 숫자 자체는
-- approval_budget_status가 이미 같은 게이트로 답하고 있으므로 새로 새는 것이 없다.
-- 근거: docs/docs_dev/11_migration_security_gate.md, docs/docs_planning/workspace_budget_execution.md
-- =====================================================================

create or replace function public.approval_budget_spend_items(p_document_id uuid)
returns table (
  line_id     text,
  document_id uuid,
  doc_no      text,
  title       text,
  status      text,
  amount      numeric,
  created_at  timestamptz,
  readable    boolean
)
language plpgsql
stable
security definer
set search_path = app, public
as $$
begin
  if app.current_app_user_id() is null then
    raise exception 'unauthenticated' using errcode = '42501';
  end if;
  -- 게이트는 **근거 품의 한 건**이다. 그 품의를 읽을 수 있으면 그 예산이 어디로 나갔는지
  -- 볼 수 있어야 한다(합계를 이미 볼 수 있는 사람과 같은 집합).
  if not app.can_read_approval(p_document_id) then
    raise exception 'not allowed to read this document' using errcode = '42501';
  end if;

  return query
    select s.line_id,
           d.id,
           case when app.can_read_approval(d.id) then d.doc_no end,
           case when app.can_read_approval(d.id) then d.title end,
           d.status::text,
           -- 한 문서가 같은 예산 줄에 두 항목을 올릴 수 있다. 그대로 두면 목록에 같은
           -- (문서, 줄)이 두 번 서고 합계(approval_budget_status)와도 어긋난다.
           sum(s.amount),
           d.created_at,
           app.can_read_approval(d.id)
      from public.approval_documents d
      join public.approval_form_versions v on v.id = d.form_version_id
      cross join lateral app.approval_spend_lines(v.fields, d.field_values) s
     where d.budget_document_id = p_document_id
       and d.deleted_at is null
       and d.status in ('PENDING', 'IN_REVIEW', 'REVISION_REQUIRED', 'APPROVED')
       and coalesce(s.line_id, '') <> ''
     group by s.line_id, d.id
     order by d.created_at desc;
end;
$$;

comment on function public.approval_budget_spend_items is
  '근거 품의 한 건의 예산 줄별 지출 내역(줄 id, 문서별 금액 합, 상태, 일자). 그 품의를 열람할 수 있는 '
  '사람만 통과하며, 개별 지출 문서의 제목·번호는 그 문서를 열람할 수 있을 때에만 채운다 '
  '(아니면 readable=false). 본문·기안자·결재선은 돌려주지 않는다.';

revoke all on function public.approval_budget_spend_items(uuid) from public, anon, service_role;
grant execute on function public.approval_budget_spend_items(uuid) to authenticated;
