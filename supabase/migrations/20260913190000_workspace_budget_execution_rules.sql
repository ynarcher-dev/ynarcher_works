-- =====================================================================
-- 워크스페이스 예산·지출 실행 규칙 — 부가세(총액 기준) · 배정 · 예약 · 취소
-- 정본: docs/docs_planning/workspace_budget_execution.md (2026-09-13 사용자 확정)
-- 선행: 20260911140000(예산·지출 연동), 20260911230000(기안 취소·삭제·결재 초기화),
--       20260910030352(보완 재상신), 20260826220000(사업 연동 원장)
--
-- 이 파일이 세우는 규칙과 그 이유
--   1) **모든 금액은 부가세 포함 합계액 기준이다.** 항목은 공급가액·부가세·합계액 셋을
--      각각 저장하고, 예산·예약·차감은 언제나 합계액 한 열만 본다. 셋 중 하나를 계산해
--      쓰지 않는 이유는 증빙에 따라 세액이 원 단위로 달라지는 일이 실제로 있기 때문이다
--      (수수료·간이과세·해외 결제). 대신 `합계액 = 공급가액 + 부가세`를 서버가 검증한다.
--
--   2) **옛 금액의 과세 유형을 추정하지 않는다.** 역할 열이 없는 양식으로 쓰인 문서는
--      합계액 하나만 가지며, 그 값을 10% 올리거나 '과세'로 단정하지 않는다. 잘못 추정한
--      세액은 조용히 결산에 섞이고, 그 값이 어디서 왔는지 나중에 아무도 답하지 못한다.
--
--   3) **배정 품의는 워크스페이스 하나에만 걸린다.** 예산표를 가진 품의가 두 사업에 걸리면
--      "이 예산이 어느 사업의 것인가"를 원장이 답하지 못하고, 두 사업의 탭이 같은 돈을
--      각자 자기 것으로 센다. 조합(FUND)도 배정 대상으로 연다.
--
--   4) **최종 승인된 배정은 바뀌지 않는다.** 결재자는 '이 사업에 이 예산'을 보고 도장을
--      찍었다. 승인 뒤 소속을 옮기면 그 판단의 대상이 사라진다.
--
--   5) **초과는 상신에서만 막는다.** 사용 가능액 = 현재 승인 예산 − 승인 지출 − 진행 중
--      예약이며, 신규 지출결의 상신이 항목별로 이를 넘으면 거절한다. 최종 승인 단계에서는
--      막지 않는다 — 예산 변경으로 잔액이 음수가 된 뒤에도 이미 흐르는 문서는 결재자가
--      판단해 끝낼 수 있어야 한다(사용자 확정).
--
--   6) **같은 근거 품의에 걸리는 상신은 직렬화한다.** 사용액을 저장하지 않으므로 잠글 행이
--      없고, 잠그지 않으면 두 지출이 같은 잔액을 동시에 읽어 둘 다 통과한다.
--
--   7) **근거 품의는 승인된 것만 쓴다. 지출이 살아 있으면 그 품의의 승인을 취소하지 못한다.**
--      순서를 뒤집으면 지출이 가리킬 배정이 사라진 채 남는다.
--
--   8) **재시도에 안전하다.** 예산 변경 적용은 이미 적용된 문서를 다시 적용하지 않고(이력
--      한 줄이 곧 멱등 키), 잠금을 잡은 뒤 다시 확인한다.
--
-- 보안 게이트 자기점검 (docs/docs_dev/11_migration_security_gate.md)
--   · 소유 워크스페이스: management(전자결재 원장). 함께 읽는 대상은 project·mna·fund.
--   · 데이터 등급: Internal(예산·지출 금액). 개인정보·Secret·파일 경로 없음.
--   · 접근 주체: 내부 사용자. 외부 게스트는 결재 원장에 닿지 않는다.
--   · Scope: 문서 단건(app.can_read_approval) / 배정 대상은 각 워크스페이스 헬퍼.
--   · **신규 테이블 없음** → 신규 RLS 정책 없음. 기존 approval_program_links의 RLS는
--     이미 켜져 있고 SELECT·INSERT·UPDATE가 분리되어 있으며 DELETE 정책은 없다(soft delete).
--     이 파일은 그 위에 트리거로 업무 규칙만 더하고 정책을 넓히지 않는다.
--   · DELETE 정책을 만들지 않는다. 물리 삭제 경로도 열지 않는다.
--   · 권한 판정은 app.* 헬퍼를 경유한다(can_read_workspace / can_access_fund /
--     can_access_ws_program / current_app_user_id). auth.jwt()를 직접 파싱하지 않는다.
--   · SECURITY DEFINER 신규 함수는 모두 `set search_path = app, public` 고정이며
--     **authenticated에 GRANT하지 않는다**(app 스키마 내부 헬퍼). 호출자 검증을 이미 마친
--     public RPC만 부른다. 새로 열리는 public RPC는 없다.
--   · 기존 public RPC 3종(save_approval_draft·recall_approval_decision·
--     withdraw_approval_document)은 최신 정의 위에 잠금·가드만 더하고 시그니처·GRANT를
--     그대로 유지한다(REVOKE/GRANT를 다시 선언해 확인한다). 재상신 RPC는 손대지 않는다.
--   · 감사 로그: 승인된 배정 품의의 최종 승인 초기화는 배정 회수라는 되돌리기 어려운
--     금전 사실이므로 audit_logs에 적재한다. 그 밖의 흐름은 approval_document_events가 갖는다.
--   · 시드·더미 데이터 없음. 실개인정보·토큰 없음.
-- =====================================================================

-- ---------------------------------------------------------------------
-- (1) 과세 유형과 세율
--
--     네 값을 두는 이유는 '부가세 0원'의 사유가 서로 다르기 때문이다 — 면세는 재화 자체가
--     면세 대상이고, 영세율은 과세 대상이나 세율이 0이며, 과세대상 아님은 애초에 부가세
--     체계 밖이다(인건비·해외 송금 등). 셋을 한 값으로 뭉치면 부가세 신고 자료를 이 원장에서
--     다시 만들 수 없다.
--
--     모르는 값과 빈 값은 null을 돌려준다 — '과세'로 되돌리지 않는다(위 결정 2).
-- ---------------------------------------------------------------------
create or replace function app.approval_vat_rate(p_kind text)
returns numeric
language sql
immutable
as $$
  select case upper(btrim(coalesce(p_kind, '')))
    when 'TAXABLE'     then 0.1
    when 'EXEMPT'      then 0
    when 'ZERO_RATED'  then 0
    when 'NOT_TAXABLE' then 0
    else null
  end;
$$;

comment on function app.approval_vat_rate(text) is
  '과세 유형의 세율. TAXABLE=0.1, EXEMPT·ZERO_RATED·NOT_TAXABLE=0, 그 밖(빈 값·모르는 값)은 '
  'null이다. null을 0이나 0.1로 되돌리지 않는 것이 "과세 유형을 추정하지 않는다"의 실체다.';

revoke all on function app.approval_vat_rate(text) from public;

