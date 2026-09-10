-- =====================================================================
-- 전자결재 보완 상태값
--
-- 보안 게이트 자기점검(docs/docs_dev/11_migration_security_gate.md)
--   · 소유 워크스페이스: office. 데이터 등급: Internal.
--   · 접근 주체: 내부 사용자. Scope: self(기안자/현재 결재자).
--   · 기존 두 enum에 상태값만 추가한다. 테이블·RLS·Storage·grant 변경 없음.
--   · 다음 마이그레이션에서 상태 전이 RPC를 교체한다. PostgreSQL은 enum 값을
--     추가한 트랜잭션 안에서 곧바로 사용할 수 없으므로 파일을 의도적으로 나눴다.
-- =====================================================================

alter type public.approval_status
  add value if not exists 'REVISION_REQUIRED' after 'IN_REVIEW';

alter type public.approval_decision
  add value if not exists 'REVISION_REQUESTED' after 'PENDING';
