import { Badge, type BadgeTone } from '@ynarcher/ui'
import dayjs, { type Dayjs } from 'dayjs'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useMemo, useState } from 'react'
import type { SystemEvent } from '@/features/hub/hooks'

const layerTone: Record<string, BadgeTone> = {
  AC: 'info',
  PROJECT: 'success',
  FUND: 'warning',
  COMPANY: 'neutral',
}

/** 셀 내부 이벤트 칩(레이어별 서브틀 배경 + 텍스트). Badge 팔레트와 동일 계열. */
const chipClass: Record<BadgeTone, string> = {
  neutral: 'bg-gray-100 text-gray-600',
  success: 'bg-success-subtle text-success',
  warning: 'bg-warning-subtle text-warning',
  info: 'bg-info-subtle text-info',
  danger: 'bg-danger-subtle text-danger',
}

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토']
const DATE_KEY = 'YYYY-MM-DD'

/** 이벤트를 날짜(YYYY-MM-DD)별로 묶고 시각 오름차순 정렬한다. */
function groupByDate(events: SystemEvent[]): Map<string, SystemEvent[]> {
  const map = new Map<string, SystemEvent[]>()
  for (const ev of events) {
    if (!ev.starts_at) continue
    const key = dayjs(ev.starts_at).format(DATE_KEY)
    const bucket = map.get(key)
    if (bucket) bucket.push(ev)
    else map.set(key, [ev])
  }
  for (const bucket of map.values()) {
    bucket.sort((a, b) => (a.starts_at ?? '').localeCompare(b.starts_at ?? ''))
  }
  return map
}

/** 해당 월 그리드를 채우는 주(week) 배열. 첫 주는 직전 일요일부터, 마지막 주는 토요일까지. */
function buildWeeks(month: Dayjs): Dayjs[][] {
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

/** 전사 통합 캘린더 월간 그리드(AC/PROJECT/FUND/COMPANY 4개 레이어). */
export function MonthCalendar({ events }: { events: SystemEvent[] }) {
  const today = dayjs()
  const [month, setMonth] = useState<Dayjs>(today.startOf('month'))
  const [selected, setSelected] = useState<string>(today.format(DATE_KEY))

  const byDate = useMemo(() => groupByDate(events), [events])
  const weeks = useMemo(() => buildWeeks(month), [month])
  const selectedEvents = byDate.get(selected) ?? []

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* 좌우 배치: 좌측(헤더+달력) 2 · 우측 정보 1 */}
      <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 lg:grid-cols-3 lg:items-stretch">
      {/* 좌측: 헤더 + 그리드 (2/3) */}
      <div className="flex min-h-0 flex-col space-y-4 lg:col-span-2">
      {/* 헤더: 월 이동(중앙) + 오늘(우측) */}
      <div className="relative flex items-center justify-center">
        <div className="flex items-center gap-1">
          <button
            type="button"
            aria-label="이전 달"
            onClick={() => setMonth((m) => m.subtract(1, 'month'))}
            className="grid h-8 w-8 place-items-center rounded-radius-sm text-gray-500 transition-colors duration-fast hover:bg-gray-100 hover:text-gray-800"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <h2 className="min-w-[7.5rem] text-center text-title-sm font-bold text-gray-900">
            {month.format('YYYY년 M월')}
          </h2>
          <button
            type="button"
            aria-label="다음 달"
            onClick={() => setMonth((m) => m.add(1, 'month'))}
            className="grid h-8 w-8 place-items-center rounded-radius-sm text-gray-500 transition-colors duration-fast hover:bg-gray-100 hover:text-gray-800"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
        <button
          type="button"
          onClick={() => {
            setMonth(today.startOf('month'))
            setSelected(today.format(DATE_KEY))
          }}
          className="absolute right-0 rounded-radius-sm border border-gray-300 px-3 py-1.5 text-caption font-semibold text-gray-600 transition-colors duration-fast hover:bg-gray-50 hover:text-gray-900"
        >
          오늘
        </button>
      </div>

      {/* 그리드 */}
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-radius-md border border-gray-300 bg-gray-0 shadow-soft">
        <div className="grid grid-cols-7 border-b border-gray-300 bg-gray-25">
          {WEEKDAYS.map((w, i) => (
            <div
              key={w}
              className={`py-2 text-center text-caption font-semibold ${
                i === 0 ? 'text-brand' : i === 6 ? 'text-info' : 'text-gray-600'
              }`}
            >
              {w}
            </div>
          ))}
        </div>
        <div className="grid min-h-0 flex-1 auto-rows-fr grid-cols-7">
          {weeks.flat().map((day) => {
            const key = day.format(DATE_KEY)
            const inMonth = day.isSame(month, 'month')
            const isToday = day.isSame(today, 'day')
            const isSelected = key === selected
            const dayEvents = byDate.get(key) ?? []
            const weekday = day.day()

            return (
              <button
                type="button"
                key={key}
                onClick={() => setSelected(key)}
                className={`flex min-h-[6rem] flex-col gap-1 border-b border-r border-gray-200 p-1.5 text-left transition-colors duration-fast last:border-r-0 hover:bg-gray-25 ${
                  isSelected ? 'bg-info-subtle/60 ring-1 ring-inset ring-info-border' : ''
                } ${inMonth ? '' : 'bg-gray-25/40'}`}
              >
                <span
                  className={`grid h-6 w-6 place-items-center rounded-full text-caption tabular-nums ${
                    isToday
                      ? 'bg-brand font-bold text-gray-0'
                      : !inMonth
                        ? 'text-gray-300'
                        : weekday === 0
                          ? 'text-brand'
                          : weekday === 6
                            ? 'text-info'
                            : 'text-gray-700'
                  }`}
                >
                  {day.date()}
                </span>
                <span className="flex flex-col gap-0.5">
                  {dayEvents.slice(0, 3).map((ev) => (
                    <span
                      key={ev.id}
                      title={ev.title}
                      className={`truncate rounded px-1 py-0.5 text-caption font-medium ${
                        chipClass[layerTone[ev.event_type] ?? 'neutral']
                      }`}
                    >
                      {ev.title}
                    </span>
                  ))}
                  {dayEvents.length > 3 && (
                    <span className="px-1 text-caption text-gray-600">
                      +{dayEvents.length - 3}건 더
                    </span>
                  )}
                </span>
              </button>
            )
          })}
        </div>
      </div>

      </div>

      {/* 선택한 날짜의 일정 상세 (우측 1/3) */}
      <div className="rounded-radius-md border border-gray-300 bg-gray-0 p-4 shadow-soft lg:col-span-1 lg:h-full">
        <p className="mb-3 text-body font-semibold text-gray-900">
          {dayjs(selected).format('M월 D일')} ({WEEKDAYS[dayjs(selected).day()]})
          <span className="ml-2 text-caption font-normal text-gray-600">
            {selectedEvents.length}건
          </span>
        </p>
        {selectedEvents.length === 0 ? (
          <p className="text-body text-gray-500">등록된 일정이 없습니다.</p>
        ) : (
          <ul className="space-y-2">
            {selectedEvents.map((ev) => (
              <li key={ev.id} className="flex items-center gap-3">
                <Badge tone={layerTone[ev.event_type] ?? 'neutral'}>{ev.event_type}</Badge>
                <span className="flex-1 text-body text-gray-800">{ev.title}</span>
                <span className="tabular-nums text-caption text-gray-600">
                  {ev.starts_at ? dayjs(ev.starts_at).format('HH:mm') : '-'}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
      </div>
    </div>
  )
}
