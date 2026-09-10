-- =====================================================================
-- 전자결재 예산·지출 연동 — 품의의 예산, 지출의 차감, 예산 변경, 거래처 확인
-- 정본: docs/docs_planning/3_1_4_approval_budget_expense.md
-- 선행: 20260826130000(양식 스키마·대표 금액), 20260910030352(결재 처리 RPC),
--       20260903210000(거래처 원장), 20260903230000(가려진 거래처 뷰)
--
-- 결정과 그 이유
--   1) **양식 틀을 바꾸지 않는다.** 양식은 이미 "타입 있는 필드 목록"이고 금액이 숫자로
--      남아 있다. 차감·이익률은 그 위에서만 성립하므로 새 그릇을 만들 이유가 없다.
--      더하는 것은 필드 종류(BUDGET_TREE)와 열 종류(BUDGET_REF·PARTNER_REF), 그리고
--      "이 지출이 어느 품의의 것인가"를 답하는 컬럼 하나다.
--
--   2) **예산 원장을 따로 두지 않는다.** 기획서 초안은 예산 줄 원장(approval_budget_lines)을
--      두려 했으나 두지 않았다. 예산 금액은 이미 품의 문서의 field_values에 있고, 원장을
--      만들면 같은 숫자가 두 곳에 살아 어긋나는 날 어느 쪽이 진짜 예산인지 판정할 근거가
--      없다. 사용 금액도 저장하지 않고 **승인된 지출결의의 값에서 집계**한다 — 적어 두면
--      반려·보완 재상신·승인 취소 때마다 되돌려 빼야 하고, 한 번이라도 놓치면 남은 예산이
--      조용히 거짓을 말한다. 원장이 필요했던 이유(빠른 조회)는 함수 하나가 답한다.
--
--   3) **초과·마이너스를 막지 않는다**(사용자 확정). 시스템이 막으면 예외마다 담당자가
--      우회로를 찾고 그 우회로는 기록에 남지 않는다. 화면이 빨갛게 적고 결재자가 반려한다.
--      **막는 것은 단 하나** — 이미 지출이 걸린 예산 줄을 예산 변경으로 없애는 것이다.
--      그건 판단의 문제가 아니라 지출이 가리킬 자리가 사라지는 일이다.
--
--   4) **거래처 하나 = 계좌 하나**(사용자 확정). 계좌가 바뀌면 그 행을 고치지 않고 새
--      거래처를 만들고 옛 것을 사용 중지한다 — 옛 송금 요청이 "그때 그 계좌"를 계속
--      가리켜야 한다. 그래서 송금 요청은 계좌를 적지 않고 거래처를 가리키기만 한다.
--
-- 보안 게이트 자기점검(docs/docs_dev/11_migration_security_gate.md)
--   · 소유 워크스페이스: office(결재 사용) / management(거래처 원장·양식 쓰기는 admin).
--   · 데이터 등급: Internal(예산·지출 금액). 거래처 계좌는 Restricted이나 이 마이그레이션이
--     노출 범위를 넓히지 않는다 — 가려진 뷰에 '확인 여부' 한 칸만 더한다.
--   · 접근 주체: 내부 사용자. 외부 게스트는 결재 원장에 애초에 닿지 않는다.
--   · Scope: 문서 단건(app.can_read_approval) / 거래처는 global.
--   · 감사 로그: 개인정보 원본·다운로드·Export·권한 변경 없음. 예산 변경 적용은 업무 사실이라
--     audit_logs가 아니라 자기 원장(approval_budget_revisions)에 남는다.
--   · RLS: 신규 테이블 즉시 활성 + SELECT 정책만 둔다. INSERT/UPDATE 정책을 두지 않는 이유는
--     이 원장이 **사람이 적는 것이 아니라 승인이 남기는 기록**이기 때문이다(정책을 열면
--     담당자가 PostgREST로 직접 이력을 지어낼 수 있다). DELETE 정책 없음.
--   · SECURITY DEFINER: 전부 search_path=app,public 고정 + 함수 첫머리 호출자 검증.
--     public 실행권은 회수하고 authenticated에만 부여한다. 내부 헬퍼는 grant하지 않는다.
--   · 시드: 양식 필드 정의만 추가하며 실개인정보·토큰 없음. **덧붙이기만 하고 덮어쓰지
--     않는다** — ADMIN이 이미 손댄 양식을 시드가 되돌리면 안 된다.
-- =====================================================================

-- ---------------------------------------------------------------------
-- (0) 수치 해석 — 저장된 값은 사람이 적은 글자라 쉼표가 섞인다.
--     실패를 예외로 올리지 않는 이유는 이 함수가 결재 상신 경로 한가운데 있기 때문이다.
--     한 칸을 못 읽었다고 문서를 못 올리게 만들면 그 칸과 무관한 일까지 멈춘다.
-- ---------------------------------------------------------------------
create or replace function app.text_to_numeric(p_text text)
returns numeric
language plpgsql
immutable
as $$
begin
  return nullif(regexp_replace(coalesce(p_text, ''), '[,[:space:]]', '', 'g'), '')::numeric;
exception when others then
  return null;
end;
$$;

comment on function app.text_to_numeric is
  '사람이 적은 수치 문자열을 numeric으로. 쉼표·공백을 걷어내고 읽을 수 없으면 null을 돌려준다 '
  '(프론트 numeric.ts의 toNumber와 같은 규칙).';

-- ---------------------------------------------------------------------
-- (1) 양식이 예산과 맺는 관계 — 한 축 네 값.
--
--     둘로 나누지 않는 이유(예: '근거 품의를 쓰는가' + '필수인가')는 담당자가 아니라
--     ADMIN이 고르는 값이라도 **고를 것이 하나면 어긋날 자리도 없기** 때문이다. 두 칸이면
--     "근거 품의를 쓰지 않는데 필수"라는 조합이 생기고, 그걸 막으려면 다시 CHECK가 필요하다.
-- ---------------------------------------------------------------------
alter table public.approval_forms
  add column if not exists budget_link text not null default 'NONE';

