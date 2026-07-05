import { Badge, DataTable, Spinner, type Column } from '@ynarcher/ui'
import dayjs from 'dayjs'
import { useByModuleType, type Row } from '@/features/ac/moduleHooks'

const columns: Column<Row>[] = [
  { key: 'starts_at', header: '일시', render: (r) => (r.starts_at ? dayjs(String(r.starts_at)).format('MM-DD HH:mm') : '-') },
  { key: 'slot_minutes', header: '슬롯(분)', align: 'right', numeric: true, render: (r) => String(r.slot_minutes ?? '-') },
  { key: 'status', header: '상태', render: (r) => <Badge tone="info">{String(r.status)}</Badge> },
]

/** 1:1 비즈니스 매칭 이벤트. (7-9 — 슬롯 자동생성/FCFS·AI 배정/노쇼는 후속) */
export function MatchingPanel({ programId }: { programId: string }) {
  const { data, isLoading } = useByModuleType(
    'matching_events',
    programId,
    'BUSINESS_MATCHING',
    'id, starts_at, slot_minutes, status',
  )
  if (isLoading) return <Spinner />
  return (
    <DataTable
      columns={columns}
      rows={data ?? []}
      rowKey={(r) => r.id}
      emptyText="매칭 이벤트가 없습니다."
    />
  )
}
