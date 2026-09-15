/**
 * 휴가 사용일 선택의 계산 — 창(窓) 만들기, 고를 수 있는 날 판정, 선택 집합 연산, 요약.
 * 기획: docs_planning/3_7_3_management_attendance.md
 *
 * **판정을 새로 만들지 않는다.** 근무일인지(`isWorkday`)와 그날 이미 무슨 휴가가 잡혀 있는지는
 * 근태 원장(`attendance_month`)이 답한 값을 그대로 쓴다 — 여기서 요일로 다시 세면 임직원별
 * 근무 기준 예외를 가진 사람의 달력이 관리자 화면과 다른 말을 한다.
 *
 * 공휴일은 **아직 답하지 못한다.** 공휴일 원장이 없어 `근무계획` 줄은 근무일·휴무일 둘만
 * 적는다. 원장이 서면 그 이름(추석·개천절 등)이 이 줄에 들어올 자리다.
 */
import dayjs from 'dayjs'
import {
  statusOf,
  type AttendanceMonthRow,
  type AttendanceStatus,
} from '@/features/management/attendance/attendanceModel'

/** 고르는 방식 — 날짜를 하나씩 집거나, 시작·종료로 구간을 집는다. */
export type LeaveSelectMode = 'DATES' | 'RANGE'

/** 달력 한 칸이 아는 것 전부. 화면은 이 값만 보고 그린다. */
export interface LeaveDay {
  /** YYYY-MM-DD */
  date: string
  /** 0=일 .. 6=토 */
  weekday: number
  isWorkday: boolean
  /** 그날 이미 잡힌 휴가의 이름(근태 원장). 없으면 null. */
  usedLeaveLabel: string | null
}

/**
 * 한 번에 펴 보이는 날 수(2주).
 *
 * 가로로 밀어 보지 않는다(2026-09-15 사용자 지정) — 창에 든 날은 전부 한 화면에 선다. 그래서
 * 날 수는 **2:1 배치의 왼쪽 폭에 칸이 좁아지지 않고 들어가는 만큼**으로 정해진다. 3주를 넣으면
 * 하루 칸이 `근무일` 세 글자보다 좁아져 글자가 접힌다. 더 앞뒤를 보려면 화살표로 창을 민다.
 */
export const LEAVE_WINDOW_DAYS = 14
/** 좌우 화살표가 미는 날 수(1주). */
export const LEAVE_WINDOW_STEP = 7

/**
 * 창의 시작일 — 그 주의 월요일.
 *
 * 아무 날에서나 시작하면 화살표를 누를 때마다 요일 자리가 밀려, 같은 자리에 서던 토·일이
 * 창마다 다른 칸으로 옮겨 다닌다. 주 단위로 고정하면 창을 넘겨도 격자가 흔들리지 않는다.
 */
export function leaveWindowStart(anchor: dayjs.Dayjs): dayjs.Dayjs {
  const diff = (anchor.day() + 6) % 7 // 월요일=0이 되도록 민다
  return anchor.subtract(diff, 'day').startOf('day')
}

/** 근태 원장 행 → 달력 칸. 기록이 없는 날도 행이 서므로 그대로 이어진다. */
export function buildLeaveDays(
  rows: AttendanceMonthRow[],
  statuses: AttendanceStatus[],
): LeaveDay[] {
  return rows.map((r) => {
    const status = statusOf(statuses, r.statusCode)
    return {
      date: r.workDate,
      weekday: dayjs(r.workDate).day(),
      isWorkday: r.isWorkday,
      usedLeaveLabel: status && status.kind === 'LEAVE' ? status.label : null,
    }
  })
}

/**
 * 고를 수 있는 날인가 — 근무일이면서 아직 휴가가 잡히지 않은 날.
 *
 * 휴무일에 휴가를 걸면 쉬는 날을 연차로 깎게 되고, 이미 휴가인 날에 또 걸면 같은 날이 두 번
 * 차감된다. 지난 날은 막지 않는다 — 사후 신청(병가·경조)이 실제로 있다.
 */
export function isLeaveSelectable(day: LeaveDay): boolean {
  return day.isWorkday && day.usedLeaveLabel === null
}

/** 날짜 하나를 집거나 놓는다. 결과는 언제나 날짜순·중복 없음이다. */
export function toggleLeaveDate(selected: string[], date: string): string[] {
  const next = selected.includes(date)
    ? selected.filter((d) => d !== date)
    : [...selected, date]
  return [...next].sort()
}

/**
 * 구간의 두 끝 사이에서 **고를 수 있는 날만** 담는다(휴무일·이미 쓴 휴가는 건너뛴다).
 * 두 끝의 앞뒤가 바뀌어 들어와도 같은 결과를 낸다 — 사람이 뒤에서 앞으로 집을 수 있다.
 */
export function fillLeaveRange(days: LeaveDay[], a: string, b: string): string[] {
  const [from, to] = a <= b ? [a, b] : [b, a]
  return days
    .filter((d) => d.date >= from && d.date <= to && isLeaveSelectable(d))
    .map((d) => d.date)
}

/** 달력 머리의 달 묶음 — `2026-09`가 몇 칸을 차지하는가. */
export function leaveMonthSpans(days: LeaveDay[]): { key: string; span: number }[] {
  const out: { key: string; span: number }[] = []
  for (const d of days) {
    const key = d.date.slice(0, 7)
    const last = out[out.length - 1]
    if (last && last.key === key) last.span += 1
    else out.push({ key, span: 1 })
  }
  return out
}

/** 고른 날들이 말하는 것 — 첫날·마지막날·일수, 그리고 사이가 끊겼는지. */
export interface LeaveSummary {
  start: string | null
  end: string | null
  /** 고른 날 수. 종일 기준이라 하루가 1일이다(반차는 연차 원장이 선 뒤의 일이다). */
  days: number
  /**
   * 첫날부터 마지막날 사이에 **고르지 않은 근무일**이 있는가.
   * 있으면 시작·종료 두 칸만으로는 신청 내용을 온전히 적을 수 없다는 뜻이다.
   */
  broken: boolean
}

export function leaveSummary(selected: string[], days: LeaveDay[]): LeaveSummary {
  if (selected.length === 0) return { start: null, end: null, days: 0, broken: false }
  const sorted = [...selected].sort()
  const start = sorted[0]!
  const end = sorted[sorted.length - 1]!
  const between = days.filter(
    (d) => d.date > start && d.date < end && isLeaveSelectable(d) && !selected.includes(d.date),
  )
  return { start, end, days: sorted.length, broken: between.length > 0 }
}

/** 고른 날들을 사람이 읽는 한 줄로 — `2026-09-21 ~ 2026-09-23 (3일)`. */
export function leaveRangeText(summary: LeaveSummary): string {
  if (!summary.start || !summary.end) return ''
  const span =
    summary.start === summary.end ? summary.start : `${summary.start} ~ ${summary.end}`
  return `${span} (${summary.days}일)`
}

/**
 * 문서 제목 — 사람이 적지 않는다.
 *
 * 휴가는 제목에 적을 것이 휴가 종류와 언제·며칠뿐이라 손으로 적게 하면 문서함에서 같은 신청이
 * 사람마다 다른 이름으로 선다. 종류가 아직 정해지지 않았으면 `휴가 신청`으로 세운다.
 */
export function leaveTitle(typeLabel: string, summary: LeaveSummary): string {
  const head = typeLabel.trim() || '휴가'
  const tail = leaveRangeText(summary)
  return tail ? `${head} 신청 ${tail}` : `${head} 신청`
}
