-- =====================================================================
-- [MANAGEMENT] 근태 근무 기준 조회를 내부 사용자로 좁힌다
--
-- 20260803190000의 attendance_policies_select는 세 갈래였다:
--   management read  OR  user_id is null(전사 기본)  OR  본인
-- 가운데 갈래에 헬퍼 호출이 없어, 로그인하지 않은 anon 키로도 전사 기본 기준(출근 가능
-- 시각·소정 근무시간·근무 요일)이 그대로 읽혔다. 다른 두 갈래는 app.* 헬퍼를 부르므로
-- anon에게는 EXECUTE 권한이 없어 막히는데, 이 갈래만 순수 컬럼 비교라 통과한 것이다.
-- (실제 배포 후 REST 스모크에서 200으로 확인.)
--
-- 값의 민감도는 낮지만 게이트가 새는 것 자체가 문제다 — 근무 기준은 사내 운영 정보이고,
-- 앞으로 이 원장에 붙는 값(임직원별 예외의 대상 id 등)은 개인정보에 가까워진다.
-- 바깥에 내부 사용자 조건을 한 겹 두어 세 갈래 전부가 그 안에서만 성립하게 한다.
--
-- 보안 게이트: 기존 정책 1건 교체. 새 테이블·RPC·Storage 정책·SECURITY DEFINER 함수 없음.
-- =====================================================================

drop policy if exists attendance_policies_select on public.attendance_policies;
create policy attendance_policies_select on public.attendance_policies for select
  using (
    app.is_internal_user()
    and (
      app.can_read_workspace('management')
      -- 전사 기본은 내부 사용자 전원이 읽어야 근무체크 위젯이 '오늘은 근무일이 아닙니다'를
      -- 말할 수 있다. 남의 예외는 management만 본다.
      or user_id is null
      or user_id = app.current_app_user_id()
    )
  );
