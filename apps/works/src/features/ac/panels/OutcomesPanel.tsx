import { Badge, DataTable, Spinner, type Column } from '@ynarcher/ui'
import { useByProgram, type Row } from '@/features/ac/moduleHooks'

const columns: Column<Row>[] = [
  { key: 'outcome_type', header: '성과 유형', render: (r) => String(r.outcome_type ?? '-') },
  { key: 'status', header: '상태', render: (r) => <Badge tone="info">{String(r.status)}</Badge> },
  {
    key: 'amount',
    header: '금액',
    align: 'right',
    numeric: true,
    render: (r) => (r.amount != null ? Number(r.amount).toLocaleString() : '-'),
  },
]

/** 성과/KPI. (7-12 — 통합 다운로더(export_jobs)/마스킹/감사 로그는 후속) */
export function OutcomesPanel({ programId }: { programId: string }) {
  const { data, isLoading } = useByProgram(
    'outcome_records',
    programId,
    'id, outcome_type, status, amount',
  )
  if (isLoading) return <Spinner />
  return (
    <DataTable
      columns={columns}
      rows={data ?? []}
      rowKey={(r) => r.id}
      emptyText="등록된 후속 성과가 없습니다."
    />
  )
}
