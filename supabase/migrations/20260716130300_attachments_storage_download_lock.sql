-- =====================================================================
-- [보안 안정화 P0-5] attachments 버킷: 클라이언트 직접 다운로드 경로 폐쇄
-- 근거: docs/docs_dev/12_immediate_security_stabilization_tasks.md §3.5
--
-- 기존: 내부 사용자는 storage.objects SELECT 정책을 통해 클라이언트에서 직접
--       createSignedUrl을 호출할 수 있었다(다운로드 감사 로그 누락 가능).
-- 변경: SELECT 정책을 회수하여 클라이언트 직접 Signed URL 발급을 차단한다.
--       다운로드는 material-download Edge Function(호출자 RLS 검증 + access_logs
--       강제 적재 + service_role 단기 서명)만 경유한다.
--
-- 보안 게이트(11_migration_security_gate.md) 검토:
-- - 정책 완화가 아닌 회수(Default Deny 방향). 업로드(INSERT)·교체(UPDATE) 정책은
--   업로드 UX 유지를 위해 기존 내부 사용자 한정 정책을 그대로 둔다.
-- - 파일 다운로드 감사 경로는 Edge Function이 access_logs로 강제한다.
-- =====================================================================

drop policy if exists attachments_objects_select on storage.objects;
