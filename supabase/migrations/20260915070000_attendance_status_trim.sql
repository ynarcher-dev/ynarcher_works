-- =====================================================================
-- [MANAGEMENT] 근태 상태 원장에서 쓰지 않는 휴가 구분을 덜어낸다 (2026-09-15 사용자 확정)
-- 기획: docs/docs_planning/3_7_3_management_attendance.md §5.2
-- 보안 게이트: docs/docs_dev/11_migration_security_gate.md
--   새 테이블·새 정책·새 함수·Storage 없음. 기존 원장에서 시드 행 둘을 덜어낼 뿐이며
--   RLS·GRANT·트리거는 그대로다(attendance_statuses의 쓰기는 종전대로 management뿐).
--
-- 무엇을 덜어내는가: `병가`(LEAVE_SICK)·`공가`(LEAVE_OFFICIAL). 20260803190000이 예시로 넣은
-- 시드 행이고 회사가 쓰지 않기로 했습니다. 남기는 휴가 구분은 `연차`·`반차` 둘입니다.
--
-- 왜 물리 삭제인가. 이 원장의 소프트 삭제 경로는 `is_active = false`인데, 그것은 **한때 쓰던
-- 상태를 더는 고르지 못하게 내린다**는 뜻입니다(기록이 남아 있으므로 라벨이 계속 필요하다).
-- 여기 둘은 한 번도 쓰인 적이 없어 가리킬 기록이 없고, 비활성으로 내리면 근태 설정 화면에
-- '쓰지 않는 상태' 두 줄이 영구히 남아 덜어낸 것이 아니라 숨긴 것이 됩니다.
--
-- 다만 **조건 없이 지우지 않습니다.** 이 파일이 도는 시점에 기록이 하나라도 붙어 있으면
-- (다른 환경·다른 시점) 삭제 대신 비활성으로 내립니다. 참조 무결성(attendance_days의 FK)이
-- 막아 마이그레이션이 실패하는 대신, 그 환경에서는 소프트 삭제가 옳은 답이기 때문입니다.
-- =====================================================================

begin;

-- 기록이 붙은 코드는 지우지 않고 내린다(고를 수 없게만 한다).
update public.attendance_statuses s
   set is_active = false
 where s.code in ('LEAVE_SICK', 'LEAVE_OFFICIAL')
   and exists (
     select 1 from public.attendance_days d
      where d.status_code = s.code or d.auto_status_code = s.code
   );

-- 쓰인 적 없는 코드는 원장에서 덜어낸다.
delete from public.attendance_statuses s
 where s.code in ('LEAVE_SICK', 'LEAVE_OFFICIAL')
   and not exists (
     select 1 from public.attendance_days d
      where d.status_code = s.code or d.auto_status_code = s.code
   );

commit;
