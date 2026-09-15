import { Spinner, Tabs } from '@ynarcher/ui'
import { useAuthStore } from '@/auth/authStore'
import {
  useAttendanceStatuses,
  useMyAttendancePolicy,
} from '@/features/management/attendance/attendanceConfigApi'
import { AttendanceRequestList } from '@/features/management/attendance/AttendanceRequestList'
import { MyAttendanceMonthGrid } from '@/features/management/attendance/MyAttendanceMonthGrid'
import { MyAttendanceSection } from '@/features/management/attendance/MyAttendanceSection'
import { MyAttendanceYearly } from '@/features/management/attendance/MyAttendanceYearly'
import { MyLeaveHistory } from '@/features/management/attendance/leave/MyLeaveHistory'
import { MyAttendanceMonth } from '@/features/management/attendance/MyAttendanceMonth'
import { WORK_REQUEST_META } from '@/features/approval/workRequestForm'
import {
  ATTENDANCE_TABS,
  type AttendanceView,
} from '@/features/management/attendance/attendanceViews'

/**
 * 내 근태현황 — 다섯 탭 한 주소(`/my-office?tab=attendance&view=...`).
 * 기획: docs_planning/3_7_3_management_attendance.md
 *
 * 탭으로 가르는 축은 **무엇을 묻는가**다 — 올해와 이번 주(휴가/근무), 이 달의 하루하루(근무
 * 현황), 휴가의 발생·사용(휴가 내역), 열두 달의 견줌(연간 통계), 내가 올린 신청(근무 신청 내역).
 * 한 화면에 다 얹으면 기간을 옮기는 줄이 다섯이 되어, 어느 줄을 움직였는지 모른 채 값을 읽게
 * 된다(2026-09-15 사용자 확정).
 *
 * 근무 기준과 상태 원장은 **여기서 한 번만** 읽어 탭들에 내린다. 탭마다 읽으면 같은 화면 안에서
 * 소정 근무시간이 탭마다 다른 순간이 생긴다(기준이 방금 바뀐 경우).
 *
 * 사이드바에는 여전히 줄을 두지 않는다 — 들어오는 문은 대시보드 근무체크 카드의 `근태현황`
 * 버튼이다. 주소는 살아 있으므로 탭까지 포함해 링크로 공유하거나 북마크할 수 있다.
 */
export function MyAttendanceWorkspace({
  view,
  onViewChange,
  onRequest,
}: {
  view: AttendanceView
  onViewChange: (next: AttendanceView) => void
  onRequest: (kind: 'leave' | 'overtime' | 'holiday') => void
}) {
  const userId = useAuthStore((s) => s.user?.id)
  const { data: policy, isLoading: policyLoading } = useMyAttendancePolicy()
  const { data: statuses } = useAttendanceStatuses()

  if (policyLoading) return <Spinner />

  return (
    <div className="space-y-5">
      <Tabs
        items={ATTENDANCE_TABS}
        value={view}
        onChange={(key) => onViewChange(key as AttendanceView)}
      />

      {view === 'summary' && (
        <MyAttendanceSection
          userId={userId}
          policy={policy ?? null}
          statuses={statuses ?? []}
          onRequest={onRequest}
          onOpenLeaveHistory={() => onViewChange('leave')}
        />
      )}

      {/* 달력과 그 달의 요약표는 같은 달을 보는 것이라 한 탭에 함께 선다 — 달을 옮기는 줄이
          둘이지만 둘 다 같은 달을 말한다. */}
      {view === 'month' && (
        <div className="space-y-5">
          <MyAttendanceMonthGrid
            userId={userId}
            policy={policy ?? null}
            statuses={statuses ?? []}
          />
          <MyAttendanceMonth userId={userId} policy={policy ?? null} />
        </div>
      )}

      {view === 'leave' && <MyLeaveHistory />}

      {view === 'yearly' && <MyAttendanceYearly userId={userId} policy={policy ?? null} />}

      {view === 'requests' && (
        <AttendanceRequestList
          title="근무 신청 내역"
          help="내가 올린 연장근무·휴일근무 신청서를 모읍니다. 휴가 신청은 `휴가 내역` 탭이 답합니다."
          abbrevs={[WORK_REQUEST_META.OVERTIME.abbrev, WORK_REQUEST_META.HOLIDAY.abbrev]}
          emptyText="올린 근무 신청이 없습니다."
        />
      )}
    </div>
  )
}
