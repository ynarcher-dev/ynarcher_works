import { Badge, DataTable, Spinner, type Column } from '@ynarcher/ui'
import dayjs from 'dayjs'
import { useByProgram, type Row } from '@/features/ac/moduleHooks'

const columns: Column<Row>[] = [
  { key: 'startup_id', header: '지원 기업', render: (r) => String(r.startup_id ?? '-').slice(0, 8) },
  { key: 'status', header: '상태', render: (r) => <Badge tone="info">{String(r.status)}</Badge> },
  {
    key: 'submitted_at',
    header: '제출일',
    render: (r) => (r.submitted_at ? dayjs(String(r.submitted_at)).format('YYYY-MM-DD') : '-'),
  },
]

/** 모집/지원자 DB. (7-2 — 랜딩/폼 빌더는 후속, 접수 목록 연결) */
export function RecruitmentPanel({ programId }: { programId: string }) {
  const { data, isLoading } = useByProgram(
    'application_submissions',
    programId,
    'id, status, submitted_at, startup_id',
  )
  if (isLoading) return <Spinner />
  return (
    <DataTable
      columns={columns}
      rows={data ?? []}
      rowKey={(r) => r.id}
      emptyText="접수된 지원서가 없습니다. (모집 폼 공개 후 수집)"
    />
  )
}