-- ---------------------------------------------------------------------
-- (2) 한 표(예산표·지출 내역)에서 금액 칸이 어디인가.
--
--     화면(fields.ts amountColumns)과 같은 규칙이다.
--       · 합계액  : role='GROSS' → 없으면 대표 금액 열 → 없으면 첫 금액(MONEY) 열
--       · 공급가액: role='NET', 부가세: role='VAT', 과세 유형: type='VAT_KIND'
--       · loose_gross_key는 지출 내역이 쓰던 되돌림(첫 MONEY **또는** NUMBER 열)이다.
--         예산표와 지출 내역이 서로 다른 되돌림을 갖고 있었으므로 둘 다 보존한다 —
--         하나로 합치면 옛 양식으로 쓰인 문서의 금액이 오늘 다르게 읽힌다.
--
--     열이 하나도 역할을 갖지 않아도 한 행을 돌려준다(키가 null인 채로). 0행을 돌려주면
--     옛 양식의 행이 통째로 사라져 집계가 조용히 줄어든다.
-- ---------------------------------------------------------------------
create or replace function app.approval_amount_keys(p_field jsonb)
returns table (
  gross_key       text,
  loose_gross_key text,
  net_key         text,
  vat_key         text,
  kind_key        text,
  ref_key         text
)
language plpgsql
immutable
set search_path = app, public
as $$
declare
  c           jsonb;
  v_primary   text;
  v_first_money   text;
  v_first_numeric text;
  v_net       text;
  v_vat       text;
  v_gross     text;
  v_kind      text;
  v_ref       text;
  v_role      text;
begin
  if p_field is null or jsonb_typeof(p_field -> 'columns') <> 'array' then
    return;
  end if;

  for c in select * from jsonb_array_elements(p_field -> 'columns') loop
    if (c->>'type') = 'VAT_KIND' and v_kind is null then
      v_kind := c->>'key';
    end if;
    if (c->>'type') = 'BUDGET_REF' and v_ref is null then
      v_ref := c->>'key';
    end if;
    if (c->>'type') in ('MONEY', 'NUMBER') then
      if v_first_numeric is null then
        v_first_numeric := c->>'key';
      end if;
      if (c->>'type') = 'MONEY' and v_first_money is null then
        v_first_money := c->>'key';
      end if;
      if coalesce((c->>'primaryAmount')::boolean, false) then
        v_primary := c->>'key';
      end if;
      v_role := upper(btrim(coalesce(c->>'role', '')));
      if v_role = 'NET' and v_net is null then
        v_net := c->>'key';
      elsif v_role = 'VAT' and v_vat is null then
        v_vat := c->>'key';
      elsif v_role = 'GROSS' and v_gross is null then
        v_gross := c->>'key';
      end if;
    end if;
  end loop;

  gross_key       := coalesce(v_gross, v_primary, v_first_money);
  loose_gross_key := coalesce(v_gross, v_primary, v_first_numeric);
  net_key         := v_net;
  vat_key         := v_vat;
  kind_key        := v_kind;
  ref_key         := v_ref;
  return next;
end;
$$;

comment on function app.approval_amount_keys(jsonb) is
  '표 한 벌의 금액 칸 위치(합계액·공급가액·부가세·과세 유형·예산 줄 참조). 프론트 '
  'fields.ts amountColumns와 같은 규칙이며, 역할 열이 없는 옛 양식에서는 합계액 키만 채워진다.';

revoke all on function app.approval_amount_keys(jsonb) from public;

-- ---------------------------------------------------------------------
-- (2-1) 적혀 있는데 숫자로 읽을 수 없는 칸인가 — **빈 칸과 오타를 가른다.**
--
--       app.text_to_numeric은 둘 다 null로 돌려준다. 구분하지 않으면 `1oo원`을 적은 행이
--       '아직 쓰지 않은 행'으로 검증을 통과해 어느 예산도 깎지 않은 채 결재가 흐른다.
--       NaN·Infinity는 numeric으로 캐스팅되므로(PG 14+) 따로 걸러 낸다 — 합계에 섞이면
--       그 품의의 모든 금액이 NaN이 된다. 프론트 numeric.ts isBadNumberText와 같은 규칙이다.
-- ---------------------------------------------------------------------
create or replace function app.amount_text_bad(p_text text)
returns boolean
language sql
immutable
set search_path = app, public
as $$
  select case
           when btrim(coalesce(p_text, '')) = '' then false
           else coalesce(
                  not (app.text_to_numeric(p_text) > '-Infinity'::numeric
                       and app.text_to_numeric(p_text) < 'Infinity'::numeric),
                  true)
         end;
$$;

comment on function app.amount_text_bad is
  '적혀 있는데 수치로 읽을 수 없는 칸인가(빈 칸은 false, 오타·NaN·Infinity는 true).';

revoke all on function app.amount_text_bad(text) from public;

-- ---------------------------------------------------------------------
-- (3) 품의 예산표의 항목별 금액 — 맨 아래 줄만.
--     위층은 아래 줄들의 합이라 함께 세면 두 번 센다(20260911140000과 같은 판정).
-- ---------------------------------------------------------------------
drop function if exists app.approval_budget_item_amounts(jsonb, jsonb);
create or replace function app.approval_budget_item_amounts(p_fields jsonb, p_values jsonb)
returns table (
  line_id text, net numeric, vat numeric, gross numeric, vat_kind text,
  -- 이 양식이 부가세 칸을 갖는가. **행이 아니라 스키마가 답한다** — 행을 보고 판정하면
  -- 새 양식에서 세 칸을 다 비운 행이 옛 양식으로 오인되어 검증을 통과한다.
  split_required boolean,
  -- 적혀 있는데 읽을 수 없는 칸이 있는가(빈 행과 구분한다).
  bad_amount boolean
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
     where f.value->>'type' = 'BUDGET_TREE'
  ),
  keys as (
    select fi.field, k.gross_key, k.net_key, k.vat_key, k.kind_key
      from fields_in fi
      cross join lateral app.approval_amount_keys(fi.field) k
     where k.gross_key is not null
     order by fi.ord
     limit 1
  ),
  rows_in as (
    select row_number() over () as ord,
           e.value as row_json,
           k.gross_key, k.net_key, k.vat_key, k.kind_key
      from keys k,
           lateral jsonb_array_elements(
             case
               when jsonb_typeof(p_values -> (k.field->>'key') -> 'rows') = 'array'
                 then p_values -> (k.field->>'key') -> 'rows'
               else '[]'::jsonb
             end
           ) e
  ),
  depths as (
    select r.*, coalesce(app.text_to_numeric(r.row_json ->> 'depth'), 0)::int as depth
      from rows_in r
  ),
  leaves as (
    select d.*, lead(d.depth) over (order by d.ord) as next_depth
      from depths d
  )
  select l.row_json ->> 'id',
         case when l.net_key  is null then null
              else app.text_to_numeric(l.row_json -> 'values' ->> l.net_key) end,
         case when l.vat_key  is null then null
              else app.text_to_numeric(l.row_json -> 'values' ->> l.vat_key) end,
         app.text_to_numeric(l.row_json -> 'values' ->> l.gross_key),
         case when l.kind_key is null then null
              else nullif(btrim(coalesce(l.row_json -> 'values' ->> l.kind_key, '')), '') end,
         (l.net_key is not null or l.vat_key is not null or l.kind_key is not null),
         (app.amount_text_bad(l.row_json -> 'values' ->> l.gross_key)
          or (l.net_key is not null
              and app.amount_text_bad(l.row_json -> 'values' ->> l.net_key))
          or (l.vat_key is not null
              and app.amount_text_bad(l.row_json -> 'values' ->> l.vat_key)))
    from leaves l
   where (l.next_depth is null or l.next_depth <= l.depth)
     and coalesce(l.row_json ->> 'id', '') <> '';
$$;

comment on function app.approval_budget_item_amounts is
  '품의 예산표의 맨 아래 줄별 (줄 id, 공급가액, 부가세, 합계액, 과세 유형). 역할 열이 없는 '
  '옛 문서는 합계액만 채워지고 나머지는 null이다(추정하지 않는다).';

