-- =====================================================================
-- [FUND] 목록 요약 집계 RPC — 자금 흐름 4단 + 조치 알림 2종
--
-- 왜 RPC인가:
--   목록이 서버 사이드 페이지네이션이라 화면에는 한 페이지분 행밖에 없다. 합계를 브라우저에서
--   내면 "보이는 20건의 합"이 되어 카드가 거짓말을 한다. 건수라면 PostgREST가 세어 주지만
--   (count=exact&head — countLedgerRows), 합계는 세는 게 아니라 더하는 것이고 이 프로젝트의
--   PostgREST는 집계 함수가 꺼져 있다(PGRST123 "Use of aggregate functions is not allowed").
--   플랫폼 기본값이며 켜면 모든 테이블에 대해 열리는 스위치라, 카드 하나 때문에 열지 않는다.
--
-- 왜 알림(연체·만료 임박)까지 같은 함수인가:
--   알림은 건수라 PostgREST로도 셀 수 있지만, 모수가 "지금 목록에 걸린 펀드 집합"이다.
--   그 집합은 서버에만 있어 화면에서 세려면 필터에 걸리는 펀드 id를 전량 먼저 받아 와야 한다 —
--   페이지네이션을 도로 무르는 짓이다. 한 함수 안에서 scoped CTE를 공유하면 왕복도 하나다.
--
-- 드리프트 방지:
--   조건 조립이 화면(features/fund/fundListHooks.ts)과 이 함수 두 곳으로 갈린다. 그래서
--   합계와 함께 fund_count(집계에 든 펀드 수)를 돌려주고, 화면이 목록의 total과 대조한다.
--   어긋나면 둘 중 하나가 드리프트한 것이다. 인자는 FundListFilterState와 1:1로 받는다 —
--   매핑이 기계적이어야 두 벌이 갈라지지 않는다.
--
-- 근거: docs_planning/3_5_workspace_fund.md, docs_dev/11_migration_security_gate.md
--
-- 보안 게이트:
--   * 신규 테이블·Storage 정책 없음. 신규 RPC 1종(SECURITY INVOKER).
--   * SECURITY INVOKER이므로 funds·capital_call_payments·capital_calls·fund_managers·users의
--     기존 RLS가 호출자 권한으로 그대로 걸린다. DEFINER로 만들면 can_access_fund() 판정을
--     함수 안에 복제해야 하고 그 복제본이 곧 권한 구멍이 된다(CLAUDE.md 규칙).
--   * 반환은 합계·건수뿐이라 행 내용·개인정보가 새지 않는다. 볼 수 없는 펀드는 RLS가
--     scoped CTE 단계에서 이미 걸러 합계에 들지 않는다.
--   * GRANT EXECUTE는 authenticated로만. public 회수 선행.
--   * 조회 전용(stable)이라 감사 로그 대상 행위 없음.
-- =====================================================================

