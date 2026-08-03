/**
 * 근태 도메인 모델 — 타입·표기·파생값. 서버 호출은 attendanceApi/attendanceConfigApi가 갖는다.
 * 기획: docs_planning/3_7_3_management_attendance.md
 *
 * 판정 규칙(지각·조기퇴근·근무일)은 여기에 두지 않는다. DB가 판정하고 화면은 받은 값을 그린다 —
 * 규칙이 두 곳에 살면 표와 원장이 서로 다른 말을 하게 된다.
 */
import type { BadgeTone } from '@ynarcher/ui'
import dayjs from 'dayjs'

export type AttendancePlace = 'INTERNAL' | 'EXTERNAL'
export type AttendanceKind = 'WORK' | 'LEAVE' | 'ABSENT'

/** 근무지 표기 — 화면 어디서든 같은 말을 쓴다. */
export const PLACE_LABELS: Record<AttendancePlace, string> = {
  INTERNAL: '사내',
  EXTERNAL: '외부근무',
}

/** 근태 상태 원장 한 줄(설정에서 늘린다). */
export interface AttendanceStatus {
  code: string
  label: string
  tone: BadgeTone
  kind: AttendanceKind
  /** 규칙이 자동으로 매기는 상태 — 코드 고정, 라벨·톤만 고칠 수 있다. */
  isSystem: boolean
  isPaid: boolean
  sortOrder: number
  isActive: boolean
}

/** 근무 기준 한 벌. userId가 null이면 전사 기본, 값이 있으면 그 임직원 예외다. */
export interface AttendancePolicy {
  id: string
  userId: string | null
  /** 'HH:mm:ss' — 이 시각 전에는 출근을 찍을 수 없다. */
  checkInFrom: string
  /** 'HH:mm:ss' — 지각 판정선. */
  checkInTo: string
  /** 출근 시각 + 이 분(分) = 정상 퇴근 시각. */
  workMinutes: number
  /** 0=일 .. 6=토 */
  workdays: number[]
  allowExternal: boolean
  effectiveFrom: string
  note: string | null
}

/** 일별 근태 원장 한 줄. */
export interface AttendanceDay {
  id: string
  userId: string
  workDate: string
  workPlace: AttendancePlace
  checkInAt: string | null
  checkOutAt: string | null
  statusCode: string
  /** 규칙이 매긴 원본. statusCode와 다르면 관리자가 정정한 행이다. */
  autoStatusCode: string | null
  note: string | null
}

/** 정정 이력 한 줄(추가만 되고 지워지지 않는다). */
export interface AttendanceEdit {
  id: string
  field: 'status' | 'check_in_at' | 'check_out_at' | 'work_place' | 'note'
  beforeValue: string | null
  afterValue: string | null
  reason: string
  editedByName: string | null
  editedAt: string
}

/** 정정 이력의 필드 표기. */
export const EDIT_FIELD_LABELS: Record<AttendanceEdit['field'], string> = {
  status: '상태',
  check_in_at: '출근',
  check_out_at: '퇴근',
  work_place: '근무지',
  note: '비고',
}

/**
 * 일간·월간 표의 한 줄. 기록이 없는 날도 줄이 서므로 `day`가 비어 있을 수 있다.
 * 서버(attendance_board / attendance_month)가 근무일 여부까지 붙여 준다.
 */
export interface AttendanceEntry {
  isWorkday: boolean
  dayId: string | null
  workPlace: AttendancePlace | null
  checkInAt: string | null
  checkOutAt: string | null
  statusCode: string | null
  autoStatusCode: string | null
  note: string | null
}

/** 일간 표 한 줄(임직원 + 그날 근태). */
export interface AttendanceBoardRow extends AttendanceEntry {
  userId: string
  userName: string
  departmentId: string | null
}

/** 월간 표 한 줄(날짜 + 그날 근태). */
export interface AttendanceMonthRow extends AttendanceEntry {
  workDate: string
}

/** 기록이 없는 칸의 대체 상태 코드. 실제 행이 아니라 화면이 그리는 값이다. */
export const DERIVED_ABSENT = 'ABSENT'

/**
 * 그 칸에 보일 상태 코드. 기록이 있으면 그 값, 없으면 지난 근무일에 한해 결근으로 그린다.
 * 오늘·미래의 빈 칸과 근무일이 아닌 날은 상태가 없다(null) — 아직 일어나지 않은 일이다.
 */
export function displayStatusCode(entry: AttendanceEntry, dateKey: string): string | null {
  if (entry.statusCode) return entry.statusCode
  if (!entry.isWorkday) return null
  return dayjs(dateKey).isBefore(dayjs().startOf('day')) ? DERIVED_ABSENT : null
}

/** 관리자가 손댄 행인가(자동 판정과 확정 상태가 갈린 행). */
export function isCorrected(entry: AttendanceEntry): boolean {
  return Boolean(entry.autoStatusCode) && entry.autoStatusCode !== entry.statusCode
}

/** 'HH:mm:ss' 또는 ISO 시각 → 'HH:mm'. 값이 없으면 null. */
export function timeText(value: string | null): string | null {
  if (!value) return null
  return value.includes('T') ? dayjs(value).format('HH:mm') : value.slice(0, 5)
}

/** 재실 시간 'N시간 M분'. 출근·퇴근이 모두 있어야 값이 선다. */
export function durationText(checkIn: string | null, checkOut: string | null): string | null {
  if (!checkIn || !checkOut) return null
  const minutes = dayjs(checkOut).diff(dayjs(checkIn), 'minute')
  if (minutes < 0) return null
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return h ? `${h}시간 ${m}분` : `${m}분`
}

export const WEEKDAY_LABELS = ['일', '월', '화', '수', '목', '금', '토'] as const

/** 근무 요일 배열 → '월·화·수·목·금'. 비어 있으면 '없음'. */
export function workdaysText(workdays: number[]): string {
  if (!workdays.length) return '없음'
  return [...workdays].sort().map((d) => WEEKDAY_LABELS[d] ?? '?').join('·')
}

/** 분 → '9시간' / '8시간 30분'. 근무 기준 표기에 쓴다. */
export function workMinutesText(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (!h) return `${m}분`
  return m ? `${h}시간 ${m}분` : `${h}시간`
}

/** 상태 코드 → 원장의 상태. 없는 코드(비활성·삭제)는 코드를 그대로 보여 준다. */
export function statusOf(
  statuses: AttendanceStatus[],
  code: string | null,
): AttendanceStatus | null {
  if (!code) return null
  return (
    statuses.find((s) => s.code === code) ?? {
      code,
      label: code,
      tone: 'neutral',
      kind: 'WORK',
      isSystem: false,
      isPaid: true,
      sortOrder: 999,
      isActive: false,
    }
  )
}
