-- =====================================================================
-- 지출 내역을 **항목(품목) 단위**로 편다 — 워크스페이스 예산/지출 탭.
--
-- 종전 public.approval_budget_spend_items는 (문서, 예산 줄)으로 묶어 합계를 돌려줬다.
-- 그 묶음은 "같은 문서가 한 줄에 두 항목을 올리면 목록에 같은 줄이 두 번 선다"를 막으려던
-- 것인데, 담당자가 실제로 묻는 것은 "그 1,100,000원이 무엇을 산 돈인가"다. 묶어 버리면
-- 그 답이 화면에 영영 오지 않는다. 그래서 묶음 축에 **항목 이름**을 더해, 같은 문서의 서로
-- 다른 품목은 서로 다른 줄로 선다(합계는 그대로다 — 나누기만 하고 빼지 않는다).
--
-- 노출 범위는 넓히지 않는다. 항목 이름은 문서 본문(field_values)의 값이므로 제목·번호와
-- **같은 게이트**를 지난다 — 그 지출 문서를 읽을 수 있을 때만 채워지고, 아니면 null이다.
-- 금액·상태·일자가 그 문서를 읽지 못해도 서는 것은 종전과 같다(합계가 이미 같은 게이트로
-- 나가 있으므로 새로 새는 것이 없다).
-- 근거: docs/docs_dev/11_migration_security_gate.md
-- =====================================================================

-- ---------------------------------------------------------------------
-- (1) 표 한 벌에서 '품목' 칸이 어디인가 — 첫 TEXT 열이다.
--
--     역할(role) 표시가 없는 칸이라 자리로 가릴 수밖에 없다. 금액 칸과 달리 이 값은
--     계산에 쓰이지 않고 화면 표기에만 쓰이므로, 잘못 골라도 예산이 틀어지지 않는다
--     (그래서 금액 칸처럼 역할 열을 새로 요구하지 않는다).
-- ---------------------------------------------------------------------
create or replace function app.approval_table_label_key(p_field jsonb)
returns text
language sql
immutable
set search_path = app, public
as $$
  select c.value->>'key'
    from jsonb_array_elements(
           case when jsonb_typeof(p_field -> 'columns') = 'array'
                then p_field -> 'columns' else '[]'::jsonb end
         ) with ordinality as c(value, ord)
   where c.value->>'type' = 'TEXT'
   order by c.ord
   limit 1;
$$;

comment on function app.approval_table_label_key(jsonb) is
  '표 한 벌에서 사람이 읽을 이름 칸(첫 TEXT 열)의 key. 표기에만 쓰이며 금액 계산에는 관여하지 않는다.';

revoke all on function app.approval_table_label_key(jsonb) from public;

