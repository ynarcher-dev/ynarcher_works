import { useState, type ReactNode } from 'react'
import { Badge, type BadgeTone } from '../components/Badge'
import { cn } from '../utils/cn'
import { CalendarDayDetail, MonthCalendar, type CalendarDayMeta } from './MonthCalendar'
import { GanttChart, type GanttRow } from './GanttChart'

/**
 * 일정 한 건 — **행사명·설명·날짜**가 전부다. 일정안내는 원장을 따로 두지 않고 사업의
 * 메뉴(모듈) 중 게스트에게 공유된 것들의 기간을 그대로 보여 주는 화면이라, 여기에 담기는
 * 것도 그 세 가지뿐이다.
 */
export interface ScheduleEvent {
  id: string
  /** 행사명. */
  title: string
  /** 설명 한 줄(없으면 비운다 — 없는 설명을 제목으로 메우지 않는다). */
  description?: string | null
  /** 시작·종료일 'YYYY-MM-DD'. 한쪽만 있으면 그날 하루로 본다. */
  start?: string | null
  end?: string | null
  /** 칸반 열을 가르는 키(상태). columns의 key와 맞춘다. */
  status?: string
  /** 제목 옆 상태 태그. 프로그램 탭 간트와 같은 자리·같은 말이라 두 화면이 같게 읽힌다. */
  statusLabel?: string
  statusTone?: BadgeTone
  /** 캘린더 바·간트 막대 색. */
  barClass?: string
  onClick?: () => void
}

/** 칸반 열 정의. 순서가 곧 화면 순서다. */
export interface ScheduleColumn {
  key: string
  label: string
  tone: BadgeTone
}

export type ScheduleView = 'calendar' | 'kanban' | 'gantt'

export interface ScheduleBoardProps {
  events: ScheduleEvent[]
  view: ScheduleView
  /** 칸반 열(상태) 정의. 칸반 뷰에서만 쓴다. */
  columns: ScheduleColumn[]
  /** 일정이 하나도 없을 때의 안내. */
  emptyText?: string
  /** 캘린더 월 이동 아이콘(앱에서 주입). 없으면 화살표 문자로 대체한다. */
  prevIcon?: ReactNode
  nextIcon?: ReactNode
}

/** 시작·종료 중 있는 값으로 하루짜리 범위까지 채운다. 둘 다 없으면 축에 올릴 수 없다. */
function rangeOf(e: ScheduleEvent): { start: string; end: string } | null {
  const start = e.start ?? e.end
  const end = e.end ?? e.start
  if (!start || !end) return null
  // 'YYYY-MM-DD'는 사전순 비교가 곧 날짜 비교다. 뒤집힌 기간은 그리지 않는다.
  return end >= start ? { start, end } : null
}

/** 기간 한 줄. 하루짜리는 날짜 하나만 말한다. */
function periodLabel(e: ScheduleEvent): string {
  const r = rangeOf(e)
  if (!r) return '일정 미등록'
  return r.start === r.end ? r.start : `${r.start} ~ ${r.end}`
}

/**
 * 일정안내 보드 — 같은 일정을 **캘린더·칸반·간트** 세 모양으로 그리는 공용 부품.
 *
 * WORKS 사업 상세의 일정안내 탭과 GUEST 일정안내 메뉴가 이 부품 하나를 함께 쓴다.
 * 담당자가 WORKS에서 메뉴의 기간과 공유범위를 정하면 게스트는 **같은 그림**을 본다 —
 * 화면을 앱마다 따로 그리면 같은 사업의 같은 일정이 두 모양으로 서고, 담당자는 참여자가
 * 무엇을 보는지 자기 화면에서 알 수 없게 된다. 그래서 다른 것은 편집 가능 여부뿐이며
 * 이 부품은 읽기 전용이다(상태 변경 같은 쓰기는 프로그램 탭이 담당한다).
 *
 * 세 뷰가 답하는 물음이 각각 다르다 — 캘린더는 '이번 달 언제', 칸반은 '지금 어느 단계',
 * 간트는 '무엇과 무엇이 겹치는가'. 어느 하나가 나머지를 대신하지 못해 셋을 함께 둔다.
 */
export function ScheduleBoard({
  events,
  view,
  columns,
  emptyText = '공유된 일정이 없습니다.',
  prevIcon,
  nextIcon,
}: ScheduleBoardProps) {
  if (events.length === 0) {
    return (
      <p className="rounded-radius-md border border-dashed border-gray-300 py-8 text-center text-body text-gray-600">
        {emptyText}
      </p>
    )
  }
  if (view === 'calendar') return <ScheduleCalendar events={events} prevIcon={prevIcon} nextIcon={nextIcon} />
  if (view === 'kanban') return <ScheduleKanban events={events} columns={columns} />
  return <ScheduleGantt events={events} emptyText={emptyText} />
}

/**
 * 캘린더 뷰 — 달 격자에 기간 바를 깔고, 날짜를 누르면 그날의 일정을 아래에 편다.
 * 처음 서는 달은 오늘이 속한 달이다(참여자가 먼저 묻는 것은 '이번 달'이다).
 */
