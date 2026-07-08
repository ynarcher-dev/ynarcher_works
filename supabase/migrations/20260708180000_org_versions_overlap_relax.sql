-- =====================================================================
-- [Phase 12] 조직 관리 — 조직 버전 겹침 금지 제약 완화(시작일 타임라인)
-- 배경: "현재 조직"이 무기한(effective_to null)이라 daterange 배타 제약(겹침 금지) 하에서는
--       어떤 미래 버전도 무기한 구간과 겹쳐 저장이 거부되어, 예정 버전을 만들 수 없었다.
-- 결정: 버전은 "시작일 타임라인"으로 다룬다. 활성 버전 = effective_from<=오늘 중 가장 늦게
--       시작한 PUBLISHED 버전(current_org_version_id 규칙과 동일). effective_to는 참고/표기용.
--       따라서 하드 겹침 금지 제약을 제거한다(겹쳐도 활성은 시작일로 결정되어 모호하지 않음).
-- 영향: org_versions 쓰기 RLS/RPC 권한 불변. 데이터 이관 없음(제약만 제거).
-- 보안 게이트: 신규 테이블/RPC/정책 없음. 기존 RLS 유지. 개인정보/파일/권한변경 아님.
-- 근거: 20260708160000_org_versions.sql(제약 정의), docs_planning/3_7_workspace_management.md
-- =====================================================================

alter table public.org_versions drop constraint if exists org_versions_no_overlap;