do $$ begin
  alter table public.approval_forms
    add constraint approval_forms_budget_link_chk
    check (budget_link in ('NONE', 'SPEND_REQUIRED', 'SPEND_OPTIONAL', 'REVISE'));
exception when duplicate_object then null; end $$;

comment on column public.approval_forms.budget_link is
  '이 양식이 예산과 맺는 관계. NONE=없음 / SPEND_REQUIRED=근거 품의 필수(사업 지출결의서) / '
  'SPEND_OPTIONAL=근거 품의 선택(법인카드·인건비) / REVISE=예산 변경 품의(승인 시 대상 품의의 '
  '예산표를 이 문서의 예산표로 갈아끼운다). 예산표를 가졌는가는 이 값이 아니라 양식 필드에 '
  'BUDGET_TREE가 있는가가 답한다 — 같은 사실을 두 곳에 적지 않는다.';

-- ---------------------------------------------------------------------
-- (2) 이 문서가 가리키는 품의 — 지출결의의 근거이자 변경 품의의 대상.
--
--     상호 참조(approval_document_links)와 **다른 축이다.** 저쪽은 방향 없는 "관련이 있다"이고
--     이쪽은 "이 품의의 돈을 쓴다"는 방향 있는 사실이다. 같은 칸에 담으면 관련 문서를 하나
--     걸었을 뿐인데 예산이 차감된다.
-- ---------------------------------------------------------------------
alter table public.approval_documents
  add column if not exists budget_document_id uuid references public.approval_documents(id);

do $$ begin
  alter table public.approval_documents
    add constraint approval_documents_budget_self_chk
    check (budget_document_id is null or budget_document_id <> id);
exception when duplicate_object then null; end $$;

create index if not exists idx_approval_docs_budget_source
  on public.approval_documents (budget_document_id)
  where budget_document_id is not null and deleted_at is null;

comment on column public.approval_documents.budget_document_id is
  '근거 품의(지출결의) 또는 변경 대상 품의(예산 변경 품의). 어느 쪽인지는 양식의 budget_link가 '
  '답한다. 상호 참조와 다른 축이다 — 저쪽은 방향 없는 관계이고 이쪽은 돈이 흐르는 방향이다.';

-- ---------------------------------------------------------------------
-- (3) 양식 스키마 읽기 — 어느 필드가 예산표이고 어느 열이 금액인가.
--     화면(fields.ts budgetAmountColumn)과 같은 규칙이다: 대표 금액 표시가 붙은 열,
--     없으면 첫 금액 열.
-- ---------------------------------------------------------------------
create or replace function app.approval_budget_keys(p_fields jsonb)
returns table (field_key text, amount_key text)
language plpgsql
immutable
set search_path = app, public
as $$
declare
  f jsonb;
  c jsonb;
  v_primary text;
  v_first   text;
begin
  if p_fields is null or jsonb_typeof(p_fields) <> 'array' then
    return;
  end if;
  for f in select * from jsonb_array_elements(p_fields) loop
    if (f->>'type') <> 'BUDGET_TREE' or jsonb_typeof(f->'columns') <> 'array' then
      continue;
    end if;
    v_primary := null;
    v_first   := null;
    for c in select * from jsonb_array_elements(f->'columns') loop
      if (c->>'type') = 'MONEY' and v_first is null then
        v_first := c->>'key';
      end if;
      if coalesce((c->>'primaryAmount')::boolean, false) and (c->>'type') in ('MONEY', 'NUMBER') then
        v_primary := c->>'key';
      end if;
    end loop;
    field_key  := f->>'key';
    amount_key := coalesce(v_primary, v_first);
    if amount_key is not null then
      return next;
      -- 예산표는 양식당 하나다(프론트 validateSchema가 같은 규칙을 강제한다).
      return;
    end if;
  end loop;
end;
$$;

comment on function app.approval_budget_keys is
  '양식 스키마에서 예산표 필드 key와 그 금액 열 key를 찾는다. 예산표가 없으면 0행이며, '
  '"이 양식이 품의서인가"를 이 함수가 답한다.';

-- ---------------------------------------------------------------------
-- (4) 예산표의 맨 아래 줄 — 금액이 적히는 자리이자 지출이 가리키는 자리.
--
--     맨 아래 줄 판정은 "다음 줄이 더 깊지 않다"이며 lead()가 그대로 답한다.
--     위층 금액을 함께 세면 두 번 세게 되므로 여기서 걸러 내는 것이 합계의 전부다.
-- ---------------------------------------------------------------------
create or replace function app.approval_budget_lines(p_fields jsonb, p_values jsonb)
returns table (line_id text, amount numeric)
language sql
stable
set search_path = app, public
as $$
  with keys as (
    select field_key, amount_key from app.approval_budget_keys(p_fields)
  ),
  rows_in as (
    select row_number() over () as ord,
           e.value as row_json
      from keys k,
           lateral jsonb_array_elements(
             case
               when jsonb_typeof(p_values -> k.field_key -> 'rows') = 'array'
                 then p_values -> k.field_key -> 'rows'
               else '[]'::jsonb
             end
           ) e
  ),
  depths as (
    select ord,
           row_json,
           coalesce(app.text_to_numeric(row_json ->> 'depth'), 0)::int as depth
      from rows_in
  )
  select d.row_json ->> 'id',
         app.text_to_numeric(d.row_json -> 'values' ->> (select amount_key from keys))
    from (
      select ord, row_json, depth,
             lead(depth) over (order by ord) as next_depth
        from depths
    ) d
   where (d.next_depth is null or d.next_depth <= d.depth)
     and coalesce(d.row_json ->> 'id', '') <> '';
