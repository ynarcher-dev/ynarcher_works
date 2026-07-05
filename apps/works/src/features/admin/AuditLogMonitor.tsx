import { Badge, Button, DataTable, Modal, Spinner, type Column } from '@ynarcher/ui'
import { useState } from 'react'
import { useAuditLogs, type AuditLog } from '@/features/admin/hooks'

/** 시스템 보안 감사 로그 모니터(변경 전/후 JSON 대조 뷰어 팝업 제공). */
export function AuditLogMonitor() {
  const { data, isLoading } = useAuditLogs()
  const [detail, setDetail] = useState<AuditLog | null>(null)

  const columns: Column<AuditLog>[] = [
    {
      key: 'created_at',
      header: '일시',
      render: (r) => new Date(r.created_at).toLocaleString('ko-KR'),
    },
    {
      key: 'action',
      header: '액션',
      render: (r) => <Badge tone="info">{r.action}</Badge>,
    },
    { key: 'changed_workspace', header: '대상', render: (r) => r.changed_workspace ?? '-' },
    {
      key: 'perm',
      header: '권한 변경',
      render: (r) =>
        r.before_permission || r.after_permission
          ? `${r.before_permission ?? '-'} → ${r.after_permission ?? '-'}`
          : '-',
    },
    { key: 'request_ip', header: 'IP', render: (r) => r.request_ip ?? '-' },
    {
      key: '_action',
      header: '',
      align: 'right',
      render: (r) => (
        <Button variant="ghost" size="sm" onClick={() => setDetail(r)}>
          전/후 대조
        </Button>
      ),
    },
  ]

  if (isLoading) return <Spinner />

  return (
    <>
      <DataTable
        columns={columns}
        rows={data ?? []}
        rowKey={(r) => r.id}
        emptyText="감사 로그가 없습니다."
      />
      <Modal
        open={Boolean(detail)}
        onClose={() => setDetail(null)}
        title="변경 전/후 JSON 대조"
        size="lg"
      >
        <div className="grid grid-cols-2 gap-3">
          <div>
            <p className="mb-1 text-caption font-semibold text-gray-500">변경 전</p>
            <pre className="max-h-80 overflow-auto rounded bg-gray-50 p-3 text-caption text-gray-700">
              {JSON.stringify(detail?.before_data ?? {}, null, 2)}
            </pre>
          </div>
          <div>
            <p className="mb-1 text-caption font-semibold text-gray-500">변경 후</p>
            <pre className="max-h-80 overflow-auto rounded bg-gray-50 p-3 text-caption text-gray-700">
              {JSON.stringify(detail?.after_data ?? {}, null, 2)}
            </pre>
          </div>
        </div>
      </Modal>
    </>
  )
}
