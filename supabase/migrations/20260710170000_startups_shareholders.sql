-- =====================================================================
-- 스타트업 풀 상세: '주주 구성' 컬럼 추가 (주주명/보유 주식 수/지분율)
-- - 스타트업 상세페이지 '주주 구성' 섹션(성장 지표 아래)용.
--   통합 수정(저장 시 통째 교체) 모델에 맞춰 별도 테이블 대신 jsonb 배열로 저장한다.
--   · shareholders : [{ name, shares, percentage }]  (주주 1인 1객체)
-- - RLS: startups 는 이미 RLS 활성 + SELECT/INSERT/UPDATE 정책 존재
--        (20260705120500_rls_enable_policies.sql). 신규 컬럼은 기존 정책 상속 → 추가 정책 불요.
-- - 물리 삭제/DELETE 정책 없음. 신규 RPC/SECURITY DEFINER/Storage 정책 없음.
-- 근거: docs/docs_dev/11_migration_security_gate.md,
--       20260705120400_networks_master.sql(startups 정의)
-- =====================================================================

alter table public.startups
  add column if not exists shareholders jsonb not null default '[]'::jsonb;

comment on column public.startups.shareholders is
  '주주 구성 배열: [{ name, shares, percentage }].';