revoke all on function app.approval_budget_item_amounts(jsonb, jsonb) from public;

-- ---------------------------------------------------------------------
-- (4) 지출결의의 항목별 금액 — 예산 줄을 가리키는 **모든 표**를 읽는다.
--     첫 표만 읽던 종전 판정은 양식이 지출표를 둘 이상 가지는 것을 아무도 막지 않는
--     사실과 어긋났다. 둘째 표의 금액이 예약·차감에서 통째로 빠져, 검증을 통과한
--     문서가 예산을 깎지 않고 지나갔다. 같은 지출이 두 번 세어지는 일은 표가 달라도
--     행이 다르므로 생기지 않는다.
-- ---------------------------------------------------------------------
drop function if exists app.approval_spend_item_amounts(jsonb, jsonb);
create or replace function app.approval_spend_item_amounts(p_fields jsonb, p_values jsonb)
returns table (
  line_id text, net numeric, vat numeric, gross numeric, vat_kind text,
  split_required boolean,
  bad_amount boolean
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
    select fi.field, k.loose_gross_key as gross_key, k.net_key, k.vat_key, k.kind_key, k.ref_key
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
          or (k.vat_key is not null and app.amount_text_bad(r.value ->> k.vat_key)))
    from keys k,
         lateral jsonb_array_elements(
           case when jsonb_typeof(p_values -> (k.field->>'key')) = 'array'
                then p_values -> (k.field->>'key')
                else '[]'::jsonb
           end
         ) r;
$$;

comment on function app.approval_spend_item_amounts is
  '지출결의 문서의 항목별 (예산 줄 id, 공급가액, 부가세, 합계액, 과세 유형). 예산 줄 열을 '
  '가진 표를 모두 읽으며, 줄을 고르지 않은 행도 line_id=null로 돌려준다(검증이 거절한다).';

revoke all on function app.approval_spend_item_amounts(jsonb, jsonb) from public;

-- ---------------------------------------------------------------------
-- (5) 기존 두 함수는 **합계액을 돌려주는 얇은 껍데기**가 된다.
--     시그니처와 반환형이 그대로이므로 이미 이 둘을 부르는 자리(대표 금액 해석기·사용 현황·
--     예산 변경 적용)는 손대지 않는다. 규칙이 한 곳에만 살게 하는 것이 이 교체의 전부다.
-- ---------------------------------------------------------------------
create or replace function app.approval_budget_lines(p_fields jsonb, p_values jsonb)
returns table (line_id text, amount numeric)
language sql
stable
set search_path = app, public
as $$
  select a.line_id, a.gross from app.approval_budget_item_amounts(p_fields, p_values) a;
$$;

comment on function app.approval_budget_lines is
  '품의 예산표의 맨 아래 줄(줄 id, 합계액). 모든 차감·비교는 부가세 포함 합계액 기준이다. '
  '세부 칸은 app.approval_budget_item_amounts가 갖는다.';

create or replace function app.approval_spend_lines(p_fields jsonb, p_values jsonb)
returns table (line_id text, amount numeric)
language sql
stable
set search_path = app, public
as $$
  select a.line_id, a.gross
    from app.approval_spend_item_amounts(p_fields, p_values) a
   where a.line_id is not null;
$$;

comment on function app.approval_spend_lines is
  '지출결의 문서에서 (예산 줄 id, 합계액) 목록. 부가세 포함 합계액 기준이며 세부 칸은 '
  'app.approval_spend_item_amounts가 갖는다.';

-- ---------------------------------------------------------------------
-- (6) 금액 정합성 검증 — 상신 경로에서만 돈다.
--
--     임시저장을 막지 않는 이유는 작성 중인 문서가 늘 반쯤 비어 있기 때문이다. 조직에
--     내보내는 순간(상신·재상신)에만 세운다.
--
--     아무것도 적지 않은 행과 역할 열이 없는 옛 행은 통과시킨다 — 검증이 옛 문서를
--     인질로 잡으면 그 문서를 고칠 길도 함께 막힌다.
-- ---------------------------------------------------------------------
create or replace function app.assert_approval_amounts(p_fields jsonb, p_values jsonb)
returns void
language plpgsql
stable
set search_path = app, public
as $$
declare
  r      record;
  v_rate numeric;
begin
  for r in
    select false as is_spend, a.line_id, a.net, a.vat, a.gross, a.vat_kind,
           a.split_required, a.bad_amount
      from app.approval_budget_item_amounts(p_fields, p_values) a
    union all
    select true, b.line_id, b.net, b.vat, b.gross, b.vat_kind, b.split_required, b.bad_amount
      from app.approval_spend_item_amounts(p_fields, p_values) b
  loop
    -- 빈 행 판정보다 **먼저** 본다 — 오타는 모두 null로 읽혀 '안 쓴 행'으로 빠져나간다.
    if coalesce(r.bad_amount, false) then
      raise exception '금액을 숫자로 읽을 수 없습니다(항목 %). 숫자만 적어 주세요.', r.line_id
        using errcode = '23514';
    end if;

    -- 아무 숫자도 적히지 않은 행은 아직 쓰지 않은 행이다.
    if r.net is null and r.vat is null and r.gross is null then
      continue;
    end if;

    -- 금액이 적힌 지출 행은 반드시 예산 줄을 가리켜야 한다. 비워 두면 어느 예산도 깎지 않는다.
    if r.is_spend and r.line_id is null then
      raise exception '지출 항목에 예산 줄을 선택해 주세요.' using errcode = '23502';
    end if;

    -- 부가세 칸이 없는 옛 양식 — 합계액 하나만 있다. 유효 금액만 본다.
    if not r.split_required then
      if r.gross < 0 then
        raise exception '금액은 0원 이상이어야 합니다(항목 %).', r.line_id using errcode = '23514';
      end if;
      continue;
    end if;

    if r.net is null or r.vat is null or r.gross is null then
      raise exception '공급가액·부가세·합계액을 모두 입력해 주세요(항목 %).', r.line_id
        using errcode = '23514';
    end if;
    if r.net < 0 or r.vat < 0 or r.gross < 0 then
      raise exception '금액은 0원 이상이어야 합니다(항목 %).', r.line_id using errcode = '23514';
    end if;

    -- 과세 유형 칸이 없는 양식도 있으므로 **적혀 있을 때만** 본다. 적혀 있는데 모르는 값이면
    -- 그 칸이 뜻을 잃은 것이라 통과시키지 않는다(빈 값으로 되돌리지도 않는다).
    if r.vat_kind is not null then
      v_rate := app.approval_vat_rate(r.vat_kind);
      if v_rate is null then
        raise exception '항목의 과세 유형이 올바르지 않습니다(항목 %). 과세·면세·영세율·과세대상 아님 중 하나여야 합니다.',
          r.line_id using errcode = '23514';
      end if;
      -- 세율이 0인 유형에 세액이 붙어 있으면 둘 중 하나가 틀린 것이다. 어느 쪽인지 서버가
      -- 정할 수 없으므로 고르게 돌려보낸다.
      if v_rate = 0 and r.vat <> 0 then
        raise exception '부가세가 없는 과세 유형인데 세액이 적혀 있습니다(항목 %).', r.line_id
          using errcode = '23514';
      end if;
    end if;
    -- 증빙에 따른 세액 수정을 허용하므로 공급가액×세율을 강제하지 않는다. 다만 합계가
    -- 맞지 않으면 어느 숫자로 예산을 깎아야 하는지 알 수 없다.
    if r.gross <> r.net + r.vat then
      raise exception '합계액이 공급가액+부가세와 다릅니다(항목 %).', r.line_id
        using errcode = '23514';
    end if;
  end loop;