function ScheduleCalendar({
  events,
  prevIcon,
  nextIcon,
}: {
  events: ScheduleEvent[]
  prevIcon?: ReactNode
  nextIcon?: ReactNode
}) {
  const pad = (n: number) => String(n).padStart(2, '0')
  const today = new Date()
  const [month, setMonth] = useState(`${today.getFullYear()}-${pad(today.getMonth() + 1)}`)
  const [selected, setSelected] = useState<string | undefined>(undefined)

  const dated = events
    .map((e) => ({ e, range: rangeOf(e) }))
    .filter((r): r is { e: ScheduleEvent; range: { start: string; end: string } } => r.range !== null)

  const onDay = (key: string) => dated.filter((r) => r.range.start <= key && key <= r.range.end)

  const getDayMeta = (key: string): CalendarDayMeta | undefined => {
    const hits = onDay(key)
    if (hits.length === 0) return undefined
    return {
      bars: hits.map((r) => r.e.barClass ?? 'bg-brand'),
      // 점은 **그날 시작하는** 일정에만 찍는다 — 기간 중 모든 날에 찍으면 시작일이 묻힌다.
      dot: hits.some((r) => r.range.start === key),
    }
  }

  const selectedHits = selected ? onDay(selected) : []

  return (
    <div>
      <MonthCalendar
        month={month}
        onMonthChange={setMonth}
        selected={selected}
        onSelect={setSelected}
        getDayMeta={getDayMeta}
        prevIcon={prevIcon}
        nextIcon={nextIcon}
      />
      {selected && (
        <CalendarDayDetail isEmpty={selectedHits.length === 0}>
          {selectedHits.map(({ e }) => (
            <li key={e.id}>
              <EventLine event={e} />
            </li>
          ))}
        </CalendarDayDetail>
      )}
    </div>
  )
}

/** 캘린더 하단 한 줄: 행사명 · 설명 · 기간. */
function EventLine({ event }: { event: ScheduleEvent }) {
  const body = (
    <>
      <span className="truncate text-body font-semibold text-gray-900">{event.title}</span>
      {event.description && (
        <span className="min-w-0 flex-1 truncate text-caption text-gray-600">
          {event.description}
        </span>
      )}
      <span className="shrink-0 text-caption tabular-nums text-gray-700">
        {periodLabel(event)}
      </span>
    </>
  )
  return event.onClick ? (
    <button
      type="button"
      onClick={event.onClick}
      className="flex w-full items-center gap-2 rounded-radius-sm text-left hover:underline focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand/10"
    >
      {body}
    </button>
  ) : (
    <span className="flex w-full items-center gap-2">{body}</span>
  )
}

/**
 * 칸반 뷰 — 상태 열에 일정 카드를 놓는다. 카드에 담기는 것은 행사명·설명·기간 셋뿐이며,
 * 드래그로 상태를 바꾸는 일은 하지 않는다(그 쓰기는 프로그램 탭이 소유한다).
 */
function ScheduleKanban({
  events,
  columns,
}: {
  events: ScheduleEvent[]
  columns: ScheduleColumn[]
}) {
  return (
    <div
      className={cn(
        'grid grid-cols-1 gap-3',
        columns.length >= 4 ? 'md:grid-cols-4' : 'md:grid-cols-3',
      )}
    >
      {columns.map((col) => {
        const items = events.filter((e) => (e.status ?? columns[0]?.key) === col.key)
        return (
          <div key={col.key} className="rounded-radius-md bg-gray-25 p-2">
            <div className="flex items-center gap-2 px-2 py-1.5">
              <Badge tone={col.tone}>{col.label}</Badge>
              <span className="text-caption tabular-nums text-gray-700">{items.length}</span>
            </div>
            <ul className="space-y-2">
              {items.map((e) => (
                <li
                  key={e.id}
                  className="rounded-radius-md border border-gray-300 bg-white shadow-soft"
                >
                  <ScheduleCard event={e} />
                </li>
              ))}
              {items.length === 0 && (
                <li className="rounded-radius-md border border-dashed border-gray-200 px-3 py-4 text-center text-caption text-gray-600">
                  해당 상태의 일정이 없습니다
                </li>
              )}
            </ul>
          </div>
        )
      })}
    </div>
  )
}

/** 칸반 카드 한 장: 행사명 → 설명 → 기간. */
function ScheduleCard({ event }: { event: ScheduleEvent }) {
  const inner = (
    <>
      <span className="block truncate text-body font-semibold text-gray-900">{event.title}</span>
      {event.description && (
        <span className="mt-1 block line-clamp-2 text-caption text-gray-600">
          {event.description}
        </span>
      )}
      <span className="mt-1.5 block text-caption tabular-nums text-gray-700">
        {periodLabel(event)}
      </span>
    </>
  )
  return event.onClick ? (
    <button
      type="button"
      onClick={event.onClick}
      className="w-full rounded-radius-md px-3 py-2.5 text-left transition-colors duration-fast hover:bg-gray-25 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand/10"
    >
      {inner}
    </button>
  ) : (
    <div className="px-3 py-2.5">{inner}</div>
  )
}

/** 간트 뷰 — 공용 간트에 일정을 얹는다. 좌측 라벨은 행사명 한 줄이다. */
function ScheduleGantt({ events, emptyText }: { events: ScheduleEvent[]; emptyText: string }) {
  const rows: GanttRow[] = []
  const undated: ScheduleEvent[] = []
  for (const e of events) {
    const r = rangeOf(e)
    if (!r) {
      undated.push(e)
      continue
    }
    rows.push({
      key: e.id,
      start: r.start,
      end: r.end,
      barClass: e.barClass,
      title: `${e.title} · ${periodLabel(e)}`,
      onClick: e.onClick,
      label: (
        <>
          <span className="min-w-0 flex-1 truncate text-body font-semibold text-gray-900">
            {e.title}
          </span>
          {e.statusLabel && <Badge tone={e.statusTone ?? 'neutral'}>{e.statusLabel}</Badge>}
        </>
      ),
    })
  }
  return (
    <GanttChart
      rows={rows}
      labelHeader="일정"
      emptyText={emptyText}
      footer={
        undated.length > 0 ? (
          <p className="text-caption text-gray-700">
            일정 미등록: {undated.map((e) => e.title).join(' · ')}
          </p>
        ) : undefined
      }
    />
  )
}