$$;

comment on function app.approval_budget_lines is
  '품의 예산표의 맨 아래 줄(줄 id, 금액). 위층은 아래 줄들의 합이라 여기서 제외한다 — '
  '함께 세면 두 번 센다. 프론트 budget.ts의 leafRows/budgetTotal과 같은 규칙.';

-- ---------------------------------------------------------------------
-- (5) 대표 금액 해석기에 예산표를 더한다.
--     품의서의 문서 금액 = 예산표 합계이며, 예산 변경이 적용되면 트리거가 이 값을 다시 센다.
-- ---------------------------------------------------------------------
create or replace function app.approval_primary_amount(p_fields jsonb, p_values jsonb)
returns numeric
language plpgsql
stable
set search_path = app, public
as $$
declare
  f jsonb;
  c jsonb;
  v numeric;
begin
  if p_fields is null or jsonb_typeof(p_fields) <> 'array' then
    return null;
  end if;
  for f in select * from jsonb_array_elements(p_fields) loop
    if (f->>'type') in ('MONEY', 'NUMBER')
       and coalesce((f->>'primaryAmount')::boolean, false) then
      return app.text_to_numeric(p_values ->> (f->>'key'));

    elsif (f->>'type') = 'BUDGET_TREE' then
      -- 예산표의 대표 금액은 맨 아래 줄들의 합이다. 대표 금액 표시가 붙은 열이 있을 때만
      -- 문서 금액이 된다 — 표시가 없으면 아래 TABLE 분기가 계속 자기 차례를 갖는다.
      if exists (
        select 1
          from jsonb_array_elements(coalesce(f->'columns', '[]'::jsonb)) col
         where coalesce((col.value->>'primaryAmount')::boolean, false)
      ) then
        select sum(l.amount) into v
          from app.approval_budget_lines(jsonb_build_array(f), p_values) l;
        return v;
      end if;

    elsif (f->>'type') = 'TABLE' and jsonb_typeof(f->'columns') = 'array' then
      for c in select * from jsonb_array_elements(f->'columns') loop
        if (c->>'type') in ('MONEY', 'NUMBER')
           and coalesce((c->>'primaryAmount')::boolean, false) then
          select sum(app.text_to_numeric(r.value->>(c->>'key'))) into v
            from jsonb_array_elements(coalesce(p_values->(f->>'key'), '[]'::jsonb)) r;
          return v;
        end if;
      end loop;
    end if;
  end loop;
  return null;
end;
$$;

revoke all on function app.approval_primary_amount(jsonb, jsonb) from public;
grant execute on function app.approval_primary_amount(jsonb, jsonb) to authenticated;

-- ---------------------------------------------------------------------
-- (6) 지출결의가 어느 예산 줄에서 얼마를 쓰는가.
--     양식에서 BUDGET_REF 열을 가진 첫 표를 찾고, 그 표의 금액 열을 함께 읽는다.
-- ---------------------------------------------------------------------
create or replace function app.approval_spend_lines(p_fields jsonb, p_values jsonb)
returns table (line_id text, amount numeric)
language plpgsql
stable
set search_path = app, public
as $$
declare
  f jsonb;
  c jsonb;
  v_table   text;
  v_ref     text;
  v_primary text;
  v_first   text;
begin
  if p_fields is null or jsonb_typeof(p_fields) <> 'array' then
    return;
  end if;
  for f in select * from jsonb_array_elements(p_fields) loop
    if (f->>'type') <> 'TABLE' or jsonb_typeof(f->'columns') <> 'array' then
      continue;
    end if;
    v_ref := null; v_primary := null; v_first := null;
    for c in select * from jsonb_array_elements(f->'columns') loop
      if (c->>'type') = 'BUDGET_REF' and v_ref is null then
        v_ref := c->>'key';
      end if;
      if (c->>'type') in ('MONEY', 'NUMBER') then
        if v_first is null then v_first := c->>'key'; end if;
        if coalesce((c->>'primaryAmount')::boolean, false) then v_primary := c->>'key'; end if;
      end if;
    end loop;

    if v_ref is not null then
      v_table := f->>'key';
      -- 예산 줄을 가리키는 표는 하나다. 둘이면 같은 지출이 두 번 세어질 수 있어 첫 표만 본다.
      return query
        select r.value ->> v_ref,
               app.text_to_numeric(r.value ->> coalesce(v_primary, v_first))
          from jsonb_array_elements(
                 case when jsonb_typeof(p_values -> v_table) = 'array'
                      then p_values -> v_table else '[]'::jsonb end
               ) r
         where coalesce(r.value ->> v_ref, '') <> '';
      return;
    end if;
  end loop;
end;
$$;

comment on function app.approval_spend_lines is
  '지출결의 문서에서 (예산 줄 id, 금액) 목록. BUDGET_REF 열을 가진 첫 표만 읽는다 — '
  '둘을 읽으면 같은 지출이 두 번 세어진다.';

-- ---------------------------------------------------------------------
-- (7) 한 품의의 예산 줄별 사용 현황.
--
--     **승인된 것만 빠진 돈이다.** 흐르는 중인 문서는 아직 빠지지 않았으나 곧 빠질 수 있으므로
--     따로 센다(결재 중) — 둘을 뭉치면 반려된 지출이 예산을 계속 먹고, 갈라 두지 않으면
--     담당자가 "지금 올려도 되는가"에 답할 수 없다. 반려·임시저장은 어느 쪽도 아니다.
-- ---------------------------------------------------------------------
create or replace function app.approval_budget_usage(p_document_id uuid)
returns table (line_id text, spent numeric, pending numeric)
language sql
stable
security definer
set search_path = app, public
as $$
  select s.line_id,
         coalesce(sum(s.amount) filter (where d.status = 'APPROVED'), 0),
         coalesce(sum(s.amount) filter (
           where d.status in ('PENDING', 'IN_REVIEW', 'REVISION_REQUIRED')
         ), 0)
    from public.approval_documents d
    join public.approval_form_versions v on v.id = d.form_version_id
    cross join lateral app.approval_spend_lines(v.fields, d.field_values) s
   where d.budget_document_id = p_document_id
     and d.deleted_at is null
     and coalesce(s.line_id, '') <> ''
   group by s.line_id;
