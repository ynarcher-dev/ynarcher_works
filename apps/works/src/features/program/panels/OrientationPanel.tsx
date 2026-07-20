import { Badge, DataTable, Spinner, type Column } from '@ynarcher/ui'
import dayjs from 'dayjs'
import { useByModuleId, type Row } from '@/features/program/moduleHooks'

const columns: Column<Row>[] = [
  { key: 'session_type', header: '세션 유형', render: (r) => String(r.session_type ?? '-') },
  { key: 'starts_at', header: '일시', render: (r) => (r.starts_at ? dayjs(String(r.starts_at)).format('MM-DD HH:mm') : '-') },
  { key: 'status', header: '상태', render: (r) => <Badge tone="info">{String(r.status)}</Badge> },
]

/** OT/공통 세션. (7-7 — QR 출석 체크/출석 상태 관리는 후속) */
export function OrientationPanel({ moduleId }: { moduleId: string }) {
  const { data, isLoading } = useByModuleId(
    'orientation_sessions',
    moduleId,
    'id, session_type, starts_at, status',
  )
  if (isLoading) return <Spinner />
  return (
    <DataTable
      columns={columns}
      rows={data ?? []}
      rowKey={(r) => r.id}
      emptyText="OT/공통 세션이 없습니다."
    />
  )
}
