import type { TabItem } from '@ynarcher/ui'

/**
 * 근태현황이 가진 다섯 화면과 그 이름 — **주소가 곧 이 키다**(`?tab=attendance&view=...`).
 * 기획: docs_planning/3_7_3_management_attendance.md
 *
 * 화면(`MyAttendanceWorkspace`)이 아니라 이 파일이 목록을 갖는 이유는, 주소를 읽는 쪽
 * (`MyOfficePage`)도 같은 목록을 봐야 하기 때문이다. 목록이 화면 안에 있으면 주소를 읽는 쪽은
 * 자기 목록을 따로 들게 되고, 탭이 하나 늘어난 날 한쪽만 고쳐져 모르는 주소가 된다.
 */
export type AttendanceView = 'summary' | 'month' | 'leave' | 'yearly' | 'requests'

export const ATTENDANCE_TABS: TabItem[] = [
  { key: 'summary', label: '휴가/근무' },
  { key: 'month', label: '근무 현황' },
  { key: 'leave', label: '휴가 내역' },
  { key: 'yearly', label: '연간 통계' },
  { key: 'requests', label: '근무 신청 내역' },
]

/** 모르는 `view` 값은 첫 탭으로 읽는다(옛 북마크·오타 주소가 빈 화면을 만들지 않게). */
export function attendanceViewOf(value: string | null | undefined): AttendanceView {
  return ATTENDANCE_TABS.some((t) => t.key === value) ? (value as AttendanceView) : 'summary'
}
