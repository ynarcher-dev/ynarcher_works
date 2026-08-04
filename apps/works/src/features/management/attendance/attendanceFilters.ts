/**
 * 근태 목록의 조건 — 필터의 형태와 판정을 한곳에 모은다.
 * 기획: docs_planning/3_7_3_management_attendance.md
 *
 * 날짜별·인력별 두 뷰가 같은 조건을 공유한다. 세는 규칙이 화면마다 흩어지면 "지각"이 표와 요약
 * 타일에서 서로 다른 수를 말하게 된다 — 판정은 여기 하나뿐이다.
 *
 * 상태 조건과 나머지 조건(근무지)을 갈라 두는 이유는 요약 타일 때문이다. 타일은 "상태를 빼고
 * 좁힌" 집합을 세야 한다 — 타일을 눌러 상태를 오갈 때마다 건수가 함께 흔들리면 무엇을 고르는지
 * 알 수 없다.
 */
import {
  displayStatusCode,
  type AttendanceEntry,
} from '@/features/management/attendance/attendanceModel'

/**
 * 아직 찍지 않은 칸의 필터 값. 상태 원장에 없는 코드다 — 상태가 아니라 '아직 일어나지 않은 일'을
 * 세는 자리라 원장에 넣지 않고 화면 쪽 값으로 둔다(요약 타일의 '미출근'과 같은 값을 쓴다).
 */
export const PENDING_STATUS = 'PENDING'
export const PENDING_LABEL = '미출근'

/** 소속이 지정되지 않은 사람을 묶는 값. 빈 문자열은 고를 수 없으므로 글자를 준다. */
export const NO_AFFILIATION = '소속 없음'

export interface AttendanceFilters {
  /** 상태 코드. 기록이 없는 칸은 `PENDING_STATUS`로 걸린다. */
  statuses: string[]
  /** 근무지(`AttendancePlace`). */
  places: string[]
  /** 소속 표기. 날짜별 뷰 전용이다 — 인력별은 한 사람이라 조건이 되지 못한다. */
  affiliations: string[]
}

export const EMPTY_ATTENDANCE_FILTERS: AttendanceFilters = {
  statuses: [],
  places: [],
  affiliations: [],
}

export function hasActiveAttendanceFilters(filters: AttendanceFilters): boolean {
  return (
    filters.statuses.length > 0 || filters.places.length > 0 || filters.affiliations.length > 0
  )
}

/** 그 칸을 무슨 상태로 셀 것인가 — 기록이 없으면 미출근. 표·타일·필터가 이 값 하나를 공유한다. */
export function countedStatus(entry: AttendanceEntry, dateKey: string): string {
  return displayStatusCode(entry, dateKey) ?? PENDING_STATUS
}

/**
 * 근무지 조건. 근무지는 기록이 있어야 값이 서므로 안 찍은 칸은 어떤 근무지 조건에도 걸리지 않는다
 * — 빈 칸을 '사내'로 쳐 주면 오지 않은 사람이 사내 근무자 목록에 선다.
 */
export function matchesPlace(entry: AttendanceEntry, filters: AttendanceFilters): boolean {
  if (!filters.places.length) return true
  return Boolean(entry.workPlace) && filters.places.includes(entry.workPlace as string)
}

/** 상태 조건. 날짜가 함께 필요한 이유는 빈 칸이 결근(지난 날)과 미출근(오늘 이후)으로 갈리기 때문이다. */
export function matchesStatus(
  entry: AttendanceEntry,
  dateKey: string,
  filters: AttendanceFilters,
): boolean {
  if (!filters.statuses.length) return true
  return filters.statuses.includes(countedStatus(entry, dateKey))
}

/** 상태 하나를 켜고 끈다(요약 타일 클릭과 필터 팝오버가 같은 규칙을 쓴다). */
export function toggleStatusFilter(
  filters: AttendanceFilters,
  code: string,
): AttendanceFilters {
  return {
    ...filters,
    statuses: filters.statuses.includes(code)
      ? filters.statuses.filter((c) => c !== code)
      : [...filters.statuses, code],
  }
}
