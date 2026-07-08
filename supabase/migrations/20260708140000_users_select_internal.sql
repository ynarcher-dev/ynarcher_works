-- =====================================================================
-- [Phase 7] 임직원 정보 조회 범위 확대 (전 내부 임직원)
-- 배경: OFFICE "임직원 정보"가 public.users 를 직접 조회하도록 바뀌면서, 기존
--       users_select 정책(admin / self / management read)에 걸려 management 권한이
--       없는 내부 역할(M&A팀 = mna_manager)은 임직원 정보가 빈 화면이 되었다.
-- 결정: 임직원 정보는 전 내부 직원 공용 디렉토리이므로, 내부 임직원(외부 게스트 제외)은
--       누구나 조회 가능하도록 넓힌다. INSERT/UPDATE 는 그대로(경영지원/관리자만).
--
-- 개인정보 처리 주의:
--  - RLS 는 행 단위라 email/phone 원본이 응답에 포함된다. 목록/상세의 이메일·연락처는
--    앱 계층 마스킹(maskEmail/maskPhone) + 관리자 민감정보 토글로 가려지며, 이는 확대 이전
--    (management 읽기 대상)과 동일한 처리 방식이다. 즉 마스킹 대상 청중만 넓어질 뿐,
--    원본 컬럼 보호 수준은 기존 설계와 동일하다.
--  - 외부 게스트(external_startup/expert/temporary_guest)는 계속 차단한다.
--
-- 보안 게이트 체크리스트(11_migration_security_gate.md):
--  · 소유 워크스페이스: management(임직원 마스터) / 데이터 등급: Personal(이름·부서=Internal 수준 공개)
--  · SELECT/INSERT/UPDATE 정책 분리 유지(본 변경은 users_select 만 재정의)
--  · 판정은 app.* 헬퍼 경유(is_admin/current_app_user_id/can_read_workspace/current_app_role)
--  · 외부 게스트가 내부 HR 마스터를 조회하지 못하도록 게스트 유형 배제 유지
--  · DELETE 정책 없음(soft delete 유지)
-- 근거: 20260705120500_rls_enable_policies.sql(users_select 원본),
--       20260707230000_attachments_storage.sql(내부 사용자 판정 idiom)
-- =====================================================================

drop policy if exists users_select on public.users;
create policy users_select on public.users for select
  using (
    app.is_admin()
    or id = app.current_app_user_id()
    or app.can_read_workspace('management')
    -- 내부 임직원(외부 게스트 제외)은 전사 임직원 디렉토리를 조회할 수 있다.
    or (
      app.current_app_user_id() is not null
      and app.current_app_role() not in ('external_startup', 'external_expert', 'temporary_guest')
    )
  );
