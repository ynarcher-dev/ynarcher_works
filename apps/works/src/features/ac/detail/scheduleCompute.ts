import dayjs, { type Dayjs } from 'dayjs'
import type { ProgramModule } from '@/features/ac/hooks'
import type { TimelineItem } from '@/features/ac/detail/detailHooks'
import { readModuleSettings } from '@/features/ac/detail/moduleMeta'

export const DATE_KEY = 'YYYY-MM-DD'

/** 해당 월 그리드를 채우는 주(week) 배열. 첫 주는 직전 일요일부터, 마지막 주는 토요일까지. */
export function buildWeeks(month: Dayjs): Dayjs[][] {
  const start = month.startOf('month').startOf('week')
  const end = month.endOf('month').endOf('week')
  const weeks: Dayjs[][] = []
  let cursor = start
  while (cursor.isBefore(end) || cursor.isSame(end, 'day')) {
    const week: Dayjs[] = []
    for (let i = 0; i < 7; i += 1) {
      week.push(cursor)
      cursor = cursor.add(1, 'day')
    }
    weeks.push(week)
  }
  return weeks
}

/** 캘린더에 기간 바로 그릴 모듈(일정이 등록된 활성 모듈만). */
export interface ModuleBar {
  moduleType: string
  status: string
  start: string
  end: string
}

export function toModuleBars(modules: ProgramModule[]): ModuleBar[] {
  return modules
    .filter((m) => m.enabled)
    .flatMap((m) => {
      const s = readModuleSettings(m.settings)
      if (!s.start_date || !s.end_date) return []
      return [
        {
          moduleType: m.module_type,
          status: m.status,
          start: s.start_date,
          end: s.end_date,
        },
      ]
    })
    .sort((a, b) => a.start.localeCompare(b.start))
}

/** 특정 날짜(YYYY-MM-DD)에 걸쳐 있는 모듈 바. */
export function barsOnDate(bars: ModuleBar[], dateKey: string): ModuleBar[] {
  return bars.filter((b) => b.start <= dateKey && dateKey <= b.end)
}

/** 특정 날짜에 시작하는 타임라인 아이템(세션·행사). */
export function itemsOnDate(items: TimelineItem[], dateKey: string): TimelineItem[] {
  return items.filter(
    (it) => it.starts_at && dayjs(it.starts_at).format(DATE_KEY) === dateKey,
  )
}

/** 모듈 일정·프로그램 기간을 종합한 타임라인 표시 범위 라벨. */
export function timelineRangeLabel(
  programStart: string | null,
  programEnd: string | null,
  bars: ModuleBar[],
): string {
  const starts = [programStart, ...bars.map((b) => b.start)].filter(Boolean) as string[]
  const ends = [programEnd, ...bars.map((b) => b.end)].filter(Boolean) as string[]
  if (starts.length === 0 || ends.length === 0) return '기간 미등록'
  const min = starts.reduce((a, b) => (a < b ? a : b))
  const max = ends.reduce((a, b) => (a > b ? a : b))
  return `${dayjs(min).format('YYYY년 M월 D일')} - ${dayjs(max).format('YYYY년 M월 D일')}`
}
