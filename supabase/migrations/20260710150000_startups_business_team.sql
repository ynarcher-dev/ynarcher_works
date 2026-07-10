-- =====================================================================
-- 스타트업 풀 상세: '비즈니스 & 팀 역량' 컬럼 추가
-- - 스타트업 상세페이지 담당자 카드 아래 '비즈니스 & 팀 역량' 카드 섹션용 정성 정보.
--   정성 텍스트/목록이라 jsonb 2종으로 유연하게 저장한다.
--   · business_profile : { oneLiner, businessModel, targetMarket, competitiveEdge }
--   · team_profile     : { founderStrength, members:[{name,role,background}], capabilities:[] }
--   · business_profile_updated_at : 이 섹션 최종 수정 시각(앱에서 기록, nullable) — '최종 수정' 표기용.
-- - RLS: startups 는 이미 RLS 활성 + SELECT/INSERT/UPDATE 정책 존재
--        (20260705120500_rls_enable_policies.sql). 신규 컬럼은 기존 정책 상속 → 추가 정책 불요.
-- - 물리 삭제/DELETE 정책 없음. 신규 RPC/SECURITY DEFINER/Storage 정책 없음. 개인정보 없음.
-- 근거: docs/docs_dev/11_migration_security_gate.md,
--       20260705120400_networks_master.sql(startups 정의)
-- =====================================================================

alter table public.startups
  add column if not exists business_profile            jsonb not null default '{}'::jsonb,
  add column if not exists team_profile                jsonb not null default '{}'::jsonb,
  add column if not exists business_profile_updated_at timestamptz;

comment on column public.startups.business_profile is
  '비즈니스 정성 정보 jsonb: { oneLiner, businessModel, targetMarket, competitiveEdge }.';
comment on column public.startups.team_profile is
  '팀 역량 jsonb: { founderStrength, members:[{name,role,background}], capabilities:[] }.';
comment on column public.startups.business_profile_updated_at is
  '비즈니스 & 팀 역량 섹션 최종 수정 시각(앱 기록, nullable).';
