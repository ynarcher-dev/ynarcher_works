-- =====================================================================
-- [Phase 8] FUND 구분 컬럼 미니 마이그레이션
-- funds 에 재원/성격/유형/출자 구분 enum 컬럼 4종 추가(전부 nullable).
-- 리스트뷰의 AC/VC/PE 탭 프리필터 + 재원/성격/유형 배지 컬럼을 활성화하는 근거.
--
-- 보안 게이트(11_migration_security_gate.md):
--   · 소유 워크스페이스: fund. 데이터 등급: Restricted(금융). 접근 주체: 내부 FUND RW/R.
--   · 신규 테이블/RPC/SECURITY DEFINER/Storage 정책 없음 → 게이트 대상 항목 없음.
--   · 기존 funds RLS(funds_fund_select/insert/update = can_read/write_workspace('fund')
--     + can_access_fund)는 컬럼 무관 판정이라 신규 컬럼을 그대로 커버한다 → 정책 변경 불필요.
--   · 기존 프론트 쿼리 영향 없음(신규 컬럼은 nullable, 기존 SELECT는 미참조).
-- 근거: docs_planning/3_5_workspace_fund.md §2.1
-- =====================================================================

do $$ begin create type public.fund_source_type as enum ('MOTAE','NON_MOTAE');
exception when duplicate_object then null; end $$;

do $$ begin create type public.fund_character_type as enum ('PERSONAL','VENTURE');
exception when duplicate_object then null; end $$;

do $$ begin create type public.fund_strategy_type as enum ('AC','VC','PE','ETC');
exception when duplicate_object then null; end $$;

do $$ begin create type public.fund_subscription_type as enum ('LUMP_SUM','INSTALLMENT','ON_DEMAND');
exception when duplicate_object then null; end $$;

alter table public.funds
  add column if not exists source_type       public.fund_source_type,       -- 재원구분(모태/비모태)
  add column if not exists character_type    public.fund_character_type,    -- 성격구분(개인/벤처)
  add column if not exists strategy_type      public.fund_strategy_type,     -- 유형구분(AC/VC/PE/기타)
  add column if not exists subscription_type  public.fund_subscription_type; -- 출자구분(일시납/분할납/수시납)

comment on column public.funds.source_type is '재원구분: MOTAE(모태)/NON_MOTAE(비모태). 보고 주기를 가르는 핵심 축.';
comment on column public.funds.character_type is '성격구분: PERSONAL(개인투자조합)/VENTURE(벤처투자조합). 법적 형태.';
comment on column public.funds.strategy_type is '유형구분(전략): AC/VC/PE/ETC. 성격구분과 별개 축이며 AC/VC/PE 탭의 원천.';
comment on column public.funds.subscription_type is '출자구분: LUMP_SUM(일시납)/INSTALLMENT(분할납)/ON_DEMAND(수시납).';