end;
$$;

comment on function app.assert_approval_amounts is
  '문서의 예산·지출 항목 금액 정합성(숫자로 읽히는 값 · 예산 줄 참조 · 세 칸 모두 입력 · 0원 이상 · '
  '과세 유형 유효 · 세율 0이면 세액 0 · 합계액=공급가액+부가세). 부가세 칸이 없는 옛 양식과 '
  '정말 빈 행만 통과한다.';

revoke all on function app.assert_approval_amounts(jsonb, jsonb) from public;

-- ---------------------------------------------------------------------
-- (7) 사용 현황에 '이 문서는 빼고' 축을 더한다.
--
--     보완 재상신은 문서가 이미 REVISION_REQUIRED(= 진행 중 예약으로 세는 상태)라서,
--     자기 자신을 빼지 않으면 자기 예약과 자기 신청을 겹쳐 세어 늘 초과로 읽힌다.
--     사용액은 여전히 저장하지 않는다 — 20260911140000의 판단을 그대로 잇는다.
-- ---------------------------------------------------------------------
create or replace function app.approval_budget_usage_ex(
  p_document_id         uuid,
  p_exclude_document_id uuid
)
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
     and (p_exclude_document_id is null or d.id <> p_exclude_document_id)
     and coalesce(s.line_id, '') <> ''
   group by s.line_id;
$$;

comment on function app.approval_budget_usage_ex is
  '품의 한 건의 예산 줄별 사용액·예약액. 두 번째 인자로 받은 문서는 집계에서 뺀다(상신하려는 '
  '문서가 자기 예약을 자기 잔액에서 두 번 빼지 않게 한다). 호출자 검증이 없으므로 '
  'authenticated에 열지 않는다.';

revoke all on function app.approval_budget_usage_ex(uuid, uuid) from public;

-- 기존 함수는 '빼는 문서 없음'으로 위임한다. 규칙이 두 벌로 갈리지 않게 한다.
create or replace function app.approval_budget_usage(p_document_id uuid)
returns table (line_id text, spent numeric, pending numeric)
language sql
stable
security definer
set search_path = app, public
as $$
  select u.line_id, u.spent, u.pending
    from app.approval_budget_usage_ex(p_document_id, null) u;
$$;

comment on function app.approval_budget_usage is
  '품의 한 건의 예산 줄별 사용액(승인 완료)과 예약액(결재 중). 저장하지 않고 매번 집계한다. '
  'public.approval_budget_status가 게이트를 지나 이 함수를 부른다.';

revoke all on function app.approval_budget_usage(uuid) from public;

-- ---------------------------------------------------------------------
-- (8) 지출결의 상신 검증 — 근거 품의 · 항목 존재 · 항목별 초과.
--
--     **최종 승인이 아니라 상신에서만 막는다**(사용자 확정). 잠금은 근거 품의 단위로 잡아
--     같은 품의에 걸리는 상신을 줄 세운다 — 사용액을 저장하지 않아 잠글 행이 없으므로
--     자문 잠금이 유일한 직렬화 수단이다.
-- ---------------------------------------------------------------------
-- 품의 하나에 걸리는 모든 판정(지출 상신·배정 취소·예산 변경 적용)이 **같은 잠금**을 잡는다.
-- 각자 다른 키로 잠그면 "지출을 올리는 중에 배정이 걷히는" 창이 그대로 남는다.
create or replace function app.lock_budget_source(p_document_id uuid)
returns void
language sql
as $$
  select pg_advisory_xact_lock(
    hashtextextended('approval_budget_source:' || p_document_id::text, 0)
  );
$$;

revoke all on function app.lock_budget_source(uuid) from public;

drop function if exists app.assert_budget_spend_submittable(uuid);

-- 인자로 값을 받는 이유는 BEFORE 트리거가 **아직 기록되지 않은 NEW**를 검증하기 때문이다.
-- 문서 id로 다시 읽으면 방금 고친 값이 아니라 직전 값을 본다.
create or replace function app.assert_budget_spend_submittable(
  p_document_id        uuid,
  p_form_id            uuid,
  p_form_version_id    uuid,
  p_field_values       jsonb,
  p_budget_document_id uuid
)
returns void
language plpgsql
security definer
set search_path = app, public
as $$
declare
  v_source     uuid := p_budget_document_id;
  v_link       text;
  v_fields     jsonb;
  v_values     jsonb := coalesce(p_field_values, '{}'::jsonb);
  v_src_status public.approval_status;
  v_src_link   text;
  v_src_fields jsonb;
  v_src_values jsonb;
  r            record;
  v_t_net      text;
  v_t_vat      text;
  v_c_net      text;
  v_c_vat      text;
  v_budget     numeric;
  v_used       numeric;
  v_avail      numeric;
  v_links      integer;
