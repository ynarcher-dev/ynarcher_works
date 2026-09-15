import { describe, expect, it } from 'vitest'
import dayjs from 'dayjs'
import type { AttendanceMonthRow } from '@/features/management/attendance/attendanceModel'
import {
  correctedAverageMinutes,
  minutesText,
  myDayStats,
  myPeriodTotals,
  weekStartOf,
} from '@/features/management/attendance/myAttendanceStats'

/** 원장 한 줄. 지정하지 않은 칸은 기록이 없는 근무일이다. */
function row(v: Partial<AttendanceMonthRow> & { workDate: string }): AttendanceMonthRow {
  return {
    isWorkday: true,
    dayId: null,
    workPlace: null,
    checkInAt: null,
    checkOutAt: null,
    statusCode: null,
    autoStatusCode: null,
    note: null,
    ...v,
  }
}

/** 소정 9시간(540분) — 전사 기본 근무 기준과 같은 값. */
const WORK_MIN = 540

describe('myDayStats', () => {
  it('재실 시간을 소정에서 잘라 소정·연장으로 나눈다', () => {
    const s = myDayStats(
      [row({ workDate: '2026-09-14', checkInAt: '2026-09-14T00:00:00Z', checkOutAt: '2026-09-14T10:00:00Z' })],
      WORK_MIN,
      '2026-09-15',
    )[0]!
    expect(s.workedMinutes).toBe(600)
    expect(s.regularMinutes).toBe(540)
    expect(s.overtimeMinutes).toBe(60)
  })

  it('소정을 채우지 못한 날은 연장이 0이고 음수가 되지 않는다', () => {
    const s = myDayStats(
      [row({ workDate: '2026-09-14', checkInAt: '2026-09-14T00:00:00Z', checkOutAt: '2026-09-14T04:00:00Z' })],
      WORK_MIN,
      '2026-09-15',
    )[0]!
    expect(s.regularMinutes).toBe(240)
    expect(s.overtimeMinutes).toBe(0)
  })

  it('퇴근이 없는 지난 날은 퇴근미체크이고, 오늘은 아직 아니다', () => {
    const stats = myDayStats(
      [
        row({ workDate: '2026-09-14', checkInAt: '2026-09-14T00:00:00Z' }),
        row({ workDate: '2026-09-15', checkInAt: '2026-09-15T00:00:00Z' }),
      ],
      WORK_MIN,
      '2026-09-15',
    )
    expect(stats[0]!.missingCheckout).toBe(true)
    expect(stats[1]!.missingCheckout).toBe(false)
    // 퇴근이 없으면 재실 시간도 값이 없다(0이 아니다).
    expect(stats[0]!.workedMinutes).toBeNull()
  })

  it('기록이 없는 지난 근무일은 결근으로 파생되고, 휴무일과 미래는 상태가 없다', () => {
    const stats = myDayStats(
      [
        row({ workDate: '2026-09-14' }),
        row({ workDate: '2026-09-19', isWorkday: false }),
        row({ workDate: '2026-09-30' }),
      ],
      WORK_MIN,
      '2026-09-15',
    )
    expect(stats[0]!.statusCode).toBe('ABSENT')
    expect(stats[1]!.statusCode).toBeNull()
    expect(stats[2]!.statusCode).toBeNull()
  })
})

describe('myPeriodTotals', () => {
  it('조합 상태는 지각과 조기퇴근 두 축에 모두 든다', () => {
    const t = myPeriodTotals(
      myDayStats(
        [
          row({ workDate: '2026-09-07', statusCode: 'LATE' }),
          row({ workDate: '2026-09-08', statusCode: 'LATE_EARLY' }),
          row({ workDate: '2026-09-09', statusCode: 'EARLY_LEAVE' }),
        ],
        WORK_MIN,
        '2026-09-15',
      ),
      WORK_MIN,
    )
    expect(t.lateCount).toBe(2)
    expect(t.earlyLeaveCount).toBe(2)
  })

  it('기준근무는 근무일 수 × 소정이며 휴무일은 빠진다', () => {
    const t = myPeriodTotals(
      myDayStats(
        [
          row({ workDate: '2026-09-14' }),
          row({ workDate: '2026-09-19', isWorkday: false }),
          row({ workDate: '2026-09-20', isWorkday: false }),
        ],
        WORK_MIN,
        '2026-09-21',
      ),
      WORK_MIN,
    )
    expect(t.workdays).toBe(1)
    expect(t.baseMinutes).toBe(540)
  })

  it('야간과 휴가는 아직 답하지 않는다(0이 아니라 값 없음)', () => {
    const t = myPeriodTotals(myDayStats([row({ workDate: '2026-09-14' })], WORK_MIN), WORK_MIN)
    expect(t.nightMinutes).toBeNull()
    expect(t.leaveMinutes).toBeNull()
  })
})

describe('correctedAverageMinutes', () => {
  it('출근한 날로 나눈다 — 쉰 날은 분모에 들지 않는다', () => {
    const t = myPeriodTotals(
      myDayStats(
        [
          row({ workDate: '2026-09-07', checkInAt: '2026-09-07T00:00:00Z', checkOutAt: '2026-09-07T08:00:00Z' }),
          row({ workDate: '2026-09-08', checkInAt: '2026-09-08T00:00:00Z', checkOutAt: '2026-09-08T10:00:00Z' }),
          row({ workDate: '2026-09-09', statusCode: 'LEAVE_ANNUAL' }),
        ],
        WORK_MIN,
        '2026-09-15',
      ),
      WORK_MIN,
    )
    // (480 + 600) / 2 = 540. 연차인 셋째 날은 분모에 들지 않는다.
    expect(correctedAverageMinutes(t)).toBe(540)
  })

  it('출근한 날이 없으면 평균은 값이 없다', () => {
    const t = myPeriodTotals(myDayStats([row({ workDate: '2026-09-14' })], WORK_MIN, '2026-09-15'), WORK_MIN)
    expect(correctedAverageMinutes(t)).toBeNull()
  })
})

describe('minutesText', () => {
  it('시간과 분을 함께 적고, 분이 0이면 시간만 적는다', () => {
    expect(minutesText(500)).toBe('8시간 20분')
    expect(minutesText(480)).toBe('8시간')
    expect(minutesText(45)).toBe('45분')
    expect(minutesText(0)).toBe('0분')
    expect(minutesText(null)).toBeNull()
  })
})

describe('weekStartOf', () => {
  it('한 주는 월요일에 시작한다 — 일요일은 앞선 월요일로 붙는다', () => {
    expect(weekStartOf(dayjs('2026-09-15')).format('YYYY-MM-DD')).toBe('2026-09-14')
    expect(weekStartOf(dayjs('2026-09-20')).format('YYYY-MM-DD')).toBe('2026-09-14')
    expect(weekStartOf(dayjs('2026-09-14')).format('YYYY-MM-DD')).toBe('2026-09-14')
  })
})
