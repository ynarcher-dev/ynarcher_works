-- =====================================================================
-- [FUND] 잔액(balance) 생성 열 — 목록 잔액 필터의 서버 사이드 조건
-- - 잔액은 지금까지 화면에서만 계산했다(약정총액 - 집행액). 목록이 서버 페이지네이션이라
--   브라우저에서 거르면 페이지·건수가 전부 틀어지므로, 잔액으로 좁히려면 DB가 그 값을
--   컬럼으로 갖고 있어야 한다.
-- - 생성 열(GENERATED ALWAYS ... STORED)로 둔다. 트리거로 채우면 두 원천(약정총액 손입력,
--   집행액 트리거 집계) 중 한쪽만 바뀌었을 때 갱신이 새는 경로가 생긴다.
-- 근거: docs_planning/3_5_workspace_fund.md, docs_dev/11_migration_security_gate.md
--
-- 보안 게이트: 신규 테이블·RPC·Storage 정책·SECURITY DEFINER 함수 없음.
--   기존 public.funds에 파생 열 하나를 더하는 변경이라 RLS 정책은 그대로 적용되며
--   (행 단위 판정, 컬럼 추가와 무관) 새로 열리는 접근 경로가 없다.
-- =====================================================================

-- 1) 잔액 생성 열 --------------------------------------------------------------
-- total_commitment·drawn_amount 모두 not null default 0이라 balance도 항상 값이 있다.
alter table public.funds
  add column if not exists balance numeric(18,2)
    generated always as (total_commitment - drawn_amount) stored;

comment on column public.funds.balance is
  '잔액 = 약정총액(total_commitment) - 집행액(drawn_amount). 생성 열이라 직접 쓰지 않는다.';

-- 2) 잔액 범위 조회 인덱스 -----------------------------------------------------
-- 목록의 다른 조건과 같은 부분 인덱스 조건(deleted_at is null)을 쓴다
-- (20260731220000_list_search_sort_indexes.sql의 규약).
create index if not exists funds_balance_idx
  on public.funds (balance)
  where deleted_at is null;
