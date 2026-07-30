-- =====================================================================
-- [Phase 12] 자산 원장 — 결제 주기(구독)와 시리얼 번호
--
-- 근거: 20260730100000_assets_ledger.sql / docs_planning/3_7_2_management_assets.md
--
-- 금액 하나로는 "2,500,000원을 완납한 노트북"과 "월 55,000원짜리 구독"을 구분할 수 없었다.
-- 같은 열에 성격이 다른 수가 섞이면 합계가 뜻을 잃는다 — 금액이 어느 주기의 값인지를
-- 함께 적어, 연 환산·계약 총액을 계산할 수 있게 한다.
--
-- 계약 기간은 새 컬럼을 만들지 않고 기존 return_due(회수 예정일)를 쓴다. 기획 §5.2가 이미
-- 리스·렌탈의 계약 종료일을 이 컬럼에 적기로 정해 두었고, 구독 만료일도 같은 성격이다.
--
-- 시리얼 번호는 유니크로 묶지 않는다 — 라이선스 키처럼 좌석마다 같은 값이 반복되는 자산이
-- 있어서, 유일성을 강제하면 사실인 데이터가 저장되지 못한다. 검색을 위해 인덱스만 둔다.
--
-- 소유 워크스페이스: management / 데이터 등급: Internal / Scope: global
-- 감사 로그: 미대상. 새 테이블·RPC·SECURITY DEFINER 함수·Storage 정책 없음 —
-- assets의 기존 RLS(assets_mgmt_select/_insert/_update)를 그대로 승계하며 DELETE 정책은 없다.
-- =====================================================================

-- 1) 결제 주기 enum ----------------------------------------------------------
do $$
begin
  create type public.asset_billing_cycle as enum ('ONE_TIME', 'MONTHLY', 'YEARLY');
exception
  when duplicate_object then null;
end $$;

-- 2) 컬럼 추가 ---------------------------------------------------------------
-- 기존 자산은 모두 완납으로 본다(구독을 이 컬럼 없이 등록할 방법이 없었으므로 사실과 맞다).
alter table public.assets
  add column if not exists billing_cycle public.asset_billing_cycle not null default 'ONE_TIME',
  add column if not exists serial_no     text;

comment on column public.assets.billing_cycle is
  '금액의 결제 주기. ONE_TIME=완납, MONTHLY=월 구독, YEARLY=연 구독. 연 환산·계약 총액 계산의 기준이며 계약 기간은 acquired_on ~ return_due로 본다.';
comment on column public.assets.serial_no is
  '시리얼 번호·관리 번호. 유니크 제약 없음 — 라이선스 키처럼 같은 값이 여러 행에 정당하게 반복될 수 있다.';

-- 3) 인덱스 ------------------------------------------------------------------
-- 시리얼 번호는 목록 검색어의 한 축이다(자산명·품목과 함께 ilike로 훑는다).
create index if not exists idx_assets_serial_no on public.assets (serial_no)
  where serial_no is not null;
