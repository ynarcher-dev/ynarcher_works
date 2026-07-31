-- =====================================================================
-- FUND 결성일(formed_on) 은퇴 — 존속기간이 답한다
--
-- 배경: 결성일과 존속기간 시작일은 같은 날을 가리킨다(조합의 존속기간은 결성일부터 센다).
--   상세 개요는 이미 중복을 알고 결성일을 숨기고 있었으나(FundDetailPage), 등록 폼·대용량
--   업로드·목록 정렬은 계속 결성일을 물어 같은 값을 두 곳에 적게 하고 있었다. 둘이 어긋나면
--   어느 쪽이 맞는지 판정할 근거가 없다 — 묻는 자리를 하나로 줄인다. 남기는 쪽은 존속기간이다
--   (종료일까지 한 축으로 답하므로 결성일이 담지 못하는 것까지 담는다).
--
-- 1) 백필: 결성일에만 값이 있는 펀드를 존속기간 시작일로 옮긴다. 입력을 먼저 없애면 그 값들이
--    화면에서 닿을 수 없는 채로 남고, 정렬 기준이 존속기간으로 바뀌므로 목록 맨 뒤로 밀린다.
--    이미 존속기간이 있는 행은 건드리지 않는다 — 사람이 따로 넣은 값이 우선이다.
--
-- 2) 목록 정렬 인덱스 교체: 기존 정렬 기준이던 결성연도(vintage_year)는 존속기간이 대체한
--    구 컬럼이라 값이 비어 있는 펀드가 많고, 그 상태로는 정렬이 사실상 무의미했다.
--    존속기간 시작일 내림차순(최근 결성 순)으로 바꾼다.
--    20260731220000의 spec 표에서 funds 항목의 정렬식이 바뀐 것에 해당한다 — 지나간
--    마이그레이션은 고치지 않으므로 여기서 갈아끼운다.
--
-- 3) 컬럼은 남긴다. 물리 삭제 금지 규약이기도 하고, 결성일과 존속기간 시작일이 제도상 갈리는
--    조합이 뒤에 나올 수 있다. 화면에서 묻지 않을 뿐이며 값은 그대로 보존된다.
--
-- 보안 게이트(11_migration_security_gate.md):
--   - 신규 테이블·뷰·정책·함수·RPC·Storage 없음. RLS 영향 없음(인덱스와 UPDATE 한 건).
--   - 백필 UPDATE는 관리 작업이라 RLS를 우회하는 마이그레이션 컨텍스트에서 돈다.
--     대상은 term_start가 비어 있는 행뿐이라 기존 값을 덮지 않는다.
--   - funds에는 기여 로그 트리거가 없어(app.has_contribution_trigger 대상 아님) 백필이
--     변동 이력을 오염시키지 않는다. updated_at도 건드리지 않는다.
--   - 개인정보·감사 로그·Export 영향 없음.
-- 근거: 20260724110000_fund_period_and_managers.sql(두 컬럼 정의),
--       20260731220000_list_search_sort_indexes.sql(교체 대상 인덱스),
--       apps/works/src/features/fund/FundDetailPage.tsx(중복 인지 주석)
-- =====================================================================

-- 1) 결성일에만 있던 값을 존속기간 시작일로 옮긴다.
update public.funds
   set term_start = formed_on
 where term_start is null
   and formed_on is not null
   and deleted_at is null;

-- 2) 목록 정렬 인덱스를 존속기간 시작일로 교체.
drop index if exists public.idx_funds_list_order;

create index if not exists idx_funds_list_order
  on public.funds (term_start desc nulls last)
  where deleted_at is null;

-- 3) 컬럼은 보존하되 더 이상 화면이 묻지 않음을 명시.
comment on column public.funds.formed_on is
  '결성일(은퇴, 2026-07-31). 존속기간 시작일(term_start)과 같은 날을 가리켜 등록 폼·대용량 업로드·목록 정렬에서 내렸다. 값은 보존하며 조회 경로만 남는다 — 결성일과 존속기간 시작일이 제도상 갈리는 조합이 나오면 이 컬럼을 다시 쓴다.';

comment on column public.funds.term_start is
  '존속기간 시작일. 조합의 결성 시점을 답하는 단일 축이며 목록 기본 정렬 기준이다(구 formed_on·vintage_year 대체).';