-- ---------------------------------------------------------------------
-- (2) 지출결의의 항목별 금액에 **항목 이름**을 더한다.
--     반환형만 늘어나고 규칙은 그대로다 — 부르는 자리(app.approval_spend_lines,
--     app.assert_approval_amounts)는 열을 이름으로 고르므로 손대지 않는다.
-- ---------------------------------------------------------------------
drop function if exists app.approval_spend_item_amounts(jsonb, jsonb);
create or replace function app.approval_spend_item_amounts(p_fields jsonb, p_values jsonb)
returns table (
  line_id text, net numeric, vat numeric, gross numeric, vat_kind text,
  split_required boolean,
  bad_amount boolean,
  item text
)
language sql
stable
set search_path = app, public
as $$
  with fields_in as (
    select f.value as field, f.ord
      from jsonb_array_elements(
             case when jsonb_typeof(p_fields) = 'array' then p_fields else '[]'::jsonb end
           ) with ordinality as f(value, ord)
     where f.value->>'type' = 'TABLE'
  ),
  keys as (
    select fi.field, k.loose_gross_key as gross_key, k.net_key, k.vat_key, k.kind_key, k.ref_key,
           app.approval_table_label_key(fi.field) as label_key
      from fields_in fi
      cross join lateral app.approval_amount_keys(fi.field) k
     where k.ref_key is not null
  )
  -- **예산 줄을 고르지 않은 행도 돌려준다**(line_id가 null). 여기서 버리면 금액만 적고
  -- 줄을 비운 행이 조용히 사라져, 어느 예산도 깎지 않은 채 결재가 흐른다. 버리는 자리는
  -- 집계(app.approval_spend_lines)이고 거절하는 자리는 검증이다.
  select nullif(btrim(coalesce(r.value ->> k.ref_key, '')), ''),
         case when k.net_key  is null then null
              else app.text_to_numeric(r.value ->> k.net_key) end,
         case when k.vat_key  is null then null
              else app.text_to_numeric(r.value ->> k.vat_key) end,
         case when k.gross_key is null then null
              else app.text_to_numeric(r.value ->> k.gross_key) end,
         case when k.kind_key is null then null
              else nullif(btrim(coalesce(r.value ->> k.kind_key, '')), '') end,
         (k.net_key is not null or k.vat_key is not null or k.kind_key is not null),
         ((k.gross_key is not null and app.amount_text_bad(r.value ->> k.gross_key))
          or (k.net_key is not null and app.amount_text_bad(r.value ->> k.net_key))
          or (k.vat_key is not null and app.amount_text_bad(r.value ->> k.vat_key))),
         case when k.label_key is null then null
              else nullif(btrim(coalesce(r.value ->> k.label_key, '')), '') end
    from keys k,
         lateral jsonb_array_elements(
           case when jsonb_typeof(p_values -> (k.field->>'key')) = 'array'
                then p_values -> (k.field->>'key')
                else '[]'::jsonb
           end
         ) r;
$$;

comment on function app.approval_spend_item_amounts is
  '지출결의 문서의 항목별 (예산 줄 id, 공급가액, 부가세, 합계액, 과세 유형, 항목 이름). 예산 줄 열을 '
  '가진 표를 모두 읽으며, 줄을 고르지 않은 행도 line_id=null로 돌려준다(검증이 거절한다).';

revoke all on function app.approval_spend_item_amounts(jsonb, jsonb) from public;

-- ---------------------------------------------------------------------
-- (3) 줄별 지출 내역 RPC — 항목 한 줄씩.
-- ---------------------------------------------------------------------
drop function if exists public.approval_budget_spend_items(uuid);
create or replace function public.approval_budget_spend_items(p_document_id uuid)
returns table (
  line_id     text,
  document_id uuid,
  doc_no      text,
  title       text,
  item        text,
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
           -- 항목 이름은 문서 본문의 값이라 제목과 같은 게이트를 지난다.
           case when app.can_read_approval(d.id) then s.item end,
           d.status::text,
           -- 한 문서가 같은 예산 줄에 같은 이름의 항목을 두 번 올릴 수 있다. 그 둘은 사람에게
           -- 같은 한 줄이므로 합쳐 세운다(이름이 다르면 나뉜다).
           sum(s.gross),
           d.created_at,
           app.can_read_approval(d.id)
      from public.approval_documents d
      join public.approval_form_versions v on v.id = d.form_version_id
      cross join lateral app.approval_spend_item_amounts(v.fields, d.field_values) s
     where d.budget_document_id = p_document_id
       and d.deleted_at is null
       and d.status in ('PENDING', 'IN_REVIEW', 'REVISION_REQUIRED', 'APPROVED')
       and coalesce(s.line_id, '') <> ''
     group by s.line_id, d.id, s.item
     order by d.created_at desc, s.line_id, s.item nulls last;
end;
$$;

comment on function public.approval_budget_spend_items is
  '근거 품의 한 건의 지출 내역(예산 줄 id, 문서, 항목 이름, 금액, 상태, 일자) — 항목 한 줄씩. '
  '그 품의를 열람할 수 있는 사람만 통과하며, 개별 지출 문서의 제목·번호·항목 이름은 그 문서를 '
  '열람할 수 있을 때에만 채운다(아니면 readable=false). 본문 전체·기안자·결재선은 돌려주지 않는다.';

revoke all on function public.approval_budget_spend_items(uuid) from public, anon, service_role;
grant execute on function public.approval_budget_spend_items(uuid) to authenticated;
