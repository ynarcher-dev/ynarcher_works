import { DataTable, Spinner, type Column } from '@ynarcher/ui'
import { useAccessLogs, type AccessLog } from '@/features/admin/hooks'

/** 첨부파일 다운로드 사유 로그 뷰(입력된 목적/사유 중점 관제). */
export function DownloadLogView() {
  const { data, isLoading } = useAccessLogs()

  const columns: Column<AccessLog>[] = [
    {
      key: 'created_at',
      header: '다운로드 시각',
      render: (r) => new Date(r.created_at).toLocaleString('ko-KR'),
    },
    {
      key: 'user_id',
      header: '기안자',
      render: (r) => (r.user_id ? r.user_id.slice(0, 8) : '-'),
    },
    { key: 'resource_type', header: '대상 유형', render: (r) => r.resource_type ?? '-' },
    {
      key: 'reason',
      header: '입력 사유',
      render: (r) => <span className="text-gray-700">{r.reason ?? '-'}</span>,
    },
  ]

  if (isLoading) return <Spinner />

  return (
    <DataTable
      columns={columns}
      rows={data ?? []}
      rowKey={(r) => r.id}
      emptyText="다운로드 사유 로그가 없습니다."
      numbered={false}
      standardColumns={false}
    />
  )
}
