import { Badge, DataTable, Spinner, type Column } from '@ynarcher/ui'
import { useByProgram, type Row } from '@/features/ac/moduleHooks'

const columns: Column<Row>[] = [
  { key: 'title', header: '활동', render: (r) => String(r.title) },
  { key: 'activity_type', header: '유형', render: (r) => String(r.activity_type ?? '-') },
  { key: 'activity_date', header: '일자', render: (r) => String(r.activity_date ?? '-') },
  { key: 'visibility', header: '공개 범위', render: (r) => <Badge tone="neutral">{String(r.visibility)}</Badge> },
]

/** 커스텀 활동/회의록. (7-13 — 회의록/Action Item 상세는 활동 선택 시 확장) */
export function CustomActivityPanel({ programId }: { programId: string }) {
  const { data, isLoading } = useByProgram(
    'custom_activities',
    programId,
    'id, title, activity_type, activity_date, visibility',
  )
  if (isLoading) return <Spinner />
  return (
    <DataTable
      columns={columns}
      rows={data ?? []}
      rowKey={(r) => r.id}
      emptyText="등록된 커스텀 활동이 없습니다."
    />
  )
}
