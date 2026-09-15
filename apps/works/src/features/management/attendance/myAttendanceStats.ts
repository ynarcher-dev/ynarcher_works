/**
 * 개인 근태현황의 집계 — 일별 파생값과 기간 합계.
 * 기획: docs_planning/3_7_3_management_attendance.md
 *
 * **판정은 여기서 하지 않는다.** 지각·조기퇴근·결근은 DB가 매긴 `statusCode`가 답하고, 이
 * 파일은 그 값을 세고 시간을 더할 뿐이다(규칙이 두 곳에 살면 관리자 표와 내 화면이 서로 다른
 * 말을 한다). 여기서 새로 계산하는 것은 원장에 칸이 없는 파생값 둘뿐이다.
 *
 * * **소정·연장 분해** — 재실 시간을 소정 근무시간에서 자른다. 원장에 저장하지 않는 이유는
 *   기준이 바뀌었을 때 과거 값이 따라오지 않기 때문이다(예산·지출에서 이미 같은 판단을 했다).
 * * **퇴근미체크** — 상태 원장에 코드를 늘리지 않고 집계 축으로만 센다. 상태로 만들면
 *   `지각·퇴근미체크` 같은 조합이 또 필요해지고, 이는 조합 상태를 없애려는 방향과 반대다.
 *
 * **야간 근무는 아직 답하지 않는다.** 22:00~06:00 기준 시각이 근무 기준에 없어서, 여기서 값을
 * 지어내는 대신 `null`로 두고 화면이 `—`로 그린다 — 0으로 적으면 '야간 근무가 없었다'는 거짓을
 * 말하게 된다. 휴가 시간도 같은 이유로 `null`이다(연차 원장이 서기 전이다).
 */
import dayjs from 'dayjs'
import {
  DERIVED_ABSENT,
  displayStatusCode,
  type AttendanceMonthRow,
} from '@/features/management/attendance/attendanceModel'

/** 하루의 파생값 한 벌. 원장 행(`AttendanceMonthRow`)에 계산된 칸을 얹은 것이다. */
export interface MyDayStat {
  workDate: string
  isWorkday: boolean
  checkInAt: string | null
  checkOutAt: string | null
  /** 그 칸에 보일 상태 코드(기록이 없는 지난 근무일은 결근으로 파생된다). */
  statusCode: string | null
  /** 재실 시간(분). 출근·퇴근이 모두 찍힌 날만 값이 선다. */
  workedMinutes: number | null
  /** 소정 안에서 일한 시간(분). */
  regularMinutes: number
  /** 소정을 넘긴 시간(분). */
  overtimeMinutes: number
  /** 출근은 찍혔는데 퇴근이 없는 날(오늘은 세지 않는다 — 아직 퇴근 전이다). */
  missingCheckout: boolean
}

/** 기간 합계 한 벌. 연·주·월 세 블록이 같은 함수를 기간만 바꿔 쓴다. */
export interface MyPeriodTotals {
  /** 근무일 수(근무 요일에 드는 날). */
  workdays: number
  /** 실제로 출근을 찍은 날 수. */
  attendedDays: number
  /** 기준 근무시간(분) — 근무일 수 × 소정. */
  baseMinutes: number
  /** 실근무(분) — 재실 시간의 합. */
  workedMinutes: number
  regularMinutes: number
  overtimeMinutes: number
  /** 야간(분). 기준 시각이 서기 전이라 아직 답하지 않는다. */
  nightMinutes: number | null
  /** 휴가(분). 연차 원장이 서기 전이라 아직 답하지 않는다. */
  leaveMinutes: number | null
  lateCount: number
  earlyLeaveCount: number
  missingCheckoutCount: number
  absentCount: number
}

/** 지각으로 세는 상태 — 조합 상태는 두 축 모두에 든다. */
const LATE_CODES = new Set(['LATE', 'LATE_EARLY'])
/** 조기퇴근으로 세는 상태. */
const EARLY_CODES = new Set(['EARLY_LEAVE', 'LATE_EARLY'])

/**
 * 원장 행 → 일별 파생값.
 *
 * `workMinutes`는 소정 근무시간이며 지금은 **현재 근무 기준 한 값**을 기간 전체에 쓴다. 원장에는
 * 날짜별 스냅샷(`policy_work_minutes`)이 있지만 기록이 없는 날에는 그 값이 없어서, 기간 안에서
 * 어느 날은 스냅샷·어느 날은 현재값을 섞으면 같은 표의 합계가 두 기준으로 더해진다. 근무 기준이
 * 바뀌면 그 뒤로 이 화면의 기준근무가 통째로 새 값으로 읽힌다는 뜻이고, 그것이 지금 단계의 한계다.
 */
