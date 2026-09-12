import dayjs from 'dayjs'
import { describe, expect, it } from 'vitest'
import { buildWeeks, DATE_KEY, groupByDate, monthRange } from '@/features/hub/calendarGrid'
import type { SystemEvent } from '@/features/hub/hooks'

function ev(part: Partial<SystemEvent> & { id: string; starts_at: string }): SystemEvent {
  return {
    event_type: 'WORK',
    title: part.id,
    ends_at: null,
    body: null,
    created_by: null,
    ...part,
  }
}

describe('monthRange — 조회 구간은 달이 아니라 그리드다', () => {
  it('첫 주의 직전 일요일에서 시작해 마지막 주 토요일 다음 날 0시에 끝난다', () => {
    // 2026-09-01은 화요일 → 그리드 첫 칸은 8/30(일), 마지막 칸은 10/3(토).
    const month = dayjs('2026-09-01')
    const range = monthRange(month)
    expect(dayjs(range.from).format('YYYY-MM-DD HH:mm')).toBe('2026-08-30 00:00')
    expect(dayjs(range.to).format('YYYY-MM-DD HH:mm')).toBe('2026-10-04 00:00')
  })

  it('상한이 열린 끝이라 마지막 칸의 23:59 일정도 구간에 든다', () => {
    const range = monthRange(dayjs('2026-09-01'))
    const lastCellLate = dayjs('2026-10-03T23:59')
    expect(lastCellLate.isBefore(dayjs(range.to))).toBe(true)
  })
})

describe('groupByDate — 여러 날 일정은 걸친 모든 칸에 선다', () => {
  it('기간 일정은 시작~종료 사이 모든 날짜 버킷에 들어간다', () => {
    const map = groupByDate([
      ev({ id: 'trip', starts_at: '2026-09-10T09:00', ends_at: '2026-09-12T18:00' }),
    ])
    expect([...map.keys()].sort()).toEqual(['2026-09-10', '2026-09-11', '2026-09-12'])
  })

  it('종료가 시작보다 빠른 행은 시작 하루만 차지한다(칸이 폭주하지 않는다)', () => {
    const map = groupByDate([
      ev({ id: 'broken', starts_at: '2026-09-10T09:00', ends_at: '2026-09-01T09:00' }),
    ])
    expect([...map.keys()]).toEqual(['2026-09-10'])
  })

  it('같은 날 버킷은 시작 시각순으로 정렬된다', () => {
    const map = groupByDate([
      ev({ id: 'late', starts_at: '2026-09-10T15:00' }),
      ev({ id: 'early', starts_at: '2026-09-10T09:00' }),
    ])
    expect(map.get('2026-09-10')?.map((e) => e.id)).toEqual(['early', 'late'])
  })

  it('시작이 없는 행은 어느 칸에도 서지 않는다', () => {
    const map = groupByDate([{ ...ev({ id: 'x', starts_at: '' }), starts_at: null }])
    expect(map.size).toBe(0)
  })
})

describe('buildWeeks — 그리드는 주 단위로 꽉 찬다', () => {
  it('모든 주가 7칸이고 앞뒤는 일요일·토요일로 맞는다', () => {
    const weeks = buildWeeks(dayjs('2026-09-01'))
    expect(weeks.every((w) => w.length === 7)).toBe(true)
    expect(weeks[0]?.[0]?.format(DATE_KEY)).toBe('2026-08-30')
    expect(weeks.at(-1)?.at(-1)?.format(DATE_KEY)).toBe('2026-10-03')
  })
})
