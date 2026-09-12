import dayjs, { type Dayjs } from 'dayjs'
import type { SystemEvent } from '@/features/hub/hooks'

export const DATE_KEY = 'YYYY-MM-DD'
export const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토']

/** 조회 구간(반열린 구간 `from <= x < to`)의 ISO 문자열 한 쌍. */
export interface CalendarRange {
  from: string
  to: string
}

/**
 * 그 달의 **그리드가 실제로 그리는 구간**(첫 주의 직전 일요일 ~ 마지막 주의 토요일 다음 날).
 *
 * 달의 1일~말일이 아니라 그리드 기준인 이유는 앞뒤 달 칸도 같은 화면에 서기 때문이다 — 달
 * 기준으로 받으면 9월 그리드의 8월 31일 칸만 이유 없이 비어 "그 일정이 사라졌다"로 보인다.
 */
export function monthRange(month: Dayjs): CalendarRange {
  return {
    from: month.startOf('month').startOf('week').startOf('day').toISOString(),
    // 상한은 열린 끝이다(토요일 다음 날 0시) — 마지막 날의 23:59 일정까지 들어온다.
    to: month.endOf('month').endOf('week').startOf('day').add(1, 'day').toISOString(),
  }
}

/**
 * 이벤트를 날짜(YYYY-MM-DD)별로 묶는다. 여러 날에 걸친 일정(종료일이 시작일보다 뒤)은 시작~종료
 * 사이 모든 날짜 칸에 동일하게 넣어, 기간 내 어느 날을 봐도 표시되게 한다. 각 날 버킷은 시각순 정렬.
 */
export function groupByDate(events: SystemEvent[]): Map<string, SystemEvent[]> {
  const map = new Map<string, SystemEvent[]>()
  const push = (key: string, ev: SystemEvent) => {
    const bucket = map.get(key)
    if (bucket) bucket.push(ev)
    else map.set(key, [ev])
  }
  for (const ev of events) {
    if (!ev.starts_at) continue
    const start = dayjs(ev.starts_at).startOf('day')
    const endRaw = ev.ends_at ? dayjs(ev.ends_at).startOf('day') : start
    const end = endRaw.isBefore(start) ? start : endRaw
    let cur = start
    // 폭주 방지 상한(1년). 정상 일정은 이 안에서 끝난다.
    for (let guard = 0; guard < 366; guard += 1) {
      push(cur.format(DATE_KEY), ev)
      if (cur.isSame(end, 'day')) break
      cur = cur.add(1, 'day')
    }
  }
  for (const bucket of map.values()) {
    bucket.sort((a, b) => (a.starts_at ?? '').localeCompare(b.starts_at ?? ''))
  }
  return map
}

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
