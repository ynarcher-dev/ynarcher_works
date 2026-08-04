import dayjs from 'dayjs'
import { describe, expect, it } from 'vitest'
import {
  EMPTY_ATTENDANCE_FILTERS,
  PENDING_STATUS,
  countedStatus,
  hasActiveAttendanceFilters,
  matchesPlace,
  matchesStatus,
  toggleStatusFilter,
  type AttendanceFilters,
} from '@/features/management/attendance/attendanceFilters'
import type {
  AttendanceEntry,
  AttendanceStatus,
} from '@/features/management/attendance/attendanceModel'
import { personSummary, statusTiles } from '@/features/management/attendance/attendanceSummary'

const YESTERDAY = dayjs().subtract(1, 'day').format('YYYY-MM-DD')
const TOMORROW = dayjs().add(1, 'day').format('YYYY-MM-DD')

function entry(over: Partial<AttendanceEntry> = {}): AttendanceEntry {
  return {
    isWorkday: true,
    dayId: null,
    workPlace: null,
    checkInAt: null,
    checkOutAt: null,
    statusCode: null,
    autoStatusCode: null,
    note: null,
    ...over,
  }
}

function status(code: string, over: Partial<AttendanceStatus> = {}): AttendanceStatus {
  return {
    code,
    label: code,
    tone: 'neutral',
    kind: 'WORK',
    isSystem: false,
    isPaid: true,
    sortOrder: 1,
    isActive: true,
    ...over,
  }
}

const STATUSES = [status('NORMAL', { label: '정상' }), status('LATE', { label: '지각', sortOrder: 2 })]

const filters = (over: Partial<AttendanceFilters> = {}): AttendanceFilters => ({
  ...EMPTY_ATTENDANCE_FILTERS,
  ...over,
})

describe('countedStatus — 빈 칸을 무엇으로 셀 것인가', () => {
  it('기록이 있으면 그 상태', () => {
    expect(countedStatus(entry({ statusCode: 'LATE' }), YESTERDAY)).toBe('LATE')
  })

  it('지난 근무일의 빈 칸은 결근', () => {
    expect(countedStatus(entry(), YESTERDAY)).toBe('ABSENT')
  })

  it('아직 오지 않은 날의 빈 칸은 미출근(아직 일어나지 않은 일)', () => {
    expect(countedStatus(entry(), TOMORROW)).toBe(PENDING_STATUS)
  })

  it('근무일이 아니면 지난 날이어도 결근이 아니다', () => {
    expect(countedStatus(entry({ isWorkday: false }), YESTERDAY)).toBe(PENDING_STATUS)
  })
})

describe('필터 판정', () => {
  it('조건이 비면 모두 통과한다', () => {
    expect(matchesPlace(entry(), filters())).toBe(true)
    expect(matchesStatus(entry(), YESTERDAY, filters())).toBe(true)
    expect(hasActiveAttendanceFilters(filters())).toBe(false)
  })

  it('근무지는 기록이 있어야 걸린다 — 안 찍은 칸은 사내로 쳐 주지 않는다', () => {
    const f = filters({ places: ['INTERNAL'] })
    expect(matchesPlace(entry({ workPlace: 'INTERNAL' }), f)).toBe(true)
    expect(matchesPlace(entry({ workPlace: 'EXTERNAL' }), f)).toBe(false)
    expect(matchesPlace(entry(), f)).toBe(false)
  })

  it('미출근도 고를 수 있는 조건이다', () => {
    const f = filters({ statuses: [PENDING_STATUS] })
    expect(matchesStatus(entry(), TOMORROW, f)).toBe(true)
    expect(matchesStatus(entry({ statusCode: 'LATE' }), TOMORROW, f)).toBe(false)
  })

  it('상태 토글은 켜고 끄기를 반복한다', () => {
    const on = toggleStatusFilter(filters(), 'LATE')
    expect(on.statuses).toEqual(['LATE'])
    expect(toggleStatusFilter(on, 'LATE').statuses).toEqual([])
  })
})

describe('statusTiles — 타일과 표가 같은 수를 말한다', () => {
  const items = [
    { entry: entry({ statusCode: 'LATE' }), dateKey: YESTERDAY },
    { entry: entry({ statusCode: 'LATE' }), dateKey: YESTERDAY },
    { entry: entry({ statusCode: 'NORMAL' }), dateKey: YESTERDAY },
    { entry: entry(), dateKey: TOMORROW }, // 미출근
    { entry: entry({ isWorkday: false }), dateKey: YESTERDAY }, // 휴무일은 세지 않는다
  ]

  it('원장 순서대로 세고 미출근은 맨 뒤에 붙인다', () => {
    const tiles = statusTiles(items, STATUSES, [], () => {})
    expect(tiles.map((t) => [t.key, t.value])).toEqual([
      ['NORMAL', '1'],
      ['LATE', '2'],
      ['PENDING', '1'],
    ])
  })

  it('단위는 값에 붙이지 않고 따로 넘긴다(규격은 StatTileGrid가 소유한다)', () => {
    const tiles = statusTiles(items, STATUSES, [], () => {})
    expect(tiles.every((t) => t.unit === '건')).toBe(true)
  })

  it('활성 상태는 0건이어도 자리를 지킨다(타일이 날마다 나타났다 사라지지 않게)', () => {
    const tiles = statusTiles([], STATUSES, [], () => {})
    expect(tiles.map((t) => [t.key, t.value])).toEqual([
      ['NORMAL', '0'],
      ['LATE', '0'],
      ['PENDING', '0'],
    ])
  })

  it('원장에 없는 코드(결근 등)도 빠뜨리지 않는다', () => {
    const tiles = statusTiles([{ entry: entry(), dateKey: YESTERDAY }], STATUSES, [], () => {})
    expect(tiles.map((t) => t.key)).toEqual(['NORMAL', 'LATE', 'ABSENT', 'PENDING'])
  })

  it('비활성 상태는 그 코드로 남은 기록이 있을 때만 세운다', () => {
    const withRetired = [...STATUSES, status('OLD_LEAVE', { isActive: false, sortOrder: 9 })]
    expect(statusTiles([], withRetired, [], () => {}).map((t) => t.key)).not.toContain('OLD_LEAVE')
    const used = [{ entry: entry({ statusCode: 'OLD_LEAVE' }), dateKey: YESTERDAY }]
    expect(statusTiles(used, withRetired, [], () => {}).map((t) => t.key)).toContain('OLD_LEAVE')
  })

  it('선택된 상태의 타일만 강조된다', () => {
    const tiles = statusTiles(items, STATUSES, ['LATE'], () => {})
    expect(tiles.find((t) => t.key === 'LATE')?.emphasis).toBe(true)
    expect(tiles.find((t) => t.key === 'NORMAL')?.emphasis).toBe(false)
  })
})

describe('personSummary — 근무일과 총 재실 시간', () => {
  it('근무일만 세고, 출퇴근이 모두 찍힌 날만 시간에 더한다', () => {
    const s = personSummary([
      entry({ checkInAt: '2026-08-03T00:00:00Z', checkOutAt: '2026-08-03T09:30:00Z' }),
      entry({ checkInAt: '2026-08-04T00:00:00Z' }), // 퇴근 미기록 — 시간에 넣지 않는다
      entry({ isWorkday: false }),
    ])
    expect(s.workdays).toBe(2)
    expect(s.hours).toBe(9.5)
  })
})
