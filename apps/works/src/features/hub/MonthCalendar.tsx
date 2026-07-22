import dayjs, { type Dayjs } from 'dayjs'
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react'
import { useMemo, useState } from 'react'
import { hasWorkspaceWrite, useAuthStore } from '@/auth/authStore'
import { DayAgenda } from '@/features/hub/DayAgenda'
import { EventEditorModal } from '@/features/hub/EventEditorModal'
import { dotColor, toneOf } from '@/features/hub/eventStyle'
import type { SystemEvent } from '@/features/hub/hooks'

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토']
const DATE_KEY = 'YYYY-MM-DD'

/**
 * 이벤트를 날짜(YYYY-MM-DD)별로 묶는다. 여러 날에 걸친 일정(종료일이 시작일보다 뒤)은 시작~종료
 * 사이 모든 날짜 칸에 동일하게 넣어, 기간 내 어느 날을 봐도 표시되게 한다. 각 날 버킷은 시각순 정렬.
 */
function groupByDate(events: SystemEvent[]): Map<string, SystemEvent[]> {
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

/**
 * 전사 통합 캘린더(시스템 레이어 + 사용자 업무/휴가). 상하 배치 — 위는 칸을 적게 차지하는
 * 컴팩트 월간 그리드(이벤트는 레이어색 점으로 표시), 아래는 선택한 날짜의 일정(업무/휴가/기타).
 * 등록은 모달로 연다. 좁은 우측 슬라이드오버에 담기므로 좌우 분할 대신 세로로 쌓는다.
 */
export function MonthCalendar({ events }: { events: SystemEvent[] }) {
  const user = useAuthStore((s) => s.user)
  const canWrite = hasWorkspaceWrite(user, 'office')

  const today = dayjs()
  const [month, setMonth] = useState<Dayjs>(today.startOf('month'))
  const [selected, setSelected] = useState<string>(today.format(DATE_KEY))
  // 모달 상태: editorOpen + editTarget(null=신규 등록, 값=해당 일정 수정).
  const [editorOpen, setEditorOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<SystemEvent | null>(null)

  const openCreate = () => {
    setEditTarget(null)
    setEditorOpen(true)
  }
  const openEdit = (ev: SystemEvent) => {
    setEditTarget(ev)
    setEditorOpen(true)
  }

  const byDate = useMemo(() => groupByDate(events), [events])
  const weeks = useMemo(() => buildWeeks(month), [month])
  const selectedEvents = byDate.get(selected) ?? []

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      {/* 헤더: 월 이동(중앙) + 오늘(우측) */}
      <div className="relative flex items-center justify-center">
        <div className="flex items-center gap-1">
          <button
            type="button"
            aria-label="이전 달"
            onClick={() => setMonth((m) => m.subtract(1, 'month'))}
            className="grid size-icon-card place-items-center rounded-radius-sm text-gray-500 transition-colors duration-fast hover:bg-gray-100 hover:text-gray-800"
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
            className="grid size-icon-card place-items-center rounded-radius-sm text-gray-500 transition-colors duration-fast hover:bg-gray-100 hover:text-gray-800"
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

      {/* 컴팩트 그리드 — 이벤트는 점으로만 표시해 칸 높이를 줄인다(텍스트는 아래 상세에서 본다). */}
      <div className="shrink-0 overflow-hidden rounded-radius-md border border-gray-300 bg-gray-0 shadow-soft">
        <div className="grid grid-cols-7 border-b border-gray-300 bg-gray-25">
          {WEEKDAYS.map((w, i) => (
            <div
              key={w}
              className={`py-1.5 text-center text-caption font-semibold ${
                i === 0 ? 'text-brand' : i === 6 ? 'text-info' : 'text-gray-600'
              }`}
            >
              {w}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7">
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
                className={`flex min-h-[2.75rem] flex-col items-center gap-1 border-b border-r border-gray-200 p-1 transition-colors duration-fast [&:nth-child(7n)]:border-r-0 hover:bg-gray-25 ${
                  isSelected ? 'bg-info-subtle/60 ring-1 ring-inset ring-info-border' : ''
                } ${inMonth ? '' : 'bg-gray-25/40'}`}
              >
                <span
                  className={`grid size-5 place-items-center rounded-full text-caption tabular-nums ${
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
                {dayEvents.length > 0 && (
                  <span className="flex items-center gap-0.5">
                    {dayEvents.slice(0, 4).map((ev) => (
                      <span
                        key={ev.id}
                        className={`size-1.5 rounded-full ${dotColor[toneOf(ev.event_type)]}`}
                      />
                    ))}
                  </span>
                )}
              </button>
            )
          })}
        </div>
      </div>

      {/* 선택한 날짜의 일정(아래) — 업무/휴가/기타로 묶어 표시 + 등록 진입 */}
      <section className="flex min-h-0 flex-1 flex-col rounded-radius-md border border-gray-300 bg-gray-0 p-4 shadow-soft">
        <div className="mb-3 flex shrink-0 items-center justify-between">
          <p className="text-body font-semibold text-gray-900">
            {dayjs(selected).format('M월 D일')} ({WEEKDAYS[dayjs(selected).day()]})
            <span className="ml-2 text-caption font-normal text-gray-600">
              {selectedEvents.length}건
            </span>
          </p>
          {canWrite && (
            <button
              type="button"
              onClick={openCreate}
              className="inline-flex items-center gap-1 rounded-radius-sm border border-gray-300 px-2 py-1 text-caption font-semibold text-gray-600 transition-colors duration-fast hover:bg-gray-50 hover:text-gray-900"
            >
              <Plus className="h-3.5 w-3.5" />
              일정 등록
            </button>
          )}
        </div>
        <div className="min-h-0 flex-1 overflow-auto">
          <DayAgenda events={selectedEvents} onEdit={openEdit} />
        </div>
      </section>

      <EventEditorModal
        open={editorOpen}
        dateKey={selected}
        event={editTarget}
        onClose={() => setEditorOpen(false)}
      />
    </div>
  )
}
