import { Badge, DataTable, Spinner, type Column } from '@ynarcher/ui'
import dayjs from 'dayjs'
import { useByModuleType, type Row } from '@/features/ac/moduleHooks'

const columns: Column<Row>[] = [
  { key: 'venue', header: '장소', render: (r) => String(r.venue ?? '-') },
  { key: 'starts_at', header: '일시', render: (r) => (r.starts_at ? dayjs(String(r.starts_at)).format('MM-DD HH:mm') : '-') },
  { key: 'status', header: '상태', render: (r) => <Badge tone="info">{String(r.status)}</Badge> },
]

/** 대면평가 세션. (7-6 — 발표 순서/현장 진행/최종 선발은 후속) */
export function OnsitePanel({ programId }: { programId: string }) {
  const { data, isLoading } = useByModuleType(
    'onsite_eval_sessions',
    programId,
    'ONSITE_EVAL',
    'id, venue, starts_at, status',
  )
  if (isLoading) return <Spinner />
  return (
    <DataTable
      columns={columns}
      rows={data ?? []}
      rowKey={(r) => r.id}
      emptyText="대면평가 세션이 없습니다."
    />
  )
}
