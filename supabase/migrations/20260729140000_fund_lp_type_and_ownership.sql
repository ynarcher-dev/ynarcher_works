-- =====================================================================
-- [Phase 8] FUND 출자자(LP) — 조합원유형 신설 + 지분율 파생 전환
--
-- 배경(사용자 확정)
--   지금까지 LP는 앱 어디에서도 등록할 수 없었고(시드 데이터뿐), 화면에 등록 기능을 붙이려면
--   두 가지가 먼저 정리돼야 했다.
--
--   1) 조합원유형(`lp_type`): 업무집행조합원(GP)/유한책임조합원(LIMITED)/특별조합원(SPECIAL).
--      운용사 입장에서 GP 출자분은 자기 자금이라 나머지 LP와 성격이 다르므로 원장이 구분해야 한다.
--      (기획 §2.2 조합원 구성 표의 '조합원유형' 컬럼)
--   2) 지분율(`ownership_pct`): 기획 §2.2가 `약정액 ÷ 약정총액`(파생)으로 정의했는데 실제로는
--      손입력 컬럼이었다. 손입력으로 두면 LP를 한 명 추가할 때마다 기존 LP 지분율을 전부
--      다시 계산해 넣어야 하고, 합이 100%가 아닌 상태가 언제든 만들어진다.
--      → 약정액이 바뀔 때마다 트리거가 그 펀드 전체 LP의 지분율을 다시 계산한다.
--
--   기존 시드값(50/30/20 · 60/40)은 이 파생식으로 정확히 재현되므로 백필로 값이 바뀌지 않는다.
--
--   1) public.fund_lp_type enum + fund_lps.lp_type
--   2) app.sync_fund_lp_ownership() : 약정액 변동 → 같은 펀드 LP 지분율 재계산(파생)
--
-- 보안 게이트(docs/docs_dev/11_migration_security_gate.md):
--   · 소유 워크스페이스: fund. 데이터 등급: Restricted(금융). 접근 주체: 내부 FUND RW/R.
--   · 새 테이블·새 정책·Storage·service_role·SECURITY DEFINER 없음. 기존 fund_lps RLS
--     (can_read/write_workspace('fund') + can_access_fund(fund_id))를 그대로 상속한다.
--   · DELETE 정책 신설 없음 — LP는 `deleted_at` soft delete를 유지한다.
--   · 트리거 함수는 SECURITY INVOKER + search_path 고정 — 호출자의 fund_lps RLS를 그대로 준수한다
--     (sync_capital_call_rollups 선례. DEFINER로 만들면 정책을 함수 안에 복제하게 된다).
-- 근거: docs_planning/3_5_workspace_fund.md §2.2
-- =====================================================================

-- 1) 조합원유형 ----------------------------------------------------------
do $$ begin create type public.fund_lp_type as enum ('GP','LIMITED','SPECIAL');
exception when duplicate_object then null; end $$;

alter table public.fund_lps
  add column if not exists lp_type public.fund_lp_type not null default 'LIMITED';

comment on column public.fund_lps.lp_type is
  '조합원유형 — GP(업무집행)/LIMITED(유한책임)/SPECIAL(특별). GP 출자분은 운용사 자기 자금이라 별도 식별이 필요하다.';

comment on column public.fund_lps.ownership_pct is
  '지분율(파생) = commitment_amount ÷ 그 펀드 활성 LP 약정액 합 × 100. 직접 입력 금지, sync_fund_lp_ownership 트리거가 갱신.';

-- 백필: 기존 시드는 GP를 이름에 '(GP)'로 표기했다. 나머지는 기본값 LIMITED 유지.
update public.fund_lps
   set lp_type = 'GP'
 where lp_type = 'LIMITED' and name like '%(GP)%';

-- 2) 지분율 파생 트리거 ---------------------------------------------------
create or replace function app.sync_fund_lp_ownership()
returns trigger
language plpgsql
security invoker
set search_path = app, public
as $$
declare
  v_fund  uuid;
  v_total numeric;
begin
  -- 자기 UPDATE가 이 트리거를 다시 부르는 것을 막는다(UPDATE OF 절이 1차 방어, 이건 2차).
  if pg_trigger_depth() > 1 then
    return null;
  end if;

  -- OLD/NEW는 각각 DELETE/INSERT에서만 없다 — tg_op로 갈라 잡는다.
  if tg_op = 'DELETE' then
    v_fund := old.fund_id;
  else
    v_fund := new.fund_id;
  end if;
  if v_fund is null then
    return null;
  end if;

  -- 약정총액 = 그 펀드 활성 LP 약정액의 합. 비활성 LP는 분모에서 빠진다.
  select coalesce(sum(commitment_amount), 0) into v_total
    from public.fund_lps
   where fund_id = v_fund and deleted_at is null;

  update public.fund_lps fl
     set ownership_pct = case
                           when fl.deleted_at is not null then null
                           when v_total > 0 then round(fl.commitment_amount / v_total * 100, 2)
                           else null
                         end
   where fl.fund_id = v_fund
     and fl.ownership_pct is distinct from (case
                           when fl.deleted_at is not null then null
                           when v_total > 0 then round(fl.commitment_amount / v_total * 100, 2)
                           else null
                         end);

  return null;
end $$;

-- 약정액·활성여부·소속펀드가 바뀔 때만 돈다. 납입액(paid_amount) 갱신에는 반응하지 않는다
-- (캐피탈 콜 롤업 트리거가 매 저장마다 paid_amount를 쓰므로 여기서 걸리면 낭비다).
drop trigger if exists trg_fund_lps_ownership on public.fund_lps;
create trigger trg_fund_lps_ownership
  after insert or delete or update of commitment_amount, deleted_at, fund_id
  on public.fund_lps
  for each row execute function app.sync_fund_lp_ownership();

-- 기존 데이터 백필(트리거 도입 시점 정합성). 시드값과 동일한 결과가 나온다.
update public.fund_lps fl
   set ownership_pct = case
                         when fl.deleted_at is not null then null
                         when t.total > 0 then round(fl.commitment_amount / t.total * 100, 2)
                         else null
                       end
  from (
    select fund_id, coalesce(sum(commitment_amount), 0) as total
      from public.fund_lps
     where deleted_at is null
     group by fund_id
  ) t
 where t.fund_id = fl.fund_id;