begin
  select f.budget_link into v_link from public.approval_forms f where f.id = p_form_id;
  select v.fields into v_fields
    from public.approval_form_versions v where v.id = p_form_version_id;

  -- 양식 버전이 붙지 않은 문서(이관 복원본 등)는 검증할 표가 없다.
  if v_fields is null then
    return;
  end if;

  -- 금액 정합성은 근거 품의가 있든 없든 본다(품의서 자신의 예산표도 여기서 걸린다).
  perform app.assert_approval_amounts(v_fields, v_values);

  -- **예산을 배정하는 품의는 워크스페이스 한 곳에 걸린 뒤에만 상신된다.**
  -- 트리거(11)는 '둘 이상 걸지 못한다'까지만 말하고 0건은 막지 못한다 — 화면만 강제하면
  -- 직접 INSERT·UPDATE로 배정 없는 승인 품의가 서고, 그 예산은 어느 사업에도 잡히지 않은 채
  -- 지출만 받는다. 배정 품의의 정의는 (11)과 같다: 예산표 보유 + budget_link <> 'REVISE'.
  if coalesce(v_link, 'NONE') <> 'REVISE'
     and exists (select 1 from app.approval_budget_keys(v_fields)) then
    select count(*) into v_links
      from public.approval_program_links l
     where l.document_id = p_document_id
       and l.deleted_at is null;
    if v_links <> 1 then
      raise exception '예산을 배정하는 품의는 사업 워크스페이스 한 곳에 연결한 뒤 상신할 수 있습니다.'
        using errcode = '23502';
    end if;
  end if;

  if coalesce(v_link, 'NONE') = 'SPEND_REQUIRED' and v_source is null then
    raise exception '이 양식은 근거 품의가 필요합니다.' using errcode = '22023';
  end if;
  if v_source is null then
    return;
  end if;

  perform app.lock_budget_source(v_source);

  select d.status, coalesce(sf.budget_link, 'NONE'), v.fields, d.field_values
    into v_src_status, v_src_link, v_src_fields, v_src_values
    from public.approval_documents d
    join public.approval_form_versions v on v.id = d.form_version_id
    left join public.approval_forms sf on sf.id = d.form_id
   where d.id = v_source and d.deleted_at is null;

  if not found then
    raise exception '근거 품의를 찾을 수 없습니다.' using errcode = 'P0002';
  end if;
  -- 승인된 품의만 근거가 된다 — 흐르는 중인 예산은 결재 도중 바뀌어 차감의 근거가 흔들린다.
  if v_src_status <> 'APPROVED' then
    raise exception '근거 품의가 최종 승인되지 않았습니다.' using errcode = '42501';
  end if;
  -- 근거는 **원 배정 품의**다. 변경 품의도 예산표를 갖지만 그 금액은 원 품의에 이미
  -- 반영되어 있어, 다시 근거로 삼으면 같은 돈을 두 번 쓴다.
  if v_src_link = 'REVISE' then
    raise exception '예산 변경 품의는 근거 품의가 될 수 없습니다.' using errcode = '42501';
  end if;

  -- 예산 변경 품의(대상 품의를 가리키는 문서)는 잔액을 쓰는 것이 아니라 예산을 바꾸는 것이라
  -- 초과 검사를 받지 않는다. 무엇을 하는 문서인지는 양식의 budget_link가 답한다.
  if coalesce(v_link, 'NONE') = 'REVISE' then
    -- 다만 **표현할 수 없는 변경안은 막는다.** 대상이 공급가액·부가세 칸을 가진 양식인데
    -- 변경 양식에 그 칸이 없으면, 적용하는 순간 대상에 적힌 부가세가 조용히 지워진다.
    select k.net_key, k.vat_key into v_t_net, v_t_vat
      from app.approval_amount_keys(app.approval_budget_field(v_src_fields)) k;
    select k.net_key, k.vat_key into v_c_net, v_c_vat
      from app.approval_amount_keys(app.approval_budget_field(v_fields)) k;
    if (v_t_net is not null and v_c_net is null)
       or (v_t_vat is not null and v_c_vat is null) then
      raise exception
        '대상 품의는 공급가액·부가세 칸을 쓰는 양식입니다. 같은 칸을 가진 예산 변경 양식으로 작성해 주세요.'
        using errcode = '23514';
    end if;
    return;
  end if;

  for r in
    select s.line_id, sum(s.amount) as amount
      from app.approval_spend_lines(v_fields, v_values) s
     where coalesce(s.line_id, '') <> ''
     group by s.line_id
  loop
    select b.amount into v_budget
      from app.approval_budget_lines(v_src_fields, v_src_values) b
     where b.line_id = r.line_id;
    if not found then
      raise exception '근거 품의에 없는 예산 항목입니다(항목 %).', r.line_id using errcode = '23503';
    end if;

    select coalesce(u.spent, 0) + coalesce(u.pending, 0) into v_used
      from app.approval_budget_usage_ex(v_source, p_document_id) u
     where u.line_id = r.line_id;

    v_avail := coalesce(v_budget, 0) - coalesce(v_used, 0);
    if coalesce(r.amount, 0) > v_avail then
      raise exception
        '예산 항목의 사용 가능액을 초과합니다(항목 %, 사용 가능 %원, 신청 %원).',
        r.line_id,
        to_char(v_avail, 'FM999,999,999,999,990'),
        to_char(coalesce(r.amount, 0), 'FM999,999,999,999,990')
        using errcode = '23514';
    end if;
  end loop;
end;
$$;

comment on function app.assert_budget_spend_submittable is
  '상신 직전 검증 — 금액 정합성, 배정 품의의 워크스페이스 연결 정확히 1건, 근거 품의 필수·승인 '
  '여부, 예산 항목 존재, 항목별 사용 가능액 '
  '초과. 값은 인자로 받는다(BEFORE 트리거가 기록 전 NEW를 검증한다). 근거 품의 단위 잠금으로 '
  '동시 상신·배정 취소를 줄 세우며, 최종 승인 단계에서는 다시 검사하지 않는다.';

revoke all on function app.assert_budget_spend_submittable(uuid, uuid, uuid, jsonb, uuid)
  from public;

-- ---------------------------------------------------------------------
-- (9) 살아 있는 지출이 있으면 그 품의의 승인을 되돌리지 못한다.
-- ---------------------------------------------------------------------
create or replace function app.assert_no_active_budget_children(p_document_id uuid)
returns void
language plpgsql
security definer
set search_path = app, public
as $$
declare
  v_count integer;
begin
  -- 지출 상신과 같은 잠금이다 — 다른 키로 잠그면 상신 중에 배정이 걷히는 창이 남는다.
  perform app.lock_budget_source(p_document_id);

  select count(*) into v_count
    from public.approval_documents d
    left join public.approval_forms f on f.id = d.form_id
   where d.budget_document_id = p_document_id
     and d.deleted_at is null
     and d.status in ('PENDING', 'IN_REVIEW', 'REVISION_REQUIRED', 'APPROVED')
     -- **끝난 예산 변경은 세지 않는다.** 이미 적용된 변경은 지금 예산표 안에 녹아 있는
     -- 이력이지 살아 있는 지출이 아니다. 세면 한 번이라도 예산을 고친 품의는 영원히
     -- 취소할 수 없게 된다. 아직 흐르는 변경 문서는 그대로 막는다.
     and not (
       coalesce(f.budget_link, 'NONE') = 'REVISE'
       and d.status = 'APPROVED'
     );

  if v_count > 0 then
    raise exception
      '이 품의를 근거로 하는 지출·변경 문서 %건이 남아 있어 승인을 취소할 수 없습니다. 먼저 그 문서들을 회수하거나 취소해 주세요.',
      v_count using errcode = '23504';
  end if;
end;
$$;

comment on function app.assert_no_active_budget_children is
  '이 품의를 근거로 하는 살아 있는 지출/흐르는 변경 문서가 있으면 예외를 던진다. 이미 적용이 '
  '끝난 예산 변경 이력은 세지 않는다. 지출 상신과 같은 자문 잠금을 공유한다.';

revoke all on function app.assert_no_active_budget_children(uuid) from public;

-- ---------------------------------------------------------------------
-- (10) 배정 대상에 조합(FUND)을 더한다.
--
--      CHECK를 넓히는 것만으로는 열리지 않는다 — 쓰기 정책이 app.can_link_entity_target을
--      경유하므로 그 함수가 'fund'에 false를 돌려주는 한 INSERT는 막힌다. 둘을 같은
--      마이그레이션에서 함께 연다.
-- ---------------------------------------------------------------------
create or replace function app.can_link_entity_target(p_target_type text, p_target_id uuid)
returns boolean
language sql
stable
security definer
set search_path = app, public
as $$
  select case p_target_type
    when 'program' then
      app.can_read_workspace('ac') and app.can_access_ws_program('ac', p_target_id)
      and exists (select 1 from public.programs x
                   where x.id = p_target_id and x.deleted_at is null)
    when 'ma_program' then
      app.can_read_workspace('mna') and app.can_access_ws_program('mna', p_target_id)
      and exists (select 1 from public.ma_programs x
                   where x.id = p_target_id and x.deleted_at is null)
    when 'fund' then
      -- 조합 원장의 SELECT 정책을 그대로 재현한다(20260705170000).
      app.can_read_workspace('fund') and app.can_access_fund(p_target_id)
      and exists (select 1 from public.funds x
                   where x.id = p_target_id and x.deleted_at is null)
    when 'startup' then
      app.can_read_workspace('networks')
      and exists (select 1 from public.startups x
                   where x.id = p_target_id and x.deleted_at is null)
    when 'network' then
      app.can_read_workspace('networks')
      and exists (select 1 from public.networks x
                   where x.id = p_target_id and x.deleted_at is null and x.merged_into_id is null)
    -- 기밀 M&A 게시글은 워크스페이스 열람권이 아니라 본문 열람권을 묻는다(20260911224000).
    when 'ma_buyer' then app.can_read_ma_party('ma_buyer', p_target_id)
    when 'ma_seller' then app.can_read_ma_party('ma_seller', p_target_id)
    else false
  end;
