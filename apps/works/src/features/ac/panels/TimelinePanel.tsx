import { Badge, DataTable, Spinner, type Column } from '@ynarcher/ui'
import dayjs from 'dayjs'
import { useByProgram, type Row } from '@/features/ac/moduleHooks'

const columns: Column<Row>[] = [
  { key: 'title', header: '항목', render: (r) => String(r.title) },
  { key: 'item_type', header: '유형', render: (r) => <Badge tone="neutral">{String(r.item_type ?? '-')}</Badge> },
  { key: 'starts_at', header: '시작', render: (r) => (r.starts_at ? dayjs(String(r.starts_at)).format('MM-DD HH:mm') : '-') },
  { key: 'visibility', header: '공개', render: (r) => String(r.visibility) },
]

/** 통합 타임라인. (7-11 — 충돌 감지/ICS/system_events 동기화는 후속) */
export function TimelinePanel({ programId }: { programId: string }) {
  const { data, isLoading } = useByProgram(
    'program_timeline_items',
    programId,
    'id, title, item_type, starts_at, ends_at, visibility',
  )
  if (isLoading) return <Spinner />
  return (
    <DataTable
      columns={columns}
      rows={data ?? []}
      rowKey={(r) => r.id}
      emptyText="타임라인 항목이 없습니다. (각 모듈 세션 등록 시 정규화 인덱싱)"
    />
  )
}
