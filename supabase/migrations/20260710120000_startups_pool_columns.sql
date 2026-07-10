-- =====================================================================
-- 스타트업 풀 관리 목록 컬럼 추가 (구분 / 현황 / 발굴 경로)
-- - public.startups 에 풀 관리 목록용 3개 컬럼을 추가한다. 스타트업 풀 데이터 테이블
--   (StartupPoolTable)에서 우선 배치해 데이터를 보며 판단하기 위한 스캐폴드다.
--   · management_status : 구분(발굴/보육/투자/기타 등). 허용값 미확정이라 CHECK 없이 개방(판단 후 정형화).
--   · pool_status       : 현황(풀 진행 상태). 위와 동일하게 자유 텍스트로 개방.
--   · discovery_source  : 발굴 경로(예: 지인 추천/데모데이/직접 발굴/IR).
-- - RLS: startups 는 이미 RLS 활성 + SELECT/INSERT/UPDATE 정책 존재
--        (20260705120500_rls_enable_policies.sql). 신규 컬럼은 기존 테이블 정책을
--        그대로 상속하므로 추가 정책이 필요 없다.
-- - 물리 삭제/DELETE 정책 없음(soft delete 유지). 신규 RPC/SECURITY DEFINER/Storage 정책 없음.
--   개인정보·다운로드·Export·권한 변경 영향 없음(Internal 등급 nullable 텍스트 3종).
-- 근거: docs/docs_dev/11_migration_security_gate.md,
--       20260705120400_networks_master.sql(startups 정의),
--       20260705120500_rls_enable_policies.sql(startups RLS)
-- =====================================================================

alter table public.startups
  add column if not exists management_status text,
  add column if not exists pool_status       text,
  add column if not exists discovery_source  text;

comment on column public.startups.management_status is
  '구분(발굴/보육/투자/기타 등). 허용값 확정 전까지 자유 텍스트, 확정 후 CHECK/enum 정형화.';
comment on column public.startups.pool_status is
  '현황(풀 진행 상태). 허용값 확정 전까지 자유 텍스트.';
comment on column public.startups.discovery_source is
  '발굴 경로(예: 지인 추천/데모데이/직접 발굴/IR).';