$$;

comment on function app.approval_budget_usage is
  '품의 한 건의 예산 줄별 사용액(승인 완료)과 결재 중 금액. 저장하지 않고 매번 집계한다 — '
  '적어 두면 반려·보완 재상신·승인 취소마다 되돌려 빼야 하고 한 번 놓치면 조용히 거짓이 된다. '
  '호출자 검증이 없으므로 authenticated에 열지 않고 게이트를 가진 public 래퍼만 부른다.';

revoke all on function app.approval_budget_usage(uuid) from public;

-- 화면이 부르는 자리 — 그 품의를 읽을 수 있는 사람만 통과한다.
--
-- INVOKER로 두지 않은 이유: 지출결의 중에는 호출자가 열람할 수 없는 문서가 섞이는데,
-- 그러면 합계가 조용히 모자라게 나와 화면이 "예산이 남았다"고 거짓을 말한다. 남은 예산은
-- 안 보이는 것보다 틀리게 보이는 것이 나쁘다. 대신 새어 나가는 것은 **이미 읽을 수 있는
-- 품의의 줄별 합계 숫자**뿐이고, 어느 문서가 썼는지는 여기서 나가지 않는다.
create or replace function public.approval_budget_status(p_document_id uuid)
returns table (line_id text, spent numeric, pending numeric)
language plpgsql
stable
security definer
set search_path = app, public
as $$
begin
  if app.current_app_user_id() is null then
    raise exception 'unauthenticated' using errcode = '42501';
  end if;
  if not app.can_read_approval(p_document_id) then
    raise exception 'not allowed to read this document' using errcode = '42501';
  end if;
  return query select * from app.approval_budget_usage(p_document_id);
end;
$$;

comment on function public.approval_budget_status is
  '품의 상세·지출결의 기안 화면이 읽는 예산 줄별 사용 현황. 그 품의를 열람할 수 있는 사람만 '
  '통과한다(app.can_read_approval).';