$$;

revoke all on function app.can_link_entity_target(text, uuid) from public, anon;
grant execute on function app.can_link_entity_target(text, uuid) to authenticated;

comment on function app.can_link_entity_target(text, uuid) is
  '요청자가 연동 대상 원장 행을 열람 가능한가(각 원장 SELECT 정책 재현 + 소프트삭제·미존재 배제). '
  '회의록 연동·결재 워크스페이스 배정이 공유한다. 20260911224000 정본에 조합(fund) 갈래만 더했다.';

alter table public.approval_program_links
  drop constraint if exists approval_program_links_target_type_check;
alter table public.approval_program_links
  add constraint approval_program_links_target_type_check
  check (target_type = any (array['program'::text, 'ma_program'::text, 'fund'::text]));

-- ---------------------------------------------------------------------
-- (11) 배정 규칙 — **예산을 배정하는 품의만** 워크스페이스 하나, 그 배정은 승인 뒤 불변.
--
--      RLS 정책이 아니라 트리거인 이유는 이것이 **누가 할 수 있는가**가 아니라 **무엇이
--      성립하는가**이기 때문이다. 정책으로 쓰면 같은 판정을 INSERT·UPDATE 두 벌로 적어야
--      하고, 조건을 만족하지 못한 행이 '권한 없음'으로 보여 이유를 말하지 못한다.
--
--      두 규칙 모두 배정 품의에만 건다. 일반 결재는 여러 사업에 걸쳐 있는 것이 정상이고,
--      예산 변경(REVISE) 품의는 대상 품의가 이미 워크스페이스를 쥐고 있어 스스로 배정을
--      독점할 이유가 없다. 승인된 일반 문서에 뒤늦게 참조를 더하는 일도 막지 않는다.
-- ---------------------------------------------------------------------
create or replace function app.check_approval_program_link_rules()
returns trigger
language plpgsql
security definer
set search_path = app, public
as $$
declare
  v_status    public.approval_status;
  v_allocates boolean;
  v_other     integer;
begin
  -- 배정 품의의 정의: 예산표(BUDGET_TREE)를 가지고, 남의 예산을 고치는 변경 품의가 아닌 것.
  select d.status,
         exists (
           select 1
             from public.approval_form_versions v
             cross join lateral app.approval_budget_keys(v.fields) k
            where v.id = d.form_version_id
         )
         and coalesce(f.budget_link, 'NONE') <> 'REVISE'
    into v_status, v_allocates
    from public.approval_documents d
    left join public.approval_forms f on f.id = d.form_id
   where d.id = NEW.document_id;

  if not found then
    return NEW;
  end if;

  -- 최종 승인된 배정 품의의 배정은 걸지도, 옮기지도, 떼지도 못한다 — 그 워크스페이스의
  -- 예산 총액이 이 한 줄에 달려 있기 때문이다.
  -- INSERT 분기를 따로 두는 이유는 그 경우 OLD가 배정되지 않아 참조하는 순간 죽기 때문이다.
  if v_status = 'APPROVED' and coalesce(v_allocates, false) then
    if TG_OP = 'INSERT' then
      raise exception '최종 승인된 예산 배정 품의에는 워크스페이스 배정을 새로 걸 수 없습니다.'
        using errcode = '42501';
    elsif NEW.target_type is distinct from OLD.target_type
       or NEW.target_id   is distinct from OLD.target_id
       or NEW.deleted_at  is distinct from OLD.deleted_at
    then
      raise exception '최종 승인된 예산 배정 품의의 워크스페이스 배정은 바꿀 수 없습니다.'
        using errcode = '42501';
    end if;
  end if;

  if coalesce(v_allocates, false) and NEW.deleted_at is null then
    -- 조건부 유일성이라 부분 유니크 인덱스로 세울 수 없다('예산표를 가진 문서인가'는
    -- 이 표의 열이 아니다). 동시 삽입 둘이 서로를 못 보는 창을 자문 잠금으로 닫는다.
    perform pg_advisory_xact_lock(
      hashtextextended('approval_program_link:' || NEW.document_id::text, 0)
    );
    select count(*) into v_other
      from public.approval_program_links l
     where l.document_id = NEW.document_id
       and l.deleted_at is null
       and l.id <> NEW.id;
    if v_other > 0 then
      raise exception '예산을 배정하는 품의는 워크스페이스 한 곳에만 연결할 수 있습니다.'
        using errcode = '23505';
    end if;
  end if;

  return NEW;
end;
$$;

comment on function app.check_approval_program_link_rules is
  '워크스페이스 배정 규칙 — 예산을 배정하는 품의(예산표 보유, budget_link<>REVISE)만 한 곳에 '
  '묶이고 승인 뒤 배정이 불변이다. 일반 결재와 예산 변경 품의는 여러 곳에 연결할 수 있다.';

revoke all on function app.check_approval_program_link_rules() from public;

drop trigger if exists trg_approval_program_links_rules on public.approval_program_links;
create trigger trg_approval_program_links_rules
  before insert or update on public.approval_program_links
  for each row execute function app.check_approval_program_link_rules();

-- ---------------------------------------------------------------------
-- (11-1) 예산표를 다른 양식의 열 구성으로 옮긴다.
--
--       변경 품의와 대상 품의가 **같은 양식이라는 보장이 없다**. 값을 그대로 베끼면
--       금액 열 key가 다른 순간 대상 품의의 예산이 통째로 0이 된다(줄 id는 남는데
--       금액이 어느 칸에도 없다). 그래서 자리를 역할로 맞춘다 — 합계액→합계액,
--       공급가액→공급가액, 부가세→부가세, 과세 유형→과세 유형.
--       화면 budgetRemap.ts가 반대 방향(대상 → 변경)에 같은 규칙을 쓴다.
--
--       **없는 칸은 만들지 않는다.** 대상에 공급가액 칸이 없으면 그 값은 버린다.
-- ---------------------------------------------------------------------
create or replace function app.approval_budget_field(p_fields jsonb)
returns jsonb
language sql
immutable
set search_path = app, public
as $$
  select f
    from app.approval_budget_keys(p_fields) k
    cross join lateral jsonb_array_elements(
      case when jsonb_typeof(p_fields) = 'array' then p_fields else '[]'::jsonb end
    ) f
   where f->>'key' = k.field_key
   limit 1;
$$;

comment on function app.approval_budget_field(jsonb) is
  '양식 스키마에서 예산표 필드 정의(열 목록 포함)를 통째로 꺼낸다. 예산표가 없으면 null.';

revoke all on function app.approval_budget_field(jsonb) from public;

create or replace function app.approval_budget_remap(p_from jsonb, p_to jsonb, p_value jsonb)
returns jsonb
language plpgsql
immutable
set search_path = app, public
as $$
declare
  v_fg text; v_fn text; v_fv text; v_fk text;
  v_tg text; v_tn text; v_tv text; v_tk text;
  v_to_keys   text[];
  v_role_keys text[];
  v_rows   jsonb := '[]'::jsonb;
  v_row    jsonb;
  v_values jsonb;
  v_pair   text[];
  k        text;
