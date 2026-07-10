-- =====================================================================
-- 스타트업 풀 상세: '미디어' 컬럼 추가 (언론기사·영상 등 URL + OG 메타데이터)
-- - URL을 붙이면 link-metadata Edge Function이 서버사이드로 OG 메타데이터를 읽어
--   제목·설명·썸네일·출처를 보여준다. 통합 수정(저장 시 통째 교체) 모델에 맞춰
--   별도 테이블 대신 jsonb 배열로 저장한다.
--   · media : [{ url, kind, title, description, image, siteName }]
-- - RLS: startups 는 이미 RLS 활성 + SELECT/INSERT/UPDATE 정책 존재
--        (20260705120500_rls_enable_policies.sql). 신규 컬럼은 기존 정책 상속 → 추가 정책 불요.
-- - 물리 삭제/DELETE 정책 없음. 신규 RPC/SECURITY DEFINER/Storage 정책 없음.
-- 근거: docs/docs_dev/11_migration_security_gate.md,
--       20260705120400_networks_master.sql(startups 정의)
-- =====================================================================

alter table public.startups
  add column if not exists media jsonb not null default '[]'::jsonb;

comment on column public.startups.media is
  '미디어(언론기사·영상 등) 배열: [{ url, kind, title, description, image, siteName }]. 메타데이터는 link-metadata Edge Function이 채운다.';
