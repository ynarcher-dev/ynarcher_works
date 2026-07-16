-- 운영 모듈 상태(module_status) enum에 '취소(CANCELLED)' 값 추가.
-- RLS/정책/테이블 변경 없음 — enum 값 추가만 수행한다(기존 DRAFT/OPEN/CLOSED 유지).
alter type public.module_status add value if not exists 'CANCELLED';