create or replace function public.fund_list_totals(
  p_keyword         text default null,
  p_statuses        text[] default null,
  p_sources         text[] default null,
  p_characters      text[] default null,
  p_strategies      text[] default null,
  p_fund_types      text[] default null,
  p_term_from       date default null,
  p_term_to         date default null,
  p_balance_min     numeric default null,
  p_balance_max     numeric default null,
  p_strategy        text default null,
  p_mine_user_id    uuid default null,
  p_expiring_months integer default 12
)
returns table (
  fund_count       bigint,
  total_commitment numeric,
  paid_in_amount   numeric,
  drawn_amount     numeric,
  balance          numeric,
  overdue_count    bigint,
  overdue_amount   numeric,
  expiring_count   bigint
)
language sql
stable
security invoker
set search_path = public, app
as $$
  with scoped as (
    select f.id, f.total_commitment, f.paid_in_amount, f.drawn_amount, f.balance,
           f.term_end, f.status
      from public.funds f
     -- 목록과 같은 부분 인덱스 조건(20260731220000의 규약). 빼면 순차 스캔으로 되돌아간다.
     where f.deleted_at is null
       -- 스코프 — 구분 프리필터(AC/VC/PE 탭)와 '내 펀드'.
       -- '내 펀드'의 담당 축은 대표펀드매니저와 운용·관리 인력 둘이라 양쪽을 본다.
       -- 생성자는 권한 축이 아니지만 '내가 만든 것'을 찾는 자리라 함께 건다(화면과 동일).
       and (p_strategy is null or f.strategy_type::text = p_strategy)
       and (
         p_mine_user_id is null
         or f.created_by = p_mine_user_id
         or f.manager_id = p_mine_user_id
         or exists (
              select 1 from public.fund_managers m
               where m.fund_id = f.id and m.user_id = p_mine_user_id)
       )
       -- 좁힘 — 검색어와 필터. 빈 배열은 '미적용'으로 되돌린다.
       -- 빈 배열을 그대로 = any()에 넣으면 아무 행도 만족하지 않아 카드가 통째로 0이 된다.
       and (
         p_keyword is null
         or f.name ilike '%' || p_keyword || '%'
         or f.code ilike '%' || p_keyword || '%'
         or exists (
              select 1 from public.users u
               where u.id = f.manager_id and u.name ilike '%' || p_keyword || '%')
       )
       and (coalesce(cardinality(p_statuses), 0) = 0
            or f.status::text = any (p_statuses))
       and (coalesce(cardinality(p_sources), 0) = 0
            or f.source_type::text = any (p_sources))
       and (coalesce(cardinality(p_characters), 0) = 0
            or f.character_type::text = any (p_characters))
       -- 구분 필터의 '미지정'(__none__)은 실제 코드가 아니라 is null 표식이다(화면과 같은 규약).
       and (coalesce(cardinality(p_strategies), 0) = 0
            or f.strategy_type::text = any (p_strategies)
            or ('__none__' = any (p_strategies) and f.strategy_type is null))
       and (coalesce(cardinality(p_fund_types), 0) = 0
            or f.fund_type::text = any (p_fund_types))
       -- 존속기간은 "이 구간에 존속 중" — 지정 구간과 펀드 기간이 겹치면 걸린다.
       -- 기간이 비어 있는 펀드는 겹친다고 단정할 근거가 없어 이 필터를 걸면 빠진다(비교가 null).
       and (p_term_to is null or f.term_start <= p_term_to)
       and (p_term_from is null or f.term_end >= p_term_from)
       and (p_balance_min is null or f.balance >= p_balance_min)
       and (p_balance_max is null or f.balance <= p_balance_max)
  ),
  overdue as (
    -- 연체는 차수(capital_calls)가 아니라 LP 행(capital_call_payments)이 SSOT다(20260729100000).
    -- 금액은 '아직 안 들어온 돈' — 요청액(requested_amount)에서 실 납입액(amount)을 뺀 잔여다.
    -- 연체 행은 is_paid=false라 amount가 0이지만, 뺄셈으로 두어야 부분 납입이 생겨도 안 틀린다.
    select count(*) as cnt,
           coalesce(sum(greatest(p.requested_amount - p.amount, 0)), 0) as amt
      from public.capital_call_payments p
      join public.capital_calls c
        on c.id = p.capital_call_id and c.deleted_at is null
     where p.status = 'OVERDUE'
       and p.fund_id in (select id from scoped)
  )
  select
    (select count(*) from scoped),
    coalesce((select sum(s.total_commitment) from scoped s), 0),
    -- 실출자금액만 nullable이라 여기서만 coalesce를 걷는다. 값을 적은 펀드가 하나도 없으면
    -- 합계가 null로 온다 — '0원이 들어왔다'와 '아직 아무도 안 적었다'는 다른 말이고,
    -- 0으로 뭉개면 화면이 출자율 0%를 사실인 양 그린다.
    (select sum(s.paid_in_amount) from scoped s),
    coalesce((select sum(s.drawn_amount) from scoped s), 0),
    coalesce((select sum(s.balance) from scoped s), 0),
    (select o.cnt from overdue o),
    (select o.amt from overdue o),
    -- 만료 임박 — 존속기간 종료가 N개월 안이면서 아직 청산이 끝나지 않은 펀드.
    -- 이미 종료일이 지난 펀드도 포함한다. 기간이 지났는데 CLOSED가 아니라면 '임박'보다
    -- 급한 상태이지 셈에서 빠질 이유가 아니다.
    (select count(*) from scoped s
      where s.term_end is not null
        and s.term_end <= current_date + make_interval(months => p_expiring_months)
        and s.status <> 'CLOSED');
$$;

comment on function public.fund_list_totals(
  text, text[], text[], text[], text[], text[], date, date, numeric, numeric, text, uuid, integer
) is
  'FUND 목록 요약 카드의 집계(자금 흐름 4종 + 연체·만료 임박). 인자는 목록 필터와 1:1이며 '
  '반환의 fund_count는 목록 건수와 대조해 조건 드리프트를 잡는 용도다.';

revoke all on function public.fund_list_totals(
  text, text[], text[], text[], text[], text[], date, date, numeric, numeric, text, uuid, integer
) from public;

grant execute on function public.fund_list_totals(
  text, text[], text[], text[], text[], text[], date, date, numeric, numeric, text, uuid, integer
) to authenticated;

-- 만료 임박 집계용 인덱스. 목록의 다른 조건과 같은 부분 인덱스 조건을 쓴다.
create index if not exists funds_term_end_idx
  on public.funds (term_end)
  where deleted_at is null;

-- 연체 LP 행 조회용. fund_id 인덱스는 이미 있으나(20260724240000) 상태로 먼저 좁히는 편이
-- 유리한 질의라 복합으로 하나 더 둔다.
create index if not exists capital_call_payments_status_fund_idx
  on public.capital_call_payments (status, fund_id);
