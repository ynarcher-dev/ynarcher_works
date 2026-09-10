-- 원격 적용 후 ACL 검증에서 public 스키마의 기본 권한이 anon/service_role에 명시적
-- EXECUTE를 부여한 것을 확인했다. 함수 내부 인가와 별개로 호출 표면도 authenticated로
-- 좁힌다. 신규 환경에서는 앞 마이그레이션도 같은 revoke를 포함하며, 이 파일은 이미
-- 적용된 환경을 보정한다.

revoke all on function public.decide_approval_document(
  uuid, public.approval_decision, text
) from public, anon, service_role;
grant execute on function public.decide_approval_document(
  uuid, public.approval_decision, text
) to authenticated;

revoke all on function public.resubmit_approval_document(uuid, text, jsonb)
  from public, anon, service_role;
grant execute on function public.resubmit_approval_document(uuid, text, jsonb) to authenticated;
