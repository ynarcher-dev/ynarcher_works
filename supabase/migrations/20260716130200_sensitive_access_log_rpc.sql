-- =====================================================================
-- [보안 안정화 P0-4] 민감정보 원본 열람 로그 서버 강제화 RPC
-- 근거: docs/docs_dev/12_immediate_security_stabilization_tasks.md §3.4,
--       docs/docs_dev/4_security_privacy_policy.md(원본 조회 감사 기준)
--
-- 기존: 클라이언트가 access_logs를 직접 insert(베스트 에포트, 실패해도 열람 진행).
-- 변경: 본 RPC가 인증·사유 검증·로그 적재를 원자적으로 수행하고, 클라이언트는
--       RPC가 성공했을 때에만 원본을 표시한다(로그 실패 = 열람 불가).
--
-- 보안 게이트(11_migration_security_gate.md) 검토:
-- - SECURITY DEFINER + set search_path 고정, 함수 내부에서 호출자 인증 선검사.
-- - grant execute는 authenticated로 한정, public에서 revoke.
-- - 신규 테이블/DELETE 정책 없음. access_logs는 기존 append-only 테이블 재사용.
-- =====================================================================

create or replace function public.log_sensitive_access(
  p_resource_type text,
  p_resource_id   uuid default null,
  p_reason        text default null
)
returns void
language plpgsql
security definer
set search_path = app, public
as $$
declare
  v_user uuid := app.current_app_user_id();
begin
  -- 1) 호출자 인증(활성 앱 사용자) 확인
  if v_user is null then
    raise exception '인증이 필요합니다.' using errcode = '42501';
  end if;

  -- 2) 열람 사유 필수(공백만 입력 시 거부)
  if p_reason is null or length(trim(p_reason)) < 2 then
    raise exception '열람 사유를 입력해야 합니다.' using errcode = '22023';
  end if;

  if p_resource_type is null or length(trim(p_resource_type)) = 0 then
    raise exception '대상 리소스 유형이 필요합니다.' using errcode = '22023';
  end if;

  -- 3) 접근 로그 적재(실패 시 예외 전파 → 클라이언트는 원본을 열람하지 못한다)
  insert into public.access_logs (user_id, resource_type, resource_id, reason)
  values (v_user, trim(p_resource_type), p_resource_id, trim(p_reason));
end;
$$;

revoke all on function public.log_sensitive_access(text, uuid, text) from public;
grant execute on function public.log_sensitive_access(text, uuid, text) to authenticated;
