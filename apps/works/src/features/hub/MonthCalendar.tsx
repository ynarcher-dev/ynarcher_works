import { Button, CardHeading, IconButton } from '@ynarcher/ui'
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
 * 전사 통합 캘린더(시스템 레이어 + 사용자 업무/휴가). 상하 배치 — 위는 월간 그리드(이벤트는
 * 레이어색 바로 표시), 아래는 선택한 날짜의 일정(업무/휴가/기타). 등록은 모달로 연다.
 * 좁은 우측 슬라이드오버에 담기므로 좌우 분할 대신 세로로 쌓는다.
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
          <IconButton
            variant="ghost"
            label="이전 달"
            onClick={() => setMonth((m) => m.subtract(1, 'month'))}
            icon={<ChevronLeft className="h-4 w-4" />}
          />
          <span className="min-w-[6.5rem] text-center text-body font-semibold text-gray-900">
            {month.format('YYYY년 M월')}
          </span>
          <IconButton
            variant="ghost"
            label="다음 달"
            onClick={() => setMonth((m) => m.add(1, 'month'))}
            icon={<ChevronRight className="h-4 w-4" />}
          />
        </div>
        <Button
          variant="outline"
          density="card"
          className="absolute right-0"
          onClick={() => {
            setMonth(today.startOf('month'))
            setSelected(today.format(DATE_KEY))
          }}
        >
          오늘
        </Button>
      </div>

      {/* 그리드 — 칸을 띄운 라운드 셀로 그리고, 일정은 색 바로만 표시한다
          (제목은 아래 상세에서 본다). 표 테두리·카드 겹을 두지 않아 좁은 슬라이드오버에서도 가볍다. */}
      <div className="grid shrink-0 grid-cols-7 gap-1">
        {WEEKDAYS.map((w, i) => (
          <div
            key={w}
            className={`py-1 text-center text-caption font-semibold ${
              i === 0 ? 'text-brand' : i === 6 ? 'text-info' : 'text-gray-700'
            }`}
          >
            {w}
          </div>
        ))}
        {weeks.flat().map((day) => {
          const key = day.format(DATE_KEY)
          const inMonth = day.isSame(month, 'month')
          const isToday = day.isSame(today, 'day')
          const isSelected = key === selected
          const dayEvents = byDate.get(key) ?? []

          return (
            <button
              type="button"
              key={key}
              onClick={() => setSelected(key)}
              className={`flex min-h-[3.25rem] flex-col gap-1 rounded-radius-sm border p-1 text-left transition-colors duration-fast ${
                isSelected
                  ? 'border-info-border bg-info-subtle/60'
                  : `border-gray-200 hover:bg-gray-25 ${inMonth ? 'bg-white' : 'bg-gray-25/60'}`
              }`}
            >
              <span
                className={`text-caption tabular-nums ${
                  isToday
                    ? 'grid h-5 w-5 place-items-center rounded-full bg-brand font-bold text-gray-0'
                    : inMonth
                      ? 'text-gray-700'
                      : 'text-gray-400'
                }`}
              >
                {day.date()}
              </span>
              <span className="flex flex-col gap-0.5">
                {dayEvents.slice(0, 3).map((ev) => (
                  <span
                    key={ev.id}
                    title={ev.title}
                    className={`h-1 rounded-full ${dotColor[toneOf(ev.event_type)]}`}
                  />
                ))}
              </span>
            </button>
          )
        })}
      </div>

      {/* 선택한 날짜의 일정(아래) — 업무/휴가/기타로 묶어 표시 + 등록 진입. */}
      <section className="flex min-h-0 flex-1 flex-col rounded-radius-sm border border-gray-200 bg-gray-25 px-3 py-2.5">
        <div className="mb-2 flex shrink-0 items-center justify-between">
          <CardHeading level="subhead" as="p" count={selectedEvents.length}>
            {dayjs(selected).format('M월 D일')} ({WEEKDAYS[dayjs(selected).day()]})
          </CardHeading>
          {canWrite && (
            <Button variant="outline" density="card" onClick={openCreate}>
              <Plus className="size-3.5" />
              일정 등록
            </Button>
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
