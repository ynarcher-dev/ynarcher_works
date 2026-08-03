-- =====================================================================
-- [FUND] fund_list_totals — 알림 집계 제거, 금액 합계만 남긴다
--
-- 요약 카드에서 조치 알림(연체 캐피탈 콜·존속기간 만료 임박)을 걷었다(사용자 판단).
-- 화면이 더 묻지 않는 값을 함수가 계속 계산할 이유가 없다 — 특히 연체 집계는
-- capital_call_payments × capital_calls 조인이라, 목록을 열 때마다 아무도 읽지 않는
-- 조인이 한 번씩 돈다.
--
-- 반환 컬럼이 줄어 create or replace로는 바꿀 수 없다(반환 타입 변경 불가). 같은
-- 트랜잭션 안에서 drop 후 재생성하므로 함수가 비는 순간은 없다. 인자 목록과 본문의
-- scoped CTE는 그대로다 — 목록 조건과의 1:1 대응이 이 함수의 존재 이유다.
--
-- 프런트 배포 순서: 이 마이그레이션이 먼저 반영돼도 구 화면은 없는 컬럼을 0으로
-- 읽어 알림만 사라진다(예외 없음). 반대 순서여도 새 화면은 그 컬럼을 읽지 않는다.
--
-- 보안 게이트: 권한·접근 경계 불변. SECURITY INVOKER 유지(funds RLS가 호출자
-- 권한으로 그대로 걸린다), search_path 고정, revoke public/anon + grant authenticated
-- 재선언(drop과 함께 사라지므로 다시 건다). 신규 테이블·Storage·DEFINER 없음.
-- =====================================================================

drop function if exists public.fund_list_totals(
  text, text[], text[], text[], text[], text[], date, date, numeric, numeric, text, uuid, integer
);

create function public.fund_list_totals(
  p_keyword      text default null,
  p_statuses     text[] default null,
  p_sources      text[] default null,
  p_characters   text[] default null,
  p_strategies   text[] default null,
  p_fund_types   text[] default null,
  p_term_from    date default null,
  p_term_to      date default null,
  p_balance_min  numeric default null,
  p_balance_max  numeric default null,
  p_strategy     text default null,
  p_mine_user_id uuid default null
)
returns table (
  fund_count       bigint,
  total_commitment numeric,
  paid_in_amount   numeric,
  drawn_amount     numeric,
  balance          numeric
)
language sql
stable
security invoker
set search_path = public, app
as $$
  with scoped as (
    select f.total_commitment, f.paid_in_amount, f.drawn_amount, f.balance
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
  )
  select
    count(*),
    coalesce(sum(s.total_commitment), 0),
    -- 실출자금액만 nullable이라 여기서만 coalesce를 걷는다. 값을 적은 펀드가 하나도 없으면
    -- 합계가 null로 온다 — '0원이 들어왔다'와 '아직 아무도 안 적었다'는 다른 말이고,
    -- 0으로 뭉개면 화면이 출자율 0%를 사실인 양 그린다.
    sum(s.paid_in_amount),
    coalesce(sum(s.drawn_amount), 0),
    coalesce(sum(s.balance), 0)
    from scoped s;
$$;

comment on function public.fund_list_totals(
  text, text[], text[], text[], text[], text[], date, date, numeric, numeric, text, uuid
) is
  'FUND 목록 요약 카드의 금액 합계 4종. 인자는 목록 필터와 1:1이며 반환의 fund_count는 '
  '목록 건수와 대조해 조건 드리프트를 잡는 용도다.';

revoke all on function public.fund_list_totals(
  text, text[], text[], text[], text[], text[], date, date, numeric, numeric, text, uuid
) from public;

revoke all on function public.fund_list_totals(
  text, text[], text[], text[], text[], text[], date, date, numeric, numeric, text, uuid
) from anon;

grant execute on function public.fund_list_totals(
  text, text[], text[], text[], text[], text[], date, date, numeric, numeric, text, uuid
) to authenticated;

-- 연체 조회 전용으로 깔았던 복합 인덱스는 읽는 질의가 사라져 함께 걷는다.
-- fund_id 단독 인덱스(20260724240000)는 캐피탈 콜 콘솔이 계속 쓰므로 남긴다.
drop index if exists public.capital_call_payments_status_fund_idx;

-- funds.term_end 인덱스도 이 카드가 유일한 사용처였으나 남긴다 —
-- 목록의 존속기간 범위 필터(term_end >= ?)가 같은 인덱스를 탄다.
