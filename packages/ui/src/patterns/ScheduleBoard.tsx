import { Badge, type BadgeTone } from '../components/Badge'
import { cn } from '../utils/cn'
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
  /** 간트 막대 색. */
  barClass?: string
  onClick?: () => void
}

/** 칸반 열 정의. 순서가 곧 화면 순서다. */
export interface ScheduleColumn {
  key: string
  label: string
  tone: BadgeTone
}

export type ScheduleView = 'kanban' | 'gantt'

export interface ScheduleBoardProps {
  events: ScheduleEvent[]
  view: ScheduleView
  /** 칸반 열(상태) 정의. 칸반 뷰에서만 쓴다. */
  columns: ScheduleColumn[]
  /** 일정이 하나도 없을 때의 안내. */
  emptyText?: string
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
 * 일정안내 보드 — 같은 일정을 **간트·칸반** 두 모양으로 그리는 공용 부품.
 *
 * GUEST 일정안내 메뉴가 쓴다(WORKS 쪽 같은 이름의 탭은 2026-09-01 걷어냈다 — 그 행은
 * 프로그램 탭 간트가 이미 그리고, 공유 여부는 각 모듈의 공유범위 배지가 이미 답한다).
 * 읽기 전용이다 — 기간·공유범위·상태를 바꾸는 쓰기는 전부 WORKS 프로그램 탭이 소유한다.
 *
 * 두 뷰가 답하는 물음이 다르다 — 간트는 '무엇이 언제부터 언제까지, 무엇과 겹치는가',
 * 칸반은 '지금 어느 단계인가'. 달력은 두지 않는다: 하루 한 칸이 좁아 행사명을 담지 못해
 * 날짜를 눌러야 비로소 답하는데, 그 한 번을 거치지 않아도 되는 그림이 이미 둘 있다.
 */
export function ScheduleBoard({
  events,
  view,
  columns,
  emptyText = '공유된 일정이 없습니다.',
}: ScheduleBoardProps) {
  if (events.length === 0) {
    return (
      <p className="rounded-radius-md border border-dashed border-gray-300 py-8 text-center text-body text-gray-600">
        {emptyText}
      </p>
    )
  }
  if (view === 'kanban') return <ScheduleKanban events={events} columns={columns} />
  return <ScheduleGantt events={events} emptyText={emptyText} />
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
      // 1열은 행사명 아래 기간을 한 줄 더 세운다 — 막대 안의 날짜는 기간이 짧으면
      // 폭이 모자라 지워지고(짧은 일정일수록 언제인지가 더 급하다), 가로로 스크롤해
      // 막대를 화면 밖으로 보내도 고정된 이 열은 남는다.
      label: (
        <>
          <span className="flex min-w-0 flex-1 flex-col justify-center">
            <span className="truncate text-body font-semibold text-gray-900">{e.title}</span>
            <span className="truncate text-caption tabular-nums text-gray-700">
              {periodLabel(e)}
            </span>
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
      // 1열이 두 줄(행사명 + 기간)이 되면서 줄 높이와 열 폭을 함께 키운다 —
      // 'YYYY-MM-DD ~ YYYY-MM-DD'가 말줄임 없이 들어가야 한 줄 더 세운 뜻이 산다.
      labelWidth={264}
      rowHeight={52}
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
