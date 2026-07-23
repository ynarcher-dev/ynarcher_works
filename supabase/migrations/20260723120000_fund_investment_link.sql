-- =====================================================================
-- [Phase 8] 자사 펀드 투자 ↔ 스타트업 관계형 연동
-- - investments.valuation 추가(스타트업 투자 현황 표의 '기업 가치(Pre)' 대응)
-- - funds.drawn_amount(집행액)을 손입력에서 SUM(investments.amount) 트리거 집계로 전환
-- - startup_fund_investments(): STARTUP 조회 권한자에게 자사 펀드 투자 최소 투영을
--   노출하는 브리지(FUND RLS는 FUND 권한자 전용이므로 SECURITY DEFINER + 호출자 검사)
-- 근거: docs_planning/3_5_workspace_fund.md, docs_dev/11_migration_security_gate.md
-- =====================================================================

-- 1) 기업 가치(Pre) 컬럼 추가 --------------------------------------------------
-- 라운드는 기존 investments.stage(예: 'Series A')를 그대로 사용한다(개념 동일).
alter table public.investments
  add column if not exists valuation numeric(18,2);

-- 2) 집행액(drawn_amount) 자동 집계 ------------------------------------------
-- 소유 펀드의 집행액 = 그 펀드의 미삭제 investments.amount 합계.
-- SECURITY INVOKER: 트리거를 유발한 FUND 쓰기 권한자가 자기 펀드 funds 행을
-- 갱신하는 것이므로 funds RLS(can_write_workspace('fund') + can_access_fund)를
-- 그대로 준수한다(정책을 함수에 복제하지 않는다).
create or replace function app.sync_fund_drawn_amount()
returns trigger
language plpgsql
security invoker
set search_path = app, public
as $$
declare
  recompute_fund uuid;
begin
  -- 신규/변경 대상 펀드 재계산
  if tg_op in ('INSERT', 'UPDATE') then
    update public.funds f
       set drawn_amount = coalesce((
             select sum(i.amount)
               from public.investments i
              where i.fund_id = new.fund_id
                and i.deleted_at is null), 0)
     where f.id = new.fund_id;
  end if;

  -- 삭제 또는 소속 펀드 변경 시 이전 펀드도 재계산
  if tg_op = 'DELETE' then
    recompute_fund := old.fund_id;
  elsif tg_op = 'UPDATE' and new.fund_id is distinct from old.fund_id then
    recompute_fund := old.fund_id;
  end if;

  if recompute_fund is not null then
    update public.funds f
       set drawn_amount = coalesce((
             select sum(i.amount)
               from public.investments i
              where i.fund_id = recompute_fund
                and i.deleted_at is null), 0)
     where f.id = recompute_fund;
  end if;

  return null;
end;
$$;

drop trigger if exists trg_investments_sync_drawn on public.investments;
create trigger trg_investments_sync_drawn
  after insert or update or delete on public.investments
  for each row execute function app.sync_fund_drawn_amount();

-- 기존 데이터 백필(트리거 도입 시점 정합성 확보)
update public.funds f
   set drawn_amount = coalesce((
         select sum(i.amount)
           from public.investments i
          where i.fund_id = f.id
            and i.deleted_at is null), 0);

-- 3) STARTUP 조회용 브리지 함수 ------------------------------------------------
-- 스타트업 상세의 '투자 현황' 표에 자사 펀드 투자를 병합 표시하기 위한 읽기 경로.
-- investments는 FUND 전용 RLS라 STARTUP 열람자는 직접 못 읽으므로, 최소 투영
-- (펀드명·투자일·라운드·기업가치·집행액)만 노출하는 SECURITY DEFINER 경유.
-- 호출자 권한(STARTUP 읽기)을 함수 내부에서 먼저 검사한다.
-- 클라이언트 rpc() 호출 대상이므로 public 스키마에 둔다(PostgREST 노출).
create or replace function public.startup_fund_investments(p_startup_id uuid)
returns table (
  investment_id uuid,
  fund_id       uuid,
  fund_name     text,
  invested_at   date,
  round         text,
  valuation     numeric,
  amount        numeric
)
language plpgsql
stable
security definer
set search_path = app, public
as $$
begin
  if not app.can_read_workspace('startup') then
    raise exception 'insufficient privilege' using errcode = '42501';
  end if;

  return query
    select i.id, i.fund_id, f.name, i.invested_at, i.stage, i.valuation, i.amount
      from public.investments i
      join public.funds f on f.id = i.fund_id
     where i.startup_id = p_startup_id
       and i.deleted_at is null
       and f.deleted_at is null
     order by i.invested_at desc nulls last;
end;
$$;

revoke all on function public.startup_fund_investments(uuid) from public;
grant execute on function public.startup_fund_investments(uuid) to authenticated;
