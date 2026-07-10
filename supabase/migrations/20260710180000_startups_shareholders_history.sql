-- =====================================================================
-- 스타트업 풀 상세: '주주 구성' 형태 변경(평면 목록 → 변경 시점별 이력)
-- - 캡테이블은 라운드마다 바뀌므로 시점(date) + 사유(round)별 스냅샷을 쌓는다.
--   shareholders : [{ date, round, holders: [{ name, shares, percentage }] }]
-- - jsonb라 스키마 변경 없음(주석만 갱신). 구(舊) 평면 배열은 앱 리더가
--   날짜 없는 단일 스냅샷으로 하위 호환 처리하므로 데이터 마이그레이션 불요.
-- - RLS/DELETE/RPC/SECURITY DEFINER/Storage 정책 변화 없음.
-- 근거: docs/docs_dev/11_migration_security_gate.md,
--       20260710170000_startups_shareholders.sql
-- =====================================================================

comment on column public.startups.shareholders is
  '주주 구성 이력 배열: [{ date, round, holders: [{ name, shares, percentage }] }]. 시점(date) 내림차순이 최신 구성.';
