import { Badge } from '@ynarcher/ui'
import dayjs from 'dayjs'
import { useAuthStore } from '@/auth/authStore'
import { parseEventMeta, type SystemEvent } from '@/features/hub/hooks'
import { dotColor, toneOf } from '@/features/hub/eventStyle'

/**
 * 기간 라벨. 같은 날이면 시간만('종일'/'HH:mm'/'HH:mm–HH:mm'), 여러 날에 걸치면 날짜를 덧붙인다
 * ('M/D – M/D' 또는 'M/D HH:mm – M/D HH:mm').
 */
function timeText(ev: SystemEvent, allDay: boolean): string {
  if (!ev.starts_at) return '-'
  const s = dayjs(ev.starts_at)
  const e = ev.ends_at ? dayjs(ev.ends_at) : null
  const sameDay = e ? s.isSame(e, 'day') : true
  if (allDay) {
    return !e || sameDay ? '종일' : `${s.format('M/D')} – ${e.format('M/D')}`
  }
  if (!e) return s.format('HH:mm')
  return sameDay
    ? `${s.format('HH:mm')}–${e.format('HH:mm')}`
    : `${s.format('M/D HH:mm')} – ${e.format('M/D HH:mm')}`
}

/**
 * 사용자 일정 행(업무·휴가) — 점 + 제목 + 시간, 업무는 동행자/메모를 아래에 보조로 표기.
 * 본인이 올린 일정이면 행 전체가 버튼이 되어 클릭 시 수정/삭제 모달을 연다.
 */
function UserRow({
  ev,
  canEdit,
  onEdit,
}: {
  ev: SystemEvent
  canEdit: boolean
  onEdit: (ev: SystemEvent) => void
}) {
  const meta = parseEventMeta(ev.body)
  const inner = (
    <>
      <div className="flex items-center gap-2">
        <span className={`size-2 shrink-0 rounded-full ${dotColor[toneOf(ev.event_type)]}`} />
        <span className="flex-1 truncate text-body text-gray-800">{ev.title}</span>
        <span className="shrink-0 tabular-nums text-caption text-gray-600">
          {timeText(ev, meta.allDay)}
        </span>
      </div>
      {meta.companions.length > 0 && (
        <p className="ml-4 mt-0.5 truncate text-caption text-gray-500">
          동행 {meta.companions.map((c) => c.name).join(', ')}
        </p>
      )}
      {meta.memo && <p className="ml-4 mt-0.5 truncate text-caption text-gray-400">{meta.memo}</p>}
    </>
  )

  if (!canEdit) {
    return <li className="rounded-radius-sm px-2 py-1.5">{inner}</li>
  }
  return (
    <li>
      <button
        type="button"
        onClick={() => onEdit(ev)}
        title="수정 / 삭제"
        className="w-full rounded-radius-sm px-2 py-1.5 text-left transition-colors duration-fast hover:bg-gray-25"
      >
        {inner}
      </button>
    </li>
  )
}

/** 시스템 레이어 행(AC/PROJECT/FUND/COMPANY) — 타입 배지 + 제목 + 시작 시각. */
function SystemRow({ ev }: { ev: SystemEvent }) {
  return (
    <li className="flex items-center gap-3 px-2 py-1.5">
      <Badge tone={toneOf(ev.event_type)}>{ev.event_type}</Badge>
      <span className="flex-1 text-body text-gray-800">{ev.title}</span>
      <span className="tabular-nums text-caption text-gray-600">
        {ev.starts_at ? dayjs(ev.starts_at).format('HH:mm') : '-'}
      </span>
    </li>
  )
}

function Section({
  title,
  items,
  render,
}: {
  title: string
  items: SystemEvent[]
  render: (ev: SystemEvent) => React.ReactNode
}) {
  if (items.length === 0) return null
  return (
    <div>
      <p className="mb-1 text-caption font-bold uppercase tracking-wide text-gray-400">{title}</p>
      <ul className="space-y-0.5">{items.map(render)}</ul>
    </div>
  )
}

/** 선택한 날짜의 일정 — 업무(상위) → 휴가 → 기타(시스템) 순으로 묶어 보여준다. */
export function DayAgenda({
  events,
  onEdit,
}: {
  events: SystemEvent[]
  onEdit: (ev: SystemEvent) => void
}) {
  const myId = useAuthStore((s) => s.user?.id)
  // 본인이 등록한 일정만 클릭해 수정/삭제할 수 있다(RLS는 OFFICE 쓰기 권한 단위로 강제).
  const renderUser = (ev: SystemEvent) => (
    <UserRow key={ev.id} ev={ev} canEdit={!!myId && ev.created_by === myId} onEdit={onEdit} />
  )

  if (events.length === 0) {
    return <p className="text-body text-gray-500">등록된 일정이 없습니다.</p>
  }
  const work = events.filter((e) => e.event_type === 'WORK')
  const leave = events.filter((e) => e.event_type === 'LEAVE')
  const others = events.filter((e) => e.event_type !== 'WORK' && e.event_type !== 'LEAVE')

  return (
    <div className="space-y-3">
      <Section title="업무" items={work} render={renderUser} />
      {/* 업무와 휴가 사이 구분선(둘 다 있을 때만). */}
      {work.length > 0 && leave.length > 0 && <hr className="border-gray-200" />}
      <Section title="휴가" items={leave} render={renderUser} />
      <Section title="기타" items={others} render={(ev) => <SystemRow key={ev.id} ev={ev} />} />
    </div>
  )
}