export function myDayStats(
  rows: AttendanceMonthRow[],
  workMinutes: number,
  today = dayjs().format('YYYY-MM-DD'),
): MyDayStat[] {
  return rows.map((row) => {
    const worked =
      row.checkInAt && row.checkOutAt
        ? Math.max(0, dayjs(row.checkOutAt).diff(dayjs(row.checkInAt), 'minute'))
        : null
    return {
      workDate: row.workDate,
      isWorkday: row.isWorkday,
      checkInAt: row.checkInAt,
      checkOutAt: row.checkOutAt,
      statusCode: displayStatusCode(row, row.workDate),
      workedMinutes: worked,
      regularMinutes: worked === null ? 0 : Math.min(worked, workMinutes),
      overtimeMinutes: worked === null ? 0 : Math.max(0, worked - workMinutes),
      // 오늘 아직 퇴근하지 않은 것은 미체크가 아니다.
      missingCheckout: Boolean(row.checkInAt) && !row.checkOutAt && row.workDate < today,
    }
  })
}

/** 일별 파생값 → 기간 합계. */
export function myPeriodTotals(stats: MyDayStat[], workMinutes: number): MyPeriodTotals {
  const t: MyPeriodTotals = {
    workdays: 0,
    attendedDays: 0,
    baseMinutes: 0,
    workedMinutes: 0,
    regularMinutes: 0,
    overtimeMinutes: 0,
    nightMinutes: null,
    leaveMinutes: null,
    lateCount: 0,
    earlyLeaveCount: 0,
    missingCheckoutCount: 0,
    absentCount: 0,
  }
  for (const s of stats) {
    if (s.isWorkday) t.workdays += 1
    if (s.checkInAt) t.attendedDays += 1
    if (s.workedMinutes !== null) t.workedMinutes += s.workedMinutes
    t.regularMinutes += s.regularMinutes
    t.overtimeMinutes += s.overtimeMinutes
    if (s.missingCheckout) t.missingCheckoutCount += 1
    if (s.statusCode && LATE_CODES.has(s.statusCode)) t.lateCount += 1
    if (s.statusCode && EARLY_CODES.has(s.statusCode)) t.earlyLeaveCount += 1
    if (s.statusCode === DERIVED_ABSENT) t.absentCount += 1
  }
  t.baseMinutes = t.workdays * workMinutes
  return t
}

/**
 * 보정평균(분) — 총 실근무를 **실제로 출근한 날**로 나눈다.
 *
 * 근무일 수로 나누지 않는 것이 '보정'이다. 휴가·결근으로 일하지 않은 날까지 분모에 넣으면
 * 쉰 날이 많을수록 하루 평균이 짧아져, 하루를 얼마나 일하는 사람인가를 말하지 못한다.
 * 출근한 날이 없으면 평균은 값이 없다(0이 아니다).
 */
export function correctedAverageMinutes(t: MyPeriodTotals): number | null {
  if (t.attendedDays === 0) return null
  return Math.round(t.workedMinutes / t.attendedDays)
}

/**
 * 아직 답하지 못하는 칸에 적는 것 — **아무것도 적지 않는다**(2026-09-15 사용자 확정).
 *
 * 값은 보이지 않는 공백 하나다. 빈 문자열을 그대로 두면 그 줄의 높이가 0이 되어, 값이 있는
 * 날과 없는 날에서 라벨과 구분선의 간격이 달라진다 — 화면에서는 공란이면서 자리는 지킨다.
 */
export const EMPTY_TEXT = ' '

/**
 * 분 → `8시간 30분`. 0분은 `0시간`이고, 값이 없으면 `null`(화면이 공란으로 그린다).
 *
 * `workMinutesText`(근무 기준 표기)와 나누지 않는 이유는 쓰임이 다르기 때문이다. 그쪽은 규칙을
 * 적는 자리라 분이 0이면 `9시간`으로 끝나면 되지만, 여기는 잰 값이라 `0시간`도 사실이다.
 */
export function minutesText(minutes: number | null): string | null {
  if (minutes === null) return null
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (!h) return `${m}분`
  return m ? `${h}시간 ${m}분` : `${h}시간`
}

/** 주의 시작(월요일). 회사의 한 주는 월요일에 시작한다 — 주간 표의 첫 칸이 곧 이 값이다. */
export function weekStartOf(date: dayjs.Dayjs): dayjs.Dayjs {
  const dow = date.day() // 0=일
  return date.startOf('day').subtract(dow === 0 ? 6 : dow - 1, 'day')
}
