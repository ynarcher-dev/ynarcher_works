import { Badge, DataTable, Spinner, type Column } from '@ynarcher/ui'
import dayjs from 'dayjs'
import { useByModuleType, type Row } from '@/features/ac/moduleHooks'

const columns: Column<Row>[] = [
  { key: 'starts_at', header: '일시', render: (r) => (r.starts_at ? dayjs(String(r.starts_at)).format('MM-DD HH:mm') : '-') },
  { key: 'status', header: '상태', render: (r) => <Badge tone="info">{String(r.status)}</Badge> },
]

/** 데모데이 세션. (7-10 — 모바일 심사/투자자 관심/후속 미팅은 후속) */
export function DemoDayPanel({ programId }: { programId: string }) {
  const { data, isLoading } = useByModuleType(
    'demoday_sessions',
    programId,
    'DEMO_DAY',
    'id, starts_at, status',
  )
  if (isLoading) return <Spinner />
  return (
    <DataTable
      columns={columns}
      rows={data ?? []}
      rowKey={(r) => r.id}
      emptyText="데모데이 세션이 없습니다."
    />
  )
}