begin
  -- 어느 한쪽이라도 열 구성을 모르면 손대지 않는다(옛 동작 그대로 베낀다).
  if p_value is null or jsonb_typeof(p_value -> 'rows') <> 'array'
     or jsonb_typeof(p_from -> 'columns') <> 'array'
     or jsonb_typeof(p_to -> 'columns') <> 'array' then
    return p_value;
  end if;

  select gross_key, net_key, vat_key, kind_key into v_fg, v_fn, v_fv, v_fk
    from app.approval_amount_keys(p_from);
  select gross_key, net_key, vat_key, kind_key into v_tg, v_tn, v_tv, v_tk
    from app.approval_amount_keys(p_to);

  select coalesce(array_agg(c->>'key'), '{}'::text[]) into v_to_keys
    from jsonb_array_elements(p_to -> 'columns') c;
  v_role_keys := array_remove(array[v_fg, v_fn, v_fv, v_fk], null);

  for v_row in select * from jsonb_array_elements(p_value -> 'rows') loop
    v_values := '{}'::jsonb;
    -- 역할 없는 칸(수량·단가·비고)은 key가 대상에도 있을 때만 따라간다.
    for k in select key from jsonb_each(coalesce(v_row -> 'values', '{}'::jsonb)) loop
      if k = any(v_to_keys) and not (k = any(v_role_keys)) then
        v_values := v_values || jsonb_build_object(k, v_row -> 'values' -> k);
      end if;
    end loop;
    foreach v_pair slice 1 in array array[
      array[v_fg, v_tg], array[v_fn, v_tn], array[v_fv, v_tv], array[v_fk, v_tk]
    ] loop
      if v_pair[1] is not null and v_pair[2] is not null
         and (v_row -> 'values') ? v_pair[1] then
        v_values := v_values || jsonb_build_object(v_pair[2], v_row -> 'values' -> v_pair[1]);
      end if;
    end loop;
    -- 줄 id·층·이름은 건드리지 않는다 — id가 바뀌면 나간 지출이 가리킬 자리가 사라진다.
    v_rows := v_rows || jsonb_build_array(v_row || jsonb_build_object('values', v_values));
  end loop;

  return p_value || jsonb_build_object('rows', v_rows);
end;
$$;

comment on function app.approval_budget_remap(jsonb, jsonb, jsonb) is
  '예산표 값을 다른 양식의 열 key로 옮긴다(금액 역할끼리 맞추고, 대상에 없는 칸은 버린다). '
  '화면 budgetRemap.ts와 같은 규칙이며 공급가액·부가세를 추정해 채우지 않는다.';

revoke all on function app.approval_budget_remap(jsonb, jsonb, jsonb) from public;

-- ---------------------------------------------------------------------
-- (12) 예산 변경 적용을 재시도에 안전하게.
--
--      본문은 20260911140000과 같고 세 가지만 더한다 — 이미 적용된 변경 문서는 아무 일도
--      하지 않고 돌아가고(이력 한 줄이 곧 멱등 키), 대상 품의 단위로 잠근 뒤 다시 확인하며,
--      열 구성이 다른 양식이면 (11-1)로 자리를 옮겨 적는다.
--      종전에는 `on conflict do nothing`이 이력만 막고 예산표는 이미 덮어쓴 뒤였다.
--
--      **예상 잔액이 음수여도 막지 않는다**(사용자 확정). 막는 것은 둘 —
--      이미 지출이 걸린 줄을 없애는 것과, 옮겨 적은 결과가 대상 양식의 공급가액·부가세
--      칸을 비워 버리는 것이다(후자는 적용 직전에 결과를 놓고 다시 확인한다).
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
  v_applied       jsonb;
  v_seq           integer;