revoke all on function public.approval_budget_status(uuid) from public, anon, service_role;
grant execute on function public.approval_budget_status(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- (8) 예산 변경 이력 — 승인이 남기는 기록이지 사람이 적는 값이 아니다.
--
--     변경 전 합계를 여기에 적어 두는 이유는 적용하는 순간 원 품의의 값이 새 값으로 덮이기
--     때문이다. 그 순간이 지나면 "얼마에서 얼마로 바뀌었나"를 되짚을 근거가 어디에도 없다.
-- ---------------------------------------------------------------------
create table if not exists public.approval_budget_revisions (
  id                 uuid primary key default gen_random_uuid(),
  /** 예산이 바뀐 품의. */
  target_document_id uuid not null references public.approval_documents(id) on delete cascade,
  /** 그 변경을 신청한 예산 변경 품의. 한 문서는 한 번만 적용된다. */
  change_document_id uuid not null references public.approval_documents(id) on delete cascade,
  seq                integer not null,
  before_total       numeric,
  after_total        numeric,
  /**
   * 갈아끼우기 직전의 예산표 원본. 합계만 적어 두면 "얼마에서 얼마로"는 답해도
   * "무엇이 어떻게"는 답하지 못하고, 오적용을 되돌릴 근거도 남지 않는다.
   */
  before_budget      jsonb,
  applied_at         timestamptz not null default now(),
  applied_by         uuid references public.users(id),
  constraint approval_budget_revisions_seq_chk check (seq > 0)
);

create unique index if not exists uq_approval_budget_revisions_change
  on public.approval_budget_revisions (change_document_id);
create index if not exists idx_approval_budget_revisions_target
  on public.approval_budget_revisions (target_document_id, seq);

comment on table public.approval_budget_revisions is
  '예산 변경 적용 이력. 변경 품의가 최종 승인될 때 서버가 한 줄 남긴다. 사람이 쓰는 원장이 '
  '아니므로 INSERT/UPDATE 정책을 두지 않는다 — 정책을 열면 담당자가 PostgREST로 직접 이력을 '
  '지어낼 수 있고, 그러면 이 표가 근거가 되지 못한다.';

alter table public.approval_budget_revisions enable row level security;

-- 읽기: 두 문서 중 **하나라도** 읽을 수 있으면 보인다.
-- 양쪽을 다 요구하지 않는 이유는 이 행이 두 문서의 관계가 아니라 **품의에 일어난 사건**이기
-- 때문이다. 품의를 읽을 수 있는 사람은 그 예산이 언제 얼마로 바뀌었는지 알아야 하고, 그
-- 신청서를 읽을 권한까지 있어야 할 이유는 없다(문서 제목은 이 행에 담기지 않는다).
drop policy if exists approval_budget_revisions_select on public.approval_budget_revisions;
create policy approval_budget_revisions_select on public.approval_budget_revisions for select
  using (
    app.can_read_approval(target_document_id)
    or app.can_read_approval(change_document_id)
  );

-- ---------------------------------------------------------------------
-- (9) 예산 변경 적용 — 변경 품의가 최종 승인될 때만 돈다.
-- ---------------------------------------------------------------------
create or replace function app.apply_approval_budget_revision(p_change_document_id uuid)
returns void
language plpgsql
security definer
set search_path = app, public
as $$
declare
  v_target        uuid;
  v_change_fields jsonb;
  v_change_values jsonb;
  v_target_fields jsonb;
  v_target_values jsonb;
  v_change_key    text;
  v_target_key    text;
  v_before        numeric;
  v_after         numeric;
  v_lost          text;
  v_seq           integer;
begin
  select d.budget_document_id, v.fields, d.field_values
    into v_target, v_change_fields, v_change_values
    from public.approval_documents d
    join public.approval_form_versions v on v.id = d.form_version_id
   where d.id = p_change_document_id and d.deleted_at is null;

  if v_target is null then
    raise exception '예산 변경 품의에 대상 품의가 지정되어 있지 않습니다.' using errcode = '22023';
  end if;

  select field_key into v_change_key from app.approval_budget_keys(v_change_fields);
  if v_change_key is null then
    raise exception '예산 변경 품의에 예산표가 없습니다.' using errcode = '22023';
  end if;

  select v.fields, d.field_values into v_target_fields, v_target_values
    from public.approval_documents d
    join public.approval_form_versions v on v.id = d.form_version_id
   where d.id = v_target and d.deleted_at is null;

  select field_key into v_target_key from app.approval_budget_keys(v_target_fields);
  if v_target_key is null then
    raise exception '대상 문서가 예산표를 가진 품의가 아닙니다.' using errcode = '22023';
  end if;

  -- **막는 것은 이것 하나다.** 이미 지출이 걸린 줄이 새 예산표에서 사라지면 그 지출이
  -- 가리킬 자리가 없어진다(금액을 줄이는 것은 막지 않는다 — 마이너스로 두고 결재자가 본다).
  select string_agg(u.line_id, ', ') into v_lost
    from app.approval_budget_usage(v_target) u
   where (u.spent <> 0 or u.pending <> 0)
     and not exists (
       select 1 from app.approval_budget_lines(v_change_fields, v_change_values) n
        where n.line_id = u.line_id
     );
  if v_lost is not null then
    raise exception '이미 지출이 걸린 예산 줄을 없앨 수 없습니다(줄 %). 금액만 고쳐 주세요.', v_lost
      using errcode = '23514';
  end if;

  select sum(amount) into v_before from app.approval_budget_lines(v_target_fields, v_target_values);
  select sum(amount) into v_after  from app.approval_budget_lines(v_change_fields, v_change_values);

  -- 예산표 한 칸만 갈아끼운다. 대상 문서의 다른 값(본문·첨부·결재선)은 그때의 사실이라
  -- 손대지 않는다. 문서 금액은 스탬프 트리거가 새 예산표에서 다시 센다.
  update public.approval_documents
     set field_values = jsonb_set(
           coalesce(field_values, '{}'::jsonb),
           array[v_target_key],
           coalesce(v_change_values -> v_change_key, '{}'::jsonb),
           true
         ),
         updated_at = now()
   where id = v_target;

  select coalesce(max(seq), 0) + 1 into v_seq
    from public.approval_budget_revisions where target_document_id = v_target;

  insert into public.approval_budget_revisions
    (target_document_id, change_document_id, seq,
     before_total, after_total, before_budget, applied_by)
  values (v_target, p_change_document_id, v_seq, v_before, v_after,
          v_target_values -> v_target_key, app.current_app_user_id())
  on conflict (change_document_id) do nothing;
end;
$$;

comment on function app.apply_approval_budget_revision is
  '예산 변경 품의가 최종 승인될 때 대상 품의의 예산표를 갈아끼우고 이력을 남긴다. 호출자 '
  '검증을 하지 않으므로 authenticated에 열지 않고 decide_approval_document만 부른다.';

revoke all on function app.apply_approval_budget_revision(uuid) from public;

-- ---------------------------------------------------------------------
-- (10) 가리키는 품의가 실제로 품의인지 — 값이 바뀔 때만 확인한다.
--
--      "승인된 문서여야 한다"까지는 걸지 않는다. 결재 초기화(recall RESET)로 품의가 다시
--      흐르기 시작하는 일이 실제로 있고, 그때 이미 걸린 지출결의의 저장이 통째로 막히면
--      담당자는 자기가 만들지 않은 상황 때문에 문서를 고칠 수도 없게 된다. 고를 때 승인된
--      것만 보이는 것은 화면이 맡고, 원장은 "예산표를 가진 문서인가"만 지킨다.
-- ---------------------------------------------------------------------
create or replace function app.check_approval_budget_ref()
returns trigger
language plpgsql
security definer
set search_path = app, public
as $$
declare
  v_ok boolean;
begin
  if NEW.budget_document_id is null then
    return NEW;
  end if;
  if TG_OP = 'UPDATE' and NEW.budget_document_id is not distinct from OLD.budget_document_id then
    return NEW;
  end if;

  select exists (
    select 1
      from public.approval_documents d
      join public.approval_form_versions v on v.id = d.form_version_id
      cross join lateral app.approval_budget_keys(v.fields) k
     where d.id = NEW.budget_document_id and d.deleted_at is null
  ) into v_ok;

  if not v_ok then
    raise exception '예산표를 가진 품의만 근거로 지정할 수 있습니다.' using errcode = '23514';
  end if;
  return NEW;
end;
$$;

drop trigger if exists trg_approval_documents_budget_ref on public.approval_documents;
create trigger trg_approval_documents_budget_ref
  before insert or update of budget_document_id on public.approval_documents
  for each row execute function app.check_approval_budget_ref();

-- ---------------------------------------------------------------------
-- (11) 결재 처리에 예산 변경 적용을 잇는다.
--      본문은 20260910030352와 같고, **최종 승인 직후 한 갈래만** 더한다.
-- ---------------------------------------------------------------------
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
  v_budget    text;
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

    -- 예산 변경 품의는 **최종 승인 순간에** 대상 품의의 예산표를 갈아끼운다.
    -- 여기서 예외가 나면 트랜잭션이 통째로 되돌아가 이 승인도 성립하지 않는다 — 그것이 맞다.
    -- 적용할 수 없는 변경을 승인만 해 두면 "문서는 승인인데 예산은 그대로"인 상태가 남고,
    -- 그 어긋남은 나중에 아무도 발견하지 못한다.
    if v_remaining = 0 then
      select f.budget_link into v_budget
        from public.approval_documents d
        join public.approval_forms f on f.id = d.form_id
       where d.id = v_doc;
      if v_budget = 'REVISE' then
        perform app.apply_approval_budget_revision(v_doc);
      end if;
    end if;
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
  '문서를 REVISION_REQUIRED로 멈춘다. 예산 변경 품의는 최종 승인 시 대상 품의의 예산표를 '
  '갈아끼운다(app.apply_approval_budget_revision).';

revoke all on function public.decide_approval_document(
  uuid, public.approval_decision, text
) from public, anon, service_role;
grant execute on function public.decide_approval_document(
  uuid, public.approval_decision, text
) to authenticated;

-- ---------------------------------------------------------------------
-- (12) 임시저장 수정에 근거 품의를 싣는다.
--      옛 9인자 시그니처를 먼저 걷는다 — 남겨 두면 오버로드가 되어 어느 쪽이 불리는지
--      호출 인자에 따라 갈리고, 근거 품의를 지우는 저장이 조용히 무시된다.
-- ---------------------------------------------------------------------
drop function if exists public.save_approval_draft(
  uuid, text, uuid, uuid, jsonb, uuid, jsonb, uuid[], boolean
);

create or replace function public.save_approval_draft(
  p_document_id        uuid,
  p_title              text,
  p_form_id            uuid,
  p_form_version_id    uuid,
  p_field_values       jsonb,
  p_department_id      uuid,
  p_lines              jsonb,
  p_recipient_ids      uuid[],
  p_submit             boolean,
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

  delete from public.approval_lines where document_id = p_document_id;
  insert into public.approval_lines (document_id, approver_id, step_order, kind)
  select p_document_id,
         (e ->> 'approver_id')::uuid,
         (e ->> 'step_order')::integer,
         (e ->> 'kind')::public.approval_line_kind
    from jsonb_array_elements(coalesce(p_lines, '[]'::jsonb)) e;

  delete from public.approval_recipients where document_id = p_document_id;
  insert into public.approval_recipients (document_id, user_id, sort_order)
  select p_document_id, u, i - 1
    from unnest(coalesce(p_recipient_ids, '{}'::uuid[])) with ordinality as t(u, i);
end;
$$;

comment on function public.save_approval_draft is
  '임시저장 문서의 값·결재선·참조자·근거 품의를 통째로 갈아끼운다. 기안자 본인의 DRAFT만 통과.';

revoke all on function public.save_approval_draft(
  uuid, text, uuid, uuid, jsonb, uuid, jsonb, uuid[], boolean, uuid
) from public, anon, service_role;
grant execute on function public.save_approval_draft(
  uuid, text, uuid, uuid, jsonb, uuid, jsonb, uuid[], boolean, uuid
) to authenticated;

-- ---------------------------------------------------------------------
-- (13) 거래처의 '확인 전' — 송금 요청에서 즉석 등록한 행과 경영지원이 증빙을 보고
--      확인한 행을 가른다.
--
--      기존 행은 전부 경영지원이 증빙을 보고 등록한 것이므로 확인된 것으로 채운다.
--      채우지 않으면 어제까지 정상이던 거래처가 오늘 갑자기 '확인 전' 딱지를 달고,
--      그 딱지는 사실이 아니다.
-- ---------------------------------------------------------------------
alter table public.trade_partners
  add column if not exists verified_at timestamptz,
  add column if not exists verified_by uuid references public.users(id);

update public.trade_partners
   set verified_at = coalesce(created_at, now())
 where verified_at is null;

comment on column public.trade_partners.verified_at is
  '경영지원이 증빙(사업자등록증·통장사본)을 보고 계좌를 확인한 시점. 비어 있으면 화면에 '
  '"확인 전" 딱지가 붙는다 — 송금 요청에서 즉석 등록한 거래처가 확인된 거래처와 같은 얼굴로 '
  '서지 않게 한다. 송금 요청·상신을 막지는 않는다(걸러 내는 일은 결재자의 반려가 한다).';

-- 확인한 사람은 화면이 보내는 값이 아니라 세션이 정한다 — 확인은 책임이 따르는 행위라
-- 누가 했는지를 클라이언트가 주장하게 두지 않는다.
create or replace function app.stamp_trade_partner_verified()
returns trigger
language plpgsql
security definer
set search_path = app, public
as $$
begin
  if NEW.verified_at is null then
    NEW.verified_by := null;
  elsif OLD.verified_at is null or NEW.verified_by is null then
    NEW.verified_by := app.current_app_user_id();
  end if;
  return NEW;
end;
$$;

drop trigger if exists trg_trade_partners_verified on public.trade_partners;
create trigger trg_trade_partners_verified
  before update of verified_at on public.trade_partners
  for each row execute function app.stamp_trade_partner_verified();

-- 가려진 뷰에 확인 여부 한 칸을 더한다. **계좌 노출 범위는 그대로다** — 이 한 칸이
-- 없으면 송금 요청 화면이 "이 계좌가 확인된 것인가"를 답하지 못하고, 그러면 딱지를
-- 붙이는 일 자체가 성립하지 않는다.
drop view if exists public.trade_partners_directory;

create view public.trade_partners_directory
with (security_invoker = false) as
select
  p.id,
  p.code,
  p.name,
  p.partner_type,
  case
    when p.partner_type = 'CORPORATE' then p.registration_no
    else left(p.registration_no, 4)
  end as registration_no,
  p.bank_code,
  right(regexp_replace(p.account_no, '\D', '', 'g'), 4) as account_no_last4,
  p.account_holder,
  p.is_active,
  p.verified_at,
  p.updated_at
from public.trade_partners p
where p.deleted_at is null
  and app.is_internal_user();

comment on view public.trade_partners_directory is
  'OFFICE 거래처 조회면·송금 요청 선택 목록. 원장(trade_partners)은 management 전용이고 이 뷰가 '
  '내부 임직원에게 가려진 한 벌을 낸다(계좌번호 뒤 4자리, 개인 생년월일은 연도만, 증빙 서류 '
  '없음, 확인 여부 포함). security_invoker=false이므로 접근 판정은 본문의 app.is_internal_user()가 '
  '한다. 근거: 20260903230000 · 20260911140000';

revoke all on public.trade_partners_directory from public;
grant select on public.trade_partners_directory to authenticated;

-- ---------------------------------------------------------------------
-- (14) 송금 요청에서의 즉석 거래처 등록.
--
--      원장 쓰기는 management 전용인데 송금 요청은 전 직원이 쓴다. 그래서 이 한 경로만
--      DEFINER로 연다. **여는 것은 "확인 전 행을 만드는 것"뿐이다** — verified_at을 인자로
--      받지 않으므로 이 길로는 확인된 거래처를 만들 수 없고, 확인은 여전히 경영지원의 일이다.
--      계좌를 고치는 길도 열지 않는다(거래처 하나 = 계좌 하나, 계좌가 바뀌면 새 거래처다).
-- ---------------------------------------------------------------------
create or replace function public.register_trade_partner_quick(
  p_name            text,
  p_partner_type    text,
  p_registration_no text,
  p_bank_code       text,
  p_account_no      text,
  p_account_holder  text
)
returns uuid
language plpgsql
security definer
set search_path = app, public
as $$
declare
  v_uid uuid := app.current_app_user_id();
  v_id  uuid;
begin
  if v_uid is null then
    raise exception 'unauthenticated' using errcode = '42501';
  end if;
  -- 내부 임직원만. 게스트는 결재를 쓰지 않으므로 여기에 닿을 이유가 없다.
  if not app.is_internal_user() then
    raise exception 'internal users only' using errcode = '42501';
  end if;
  if nullif(btrim(coalesce(p_name, '')), '') is null then
    raise exception '거래처명을 입력하세요.' using errcode = '22023';
  end if;

  insert into public.trade_partners
    (code_prefix, code_seq, name, partner_type, registration_no,
     bank_code, account_no, account_holder, is_active)
  values ('YN', 1, btrim(p_name), coalesce(nullif(btrim(p_partner_type), ''), 'CORPORATE'),
          nullif(btrim(coalesce(p_registration_no, '')), ''),
          nullif(btrim(coalesce(p_bank_code, '')), ''),
          nullif(btrim(coalesce(p_account_no, '')), ''),
          nullif(btrim(coalesce(p_account_holder, '')), ''),
          true)
  returning id into v_id;

  return v_id;
end;
$$;

comment on function public.register_trade_partner_quick is
  '송금 요청 화면에서 없는 거래처를 그 자리에서 원장에 넣는다. 만들어지는 행은 언제나 '
  '"확인 전"(verified_at is null)이며 경영지원이 증빙을 보고 확인해야 딱지가 떨어진다. '
  'code_seq는 인자로 받은 값이 아니라 원장 트리거가 잠금 아래에서 다시 매긴다.';

revoke all on function public.register_trade_partner_quick(text, text, text, text, text, text)
  from public, anon, service_role;
grant execute on function public.register_trade_partner_quick(text, text, text, text, text, text)
  to authenticated;

-- ---------------------------------------------------------------------
-- (15) 양식 시드 — **덧붙이기만 하고 덮어쓰지 않는다.**
--
--      ADMIN이 이미 손댄 양식을 시드가 되돌리면 안 되므로, 현재 버전의 필드를 읽어
--      없는 것만 더한 새 버전을 발행한다. 이미 예산표(또는 예산 줄 열)가 있으면 아무 일도
--      하지 않는다 — 두 번 돌려도 같은 결과여야 한다.
--
--      기능이 보이지 않으면 전달된 것이 아니므로 시드를 둔다. 다만 시드는 초기값이지
--      정답이 아니다(모듈 카탈로그와 같은 규칙) — 층 이름·열·필수 여부는 ADMIN이 고친다.
-- ---------------------------------------------------------------------
do $$
declare
  v_form    uuid;
  v_fields  jsonb;
  v_next    integer;
  v_ver     uuid;
begin
  ---------------------------------------------------------------------
  -- 품의서: 예산표를 더한다.
  ---------------------------------------------------------------------
  select f.id, v.fields into v_form, v_fields
    from public.approval_forms f
    left join public.approval_form_versions v on v.id = f.current_version_id
   where f.abbrev = '품의' and f.deleted_at is null;

  if v_form is not null
     and not exists (
       select 1 from jsonb_array_elements(coalesce(v_fields, '[]'::jsonb)) e
        where e.value->>'type' = 'BUDGET_TREE'
     )
  then
    select coalesce(max(version_no), 0) + 1 into v_next
      from public.approval_form_versions where form_id = v_form;

    insert into public.approval_form_versions (form_id, version_no, fields)
    values (
      v_form, v_next,
      -- 기존 필드에서 옛 대표 금액 표시를 내린다. 대표 금액은 한 곳뿐이라 예산표가
      -- 그 자리를 가져가지 않으면 문서 금액이 예산 합계가 되지 않는다.
      (
        select coalesce(jsonb_agg(
                 case when coalesce((e.value->>'primaryAmount')::boolean, false)
                      then e.value - 'primaryAmount'
                      else e.value end
                 order by e.ord), '[]'::jsonb)
          from jsonb_array_elements(coalesce(v_fields, '[]'::jsonb)) with ordinality e(value, ord)
      )
      || jsonb_build_array(jsonb_build_object(
           'key', 'budget',
           'label', '예산',
           'type', 'BUDGET_TREE',
           'levels', jsonb_build_array('대분류', '중분류', '세부항목'),
           'columns', jsonb_build_array(
             jsonb_build_object('key', 'qty',       'label', '수량', 'type', 'NUMBER'),
             jsonb_build_object('key', 'unitPrice', 'label', '단가', 'type', 'MONEY'),
             jsonb_build_object('key', 'amount',    'label', '금액', 'type', 'MONEY',
                                'primaryAmount', true),
             jsonb_build_object('key', 'note',      'label', '비고', 'type', 'TEXT', 'wide', true)
           )
         ))
    )
    returning id into v_ver;

    update public.approval_forms set current_version_id = v_ver where id = v_form;
  end if;

  ---------------------------------------------------------------------
  -- 지출결의서: 지출 내역에 '예산 줄' 열을 더하고 송금 요청 표를 세운다.
  --             근거 품의를 필수로 둔다(사업 지출결의서).
  ---------------------------------------------------------------------
  v_form := null; v_fields := null;
  select f.id, v.fields into v_form, v_fields
    from public.approval_forms f
    left join public.approval_form_versions v on v.id = f.current_version_id
   where f.abbrev = '지결' and f.deleted_at is null;

  if v_form is not null
     and not exists (
       select 1
         from jsonb_array_elements(coalesce(v_fields, '[]'::jsonb)) e,
              lateral jsonb_array_elements(coalesce(e.value->'columns', '[]'::jsonb)) c
        where c.value->>'type' = 'BUDGET_REF'
     )
  then
    select coalesce(max(version_no), 0) + 1 into v_next
      from public.approval_form_versions where form_id = v_form;

    insert into public.approval_form_versions (form_id, version_no, fields)
    values (
      v_form, v_next,
      (
        -- 지출 내역 표의 맨 앞에 '예산 줄' 열을 끼운다(무엇에 쓰는 돈인지가 금액보다 먼저다).
        select coalesce(jsonb_agg(
                 case when e.value->>'key' = 'expense_items'
                      then jsonb_set(e.value, '{columns}',
                             jsonb_build_array(jsonb_build_object(
                               'key', 'budgetLine', 'label', '예산 줄', 'type', 'BUDGET_REF'))
                             || coalesce(e.value->'columns', '[]'::jsonb))
                      else e.value end
                 order by e.ord), '[]'::jsonb)
          from jsonb_array_elements(coalesce(v_fields, '[]'::jsonb)) with ordinality e(value, ord)
      )
      || jsonb_build_array(jsonb_build_object(
           'key', 'remittances',
           'label', '송금 요청',
           'type', 'TABLE',
           'columns', jsonb_build_array(
             -- 거래처는 고르기만 한다. 은행·계좌·예금주를 여기 옮겨 적지 않는 이유는
             -- 그 값의 주인이 거래처 원장이기 때문이다(거래처 하나 = 계좌 하나).
             jsonb_build_object('key', 'partner',   'label', '거래처',     'type', 'PARTNER_REF'),
             jsonb_build_object('key', 'amount',    'label', '송금액',     'type', 'MONEY'),
             jsonb_build_object('key', 'requestOn', 'label', '송금 요청일', 'type', 'DATE')
           )
         ))
    )
    returning id into v_ver;

    update public.approval_forms
       set current_version_id = v_ver,
           budget_link = case when budget_link = 'NONE' then 'SPEND_REQUIRED' else budget_link end
     where id = v_form;
  end if;

  ---------------------------------------------------------------------
  -- 법인카드 지출결의서: 근거 품의는 **선택**이다.
  --   법인카드는 품의 없이 나가는 일이 대부분이라, 필수로 두면 실제로 통과할 수 없는 문이
  --   된다(명함첩 업로드의 빈 구분과 같은 함정).
  ---------------------------------------------------------------------
  update public.approval_forms
     set budget_link = 'SPEND_OPTIONAL'
   where abbrev = '법카' and deleted_at is null and budget_link = 'NONE';

  ---------------------------------------------------------------------
  -- 예산 변경 품의: 새 양식. 대상 품의의 예산표를 이 문서의 예산표로 갈아끼운다.
  ---------------------------------------------------------------------
  if not exists (select 1 from public.approval_forms where abbrev = '예변') then
    insert into public.approval_forms (name, abbrev, category, budget_link, sort_order)
    values ('예산 변경 품의서', '예변', '품의서', 'REVISE', 1)
    returning id into v_form;

    insert into public.approval_form_versions (form_id, version_no, fields)
    values (v_form, 1, jsonb_build_array(
      jsonb_build_object('key', 'reason', 'label', '변경 사유', 'type', 'TEXTAREA',
                         'required', true),
      jsonb_build_object(
        'key', 'budget',
        'label', '변경 후 예산',
        'type', 'BUDGET_TREE',
        'required', true,
        'levels', jsonb_build_array('대분류', '중분류', '세부항목'),
        'columns', jsonb_build_array(
          jsonb_build_object('key', 'qty',       'label', '수량', 'type', 'NUMBER'),
          jsonb_build_object('key', 'unitPrice', 'label', '단가', 'type', 'MONEY'),
          jsonb_build_object('key', 'amount',    'label', '금액', 'type', 'MONEY',
                             'primaryAmount', true),
          jsonb_build_object('key', 'note',      'label', '비고', 'type', 'TEXT', 'wide', true)
        )
      )
    ))
    returning id into v_ver;

    update public.approval_forms set current_version_id = v_ver where id = v_form;
  end if;
end $$;
