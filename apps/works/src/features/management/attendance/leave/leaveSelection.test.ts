import dayjs from 'dayjs'
import { describe, expect, it } from 'vitest'
import type { AttendanceStatus } from '@/features/management/attendance/attendanceModel'
import {
  buildLeaveDays,
  fillLeaveRange,
  isLeaveSelectable,
  leaveMonthSpans,
  leaveRangeText,
  leaveSummary,
  leaveTitle,
  leaveWindowStart,
  toggleLeaveDate,
  type LeaveDay,
} from '@/features/management/attendance/leave/leaveSelection'

const statuses: AttendanceStatus[] = [
  {
    code: 'ANNUAL',
    label: '연차',
    tone: 'info',
    kind: 'LEAVE',
    isSystem: false,
    isPaid: true,
    sortOrder: 10,
    isActive: true,
  },
  {
    code: 'NORMAL',
    label: '정상',
    tone: 'success',
    kind: 'WORK',
    isSystem: true,
    isPaid: true,
    sortOrder: 0,
    isActive: true,
  },
]

const day = (date: string, over: Partial<LeaveDay> = {}): LeaveDay => ({
  date,
  weekday: dayjs(date).day(),
  isWorkday: true,
  usedLeaveLabel: null,
  ...over,
})

// 2026-09-21(월) ~ 2026-09-27(일). 26(토)·27(일)은 휴무일, 23(수)은 이미 연차.
const days: LeaveDay[] = [
  day('2026-09-21'),
  day('2026-09-22'),
  day('2026-09-23', { usedLeaveLabel: '연차' }),
  day('2026-09-24'),
  day('2026-09-25'),
  day('2026-09-26', { isWorkday: false }),
  day('2026-09-27', { isWorkday: false }),
]

describe('leaveWindowStart', () => {
  it('어느 요일에서 시작하든 그 주 월요일을 돌려준다', () => {
    expect(leaveWindowStart(dayjs('2026-09-15')).format('YYYY-MM-DD')).toBe('2026-09-14')
    expect(leaveWindowStart(dayjs('2026-09-20')).format('YYYY-MM-DD')).toBe('2026-09-14')
    expect(leaveWindowStart(dayjs('2026-09-14')).format('YYYY-MM-DD')).toBe('2026-09-14')
  })
})

describe('buildLeaveDays', () => {
  it('근태 원장의 근무일 판정과 휴가 상태를 그대로 옮긴다', () => {
    const built = buildLeaveDays(
      [
        {
          workDate: '2026-09-21',
          isWorkday: true,
          dayId: null,
          workPlace: null,
          checkInAt: null,
          checkOutAt: null,
          statusCode: 'ANNUAL',
          autoStatusCode: null,
          note: null,
        },
        {
          workDate: '2026-09-26',
          isWorkday: false,
          dayId: null,
          workPlace: null,
          checkInAt: null,
          checkOutAt: null,
          statusCode: null,
          autoStatusCode: null,
          note: null,
        },
      ],
      statuses,
    )
    expect(built[0]).toEqual({
      date: '2026-09-21',
      weekday: 1,
      isWorkday: true,
      usedLeaveLabel: '연차',
    })
    expect(built[1]?.usedLeaveLabel).toBeNull()
  })

  it('근무 상태(정상)는 휴가 이름으로 세우지 않는다', () => {
    const built = buildLeaveDays(
      [
        {
          workDate: '2026-09-21',
          isWorkday: true,
          dayId: null,
          workPlace: null,
          checkInAt: null,
          checkOutAt: null,
          statusCode: 'NORMAL',
          autoStatusCode: null,
          note: null,
        },
      ],
      statuses,
    )
    expect(built[0]?.usedLeaveLabel).toBeNull()
  })
})

describe('isLeaveSelectable', () => {
  it('근무일이면서 휴가가 없는 날만 고를 수 있다', () => {
    expect(isLeaveSelectable(day('2026-09-21'))).toBe(true)
    expect(isLeaveSelectable(day('2026-09-26', { isWorkday: false }))).toBe(false)
    expect(isLeaveSelectable(day('2026-09-23', { usedLeaveLabel: '연차' }))).toBe(false)
  })
})

describe('toggleLeaveDate', () => {
  it('집으면 더하고 다시 누르면 뺀다', () => {
    expect(toggleLeaveDate([], '2026-09-22')).toEqual(['2026-09-22'])
    expect(toggleLeaveDate(['2026-09-22'], '2026-09-22')).toEqual([])
  })

  it('언제나 날짜순으로 정렬해 돌려준다', () => {
    expect(toggleLeaveDate(['2026-09-25'], '2026-09-21')).toEqual(['2026-09-21', '2026-09-25'])
  })
})

describe('fillLeaveRange', () => {
  it('구간 안에서 고를 수 있는 날만 담는다', () => {
    expect(fillLeaveRange(days, '2026-09-21', '2026-09-27')).toEqual([
      '2026-09-21',
      '2026-09-22',
      '2026-09-24',
      '2026-09-25',
    ])
  })

  it('두 끝이 뒤바뀌어 들어와도 같은 결과를 낸다', () => {
    expect(fillLeaveRange(days, '2026-09-25', '2026-09-24')).toEqual([
      '2026-09-24',
      '2026-09-25',
    ])
  })
})

describe('leaveMonthSpans', () => {
  it('이어지는 같은 달을 한 묶음으로 센다', () => {
    const spans = leaveMonthSpans([
      day('2026-09-29'),
      day('2026-09-30'),
      day('2026-10-01'),
    ])
    expect(spans).toEqual([
      { key: '2026-09', span: 2 },
      { key: '2026-10', span: 1 },
    ])
  })
})

describe('leaveSummary', () => {
  it('첫날·마지막날·일수를 센다', () => {
    expect(leaveSummary(['2026-09-22', '2026-09-21'], days)).toEqual({
      start: '2026-09-21',
      end: '2026-09-22',
      days: 2,
      broken: false,
    })
  })

  it('고르지 않은 근무일이 사이에 있으면 끊긴 선택으로 본다', () => {
    expect(leaveSummary(['2026-09-21', '2026-09-25'], days).broken).toBe(true)
  })

  it('사이에 있는 것이 휴무일·이미 쓴 휴가뿐이면 끊긴 것이 아니다', () => {
    expect(leaveSummary(['2026-09-22', '2026-09-24'], days).broken).toBe(false)
  })

  it('아무것도 고르지 않으면 빈 요약이다', () => {
    expect(leaveSummary([], days)).toEqual({ start: null, end: null, days: 0, broken: false })
  })
})

describe('leaveRangeText / leaveTitle', () => {
  it('하루는 한 날짜로, 여러 날은 구간으로 적는다', () => {
    expect(leaveRangeText(leaveSummary(['2026-09-21'], days))).toBe('2026-09-21 (1일)')
    expect(leaveRangeText(leaveSummary(['2026-09-21', '2026-09-22'], days))).toBe(
      '2026-09-21 ~ 2026-09-22 (2일)',
    )
  })

  it('제목은 휴가 종류와 기간으로 선다', () => {
    expect(leaveTitle('연차', leaveSummary(['2026-09-21'], days))).toBe(
      '연차 신청 2026-09-21 (1일)',
    )
  })

  it('종류·기간이 아직 없으면 이름만 세운다', () => {
    expect(leaveTitle('', leaveSummary([], days))).toBe('휴가 신청')
  })
})