begin
  -- 멱등: 이 변경 문서는 한 번만 적용된다.
  if exists (
    select 1 from public.approval_budget_revisions
     where change_document_id = p_change_document_id
  ) then
    return;
  end if;

  select d.budget_document_id, v.fields, d.field_values
    into v_target, v_change_fields, v_change_values
    from public.approval_documents d
    join public.approval_form_versions v on v.id = d.form_version_id
   where d.id = p_change_document_id and d.deleted_at is null;

  if v_target is null then
    raise exception '예산 변경 품의에 대상 품의가 지정되어 있지 않습니다.' using errcode = '22023';
  end if;

  -- 지출 상신·배정 취소와 같은 잠금으로 줄 세우고, 잠근 뒤 멱등 확인을 다시 한다.
  perform app.lock_budget_source(v_target);
  if exists (
    select 1 from public.approval_budget_revisions
     where change_document_id = p_change_document_id
  ) then
    return;
  end if;

  select field_key into v_change_key from app.approval_budget_keys(v_change_fields);
  if v_change_key is null then
    raise exception '예산 변경 품의에 예산표가 없습니다.' using errcode = '22023';
  end if;

  select v.fields, d.field_values into v_target_fields, v_target_values
    from public.approval_documents d
    join public.approval_form_versions v on v.id = d.form_version_id
   where d.id = v_target and d.deleted_at is null
   for update of d;

  select field_key into v_target_key from app.approval_budget_keys(v_target_fields);
  if v_target_key is null then
    raise exception '대상 문서가 예산표를 가진 품의가 아닙니다.' using errcode = '22023';
  end if;

  -- **막는 것은 이것 하나다.** 이미 지출이 걸린 줄이 새 예산표에서 사라지면 그 지출이
  -- 가리킬 자리가 없어진다(금액을 줄이는 것은 막지 않는다 — 음수로 두고 결재자가 본다).
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

  -- 열 key가 다른 양식으로 변경안을 올렸어도 금액이 대상 양식의 제자리에 앉는다.
  v_applied := app.approval_budget_remap(
    app.approval_budget_field(v_change_fields),
    app.approval_budget_field(v_target_fields),
    coalesce(v_change_values -> v_change_key, '{}'::jsonb)
  );

  -- 상신 검증이 양식끼리의 호환을 이미 보지만, 그것은 **양식**을 본 것이고 여기서 보는 것은
  -- **결과**다. 옮겨 적은 예산표가 대상 양식의 규칙(세 칸 모두 · 합계=공급가액+부가세)을
  -- 어기면 적용하지 않는다 — 반쯤 비어 버린 예산표를 승인 시점에 만들어 두면 그 품의는
  -- 이후 어느 화면에서도 다시 저장되지 않는다. 예산표 한 칸만 놓고 본다(대상 문서의 다른
  -- 칸이 옛 규칙으로 들어와 있어도 변경 적용을 인질로 잡지 않는다).
  perform app.assert_approval_amounts(
    jsonb_build_array(app.approval_budget_field(v_target_fields)),
    jsonb_build_object(v_target_key, v_applied)
  );

  update public.approval_documents
     set field_values = jsonb_set(
           coalesce(field_values, '{}'::jsonb),
           array[v_target_key],
           v_applied,
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
  '예산 변경 품의가 최종 승인될 때 대상 품의의 예산표를 갈아끼우고 이력을 남긴다. 열 구성이 다르면 '
  '역할끼리 옮겨 적고 그 결과를 대상 양식 규칙으로 다시 검증한다. 이미 적용된 변경 문서는 아무 일도 '
  '하지 않는다(재시도 안전). 잔액이 음수가 되는 변경도 막지 않는다.';

revoke all on function app.apply_approval_budget_revision(uuid) from public;

-- ---------------------------------------------------------------------
-- (13) 상신 검증은 **문서 원장의 트리거**가 건다.
--
--      RPC 두 곳에만 걸지 않는 이유는 상신에 이르는 길이 그 둘이 아니기 때문이다 —
--      신규 기안은 INSERT로 서고, 상태는 그 뒤 UPDATE로 바뀌며, 기안자에게는
--      approval_docs_update 정책이 열려 있어 PostgREST로 직접 PENDING을 쏠 수도 있다.
--      들어가는 문 하나(상태가 흐름으로 바뀌는 순간)에 걸면 세 경로가 한 번에 닫힌다.
--
--      **상신은 기안자 상태에서 나올 때뿐이다.** 결재 진행(PENDING→IN_REVIEW)도, 승인
--      취소(APPROVED→진행 중)도 상신이 아니다. 초과는 상신에서만 막는다는 확정 정책이
--      여기서 지켜진다.
-- ---------------------------------------------------------------------
create or replace function app.check_approval_submission()
returns trigger
language plpgsql
security definer
set search_path = app, public
as $$
begin
  if NEW.status not in ('PENDING', 'IN_REVIEW') then
    return NEW;
  end if;
  -- 상신은 기안자 손에 있던 문서가 흐름에 들어서는 때뿐이다. 결재 진행과 승인 취소
  -- (APPROVED → 진행 중)는 상신이 아니므로 초과 검사를 걸지 않는다 — 걸면 예산이 줄어든
  -- 뒤에는 승인 취소가 영구히 막힌다.
  if TG_OP = 'UPDATE' and OLD.status not in ('DRAFT', 'REVISION_REQUIRED', 'REJECTED') then
    return NEW;
  end if;
  if NEW.deleted_at is not null then
    return NEW;
  end if;

  perform app.assert_budget_spend_submittable(
    NEW.id, NEW.form_id, NEW.form_version_id, NEW.field_values, NEW.budget_document_id
  );
  return NEW;
end;
$$;

comment on function app.check_approval_submission is
  '기안 상태(DRAFT·REVISION_REQUIRED·REJECTED)나 신규 INSERT로 흐름에 들어설 때만 예산·금액 '
  '검증을 건다. 결재 진행과 승인 취소는 통과시킨다 — 초과는 상신에서만 막는다.';

revoke all on function app.check_approval_submission() from public;

drop trigger if exists trg_approval_documents_submission on public.approval_documents;
create trigger trg_approval_documents_submission
  before insert or update of status, field_values, form_version_id, budget_document_id
  on public.approval_documents
  for each row execute function app.check_approval_submission();

-- ---------------------------------------------------------------------
-- (14) 상신 RPC 두 곳은 **상태를 읽을 때부터 행을 잠근다.**
--      본문은 20260911230000 · 20260910030352와 같고 `for update` 한 줄만 더한다 —
--      같은 문서에 두 호출이 겹치면 둘 다 DRAFT를 보고 둘 다 상신한다.
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
   where id = p_document_id and deleted_at is null
   for update;

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
  'DRAFT만 통과하며 상신 검증은 문서 원장 트리거가 건다(경로가 이 함수 하나가 아니다).';

revoke all on function public.save_approval_draft(
  uuid, text, uuid, uuid, jsonb, uuid, jsonb, uuid[], boolean, uuid
) from public, anon, service_role;
grant execute on function public.save_approval_draft(
  uuid, text, uuid, uuid, jsonb, uuid, jsonb, uuid[], boolean, uuid
) to authenticated;

-- 재상신 RPC는 손대지 않는다. 최신 정의(20260910170314)가 이미 `for update`로 잠그고
-- 최종 승인 초기화(REJECTED) 재상신 분기를 갖는다 — 옛 본문으로 다시 쓰면 그 분기가 사라져
-- 초기화된 문서를 기안자가 되살릴 수 없게 된다. 예산 검증은 그 함수의 상태 UPDATE를
-- 아래 트리거가 받는다.

-- ---------------------------------------------------------------------
-- (14) 취소 경로에 '살아 있는 지출' 가드를 잇는다.
--      본문은 20260911230000과 같고, 배정을 걷는 두 자리에만 한 줄씩 더한다.
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
  if v_status not in ('PENDING', 'IN_REVIEW', 'REVISION_REQUIRED') then
    raise exception 'only a document in progress may be withdrawn' using errcode = '42501';
  end if;
  if exists (
    select 1 from public.approval_legacy_documents where document_id = p_document_id
  ) then
    raise exception 'an imported document may not be withdrawn' using errcode = '42501';
  end if;
  -- 이 문서를 근거로 하는 지출이 살아 있으면 되가져오지 못한다. 흐르는 중인 품의에는
  -- 원래 지출이 걸릴 수 없지만(근거는 승인된 품의만), 결재 초기화로 되돌아온 품의에는
  -- 이미 걸린 지출이 남아 있다 — 그때 이 가드가 유일한 문이다.
  perform app.assert_no_active_budget_children(p_document_id);

  v_round := app.approval_current_round(p_document_id);

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
  '기안 취소 — 기안자가 최종 승인 전 문서를 기안 단계(DRAFT)로 되돌린다. 이 문서를 근거로 하는 '
  '지출이 살아 있으면 거절한다. 사유 필수.';

revoke all on function public.withdraw_approval_document(uuid, text)
  from public, anon, service_role;
grant execute on function public.withdraw_approval_document(uuid, text) to authenticated;

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
  v_allocates    boolean;
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

  -- 최종 승인을 되돌리는 것은 배정을 걷는 일이다. 이 품의를 근거로 하는 지출이 살아 있으면
  -- 먼저 그쪽을 정리해야 한다 — 순서를 뒤집으면 지출이 가리킬 배정이 사라진 채 남는다.
  perform app.assert_no_active_budget_children(v_doc);

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

  -- 배정 품의의 승인 취소는 되돌리기 어려운 금전 사실(배정 회수)이라 감사 원장에 남긴다.
  -- 되돌아온 금액은 최초 금액이 아니라 **그 순간 유효했던 예산표의 합계**다.
  select exists (
    select 1
      from public.approval_form_versions v
      cross join lateral app.approval_budget_keys(v.fields) k
     where v.id = (select form_version_id from public.approval_documents where id = v_doc)
  ) into v_allocates;

  if coalesce(v_allocates, false) then
    insert into public.audit_logs (actor_user_id, action, changed_workspace, before_data, reason)
    select v_uid, 'APPROVAL_BUDGET_ALLOCATION_RESET', 'management',
           jsonb_build_object(
             'document_id', v_doc,
             'doc_no', d.doc_no,
             'budget_total', (
               select sum(b.amount)
                 from app.approval_budget_lines(v.fields, d.field_values) b
             ),
             'workspace_links', (
               select jsonb_agg(jsonb_build_object('target_type', l.target_type,
                                                   'target_id', l.target_id))
                 from public.approval_program_links l
                where l.document_id = v_doc and l.deleted_at is null
             )
           ),
           nullif(btrim(p_reason), '')
      from public.approval_documents d
      join public.approval_form_versions v on v.id = d.form_version_id
     where d.id = v_doc;
  end if;

  select array_agg(drafter_id) into v_notify
    from public.approval_documents where id = v_doc and drafter_id is not null;
  perform app.notify_approval(v_doc, v_notify, 'approval_final_reset', v_uid);
  return 'RESET';
end;
$$;

comment on function public.recall_approval_decision(uuid, text) is
  '미결 결재가 남은 진행 중 문서에서 본인 승인을 취소한다. 완료 문서는 실제 마지막 승인자가 '
  '전체 결재선을 초기화해 기안자에게 반려하며, 배정 품의라면 살아 있는 지출이 없어야 하고 '
  '회수 사실을 audit_logs에 남긴다.';

revoke all on function public.recall_approval_decision(uuid, text)
  from public, anon, service_role;
grant execute on function public.recall_approval_decision(uuid, text) to authenticated;
