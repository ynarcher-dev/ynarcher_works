import { Badge, EmptyState, Spinner, type BadgeTone } from '@ynarcher/ui'
import dayjs from 'dayjs'
import { useSystemEvents } from '@/features/hub/hooks'

const layerTone: Record<string, BadgeTone> = {
  AC: 'info',
  PROJECT: 'success',
  FUND: 'warning',
  COMPANY: 'neutral',
}

/** 전사 통합 캘린더(4개 레이어: AC/PROJECT/FUND/COMPANY). */
export function CalendarPanel() {
  const { data, isLoading } = useSystemEvents()

  if (isLoading) return <Spinner />
  if (!data || data.length === 0) {
    return <EmptyState title="등록된 일정이 없습니다." />
  }

  return (
    <ul className="space-y-2">
      {data.map((ev) => (
        <li
          key={ev.id}
          className="flex items-center gap-3 rounded border border-gray-200 bg-white px-3 py-2"
        >
          <Badge tone={layerTone[ev.event_type] ?? 'neutral'}>
            {ev.event_type}
          </Badge>
          <span className="flex-1 text-body text-gray-800">{ev.title}</span>
          <span className="tabular-nums text-caption text-gray-500">
            {ev.starts_at ? dayjs(ev.starts_at).format('YYYY-MM-DD HH:mm') : '-'}
          </span>
        </li>
      ))}
    </ul>
  )
}
