import { Badge, Button, DataTable, Spinner, PageHeader, type Column } from '@ynarcher/ui'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ProgramFormModal } from '@/features/ac/ProgramFormModal'
import { usePrograms, type Program } from '@/features/ac/hooks'
import { PROGRAM_STATUS_LABEL } from '@/features/ac/config'

/** AC 통합 대시보드: 프로그램 목록 + KPI 요약 + 등록. (7-14 / 7-1 진입) */
export function AcDashboardPage() {
  const { data, isLoading } = usePrograms()
  const [creating, setCreating] = useState(false)
  const navigate = useNavigate()

  const programs = data ?? []
  const operating = programs.filter((p) => p.status === 'OPERATING').length
  const recruiting = programs.filter((p) => p.status === 'RECRUITING').length

  const columns: Column<Program>[] = [
    { key: 'title', header: '프로그램', render: (r) => r.title },
    {
      key: 'status',
      header: '상태',
      render: (r) => <Badge tone="info">{PROGRAM_STATUS_LABEL[r.status] ?? r.status}</Badge>,
    },
    { key: 'start_date', header: '시작', render: (r) => r.start_date ?? '-' },
    { key: 'end_date', header: '종료', render: (r) => r.end_date ?? '-' },
    {
      key: '_action',
      header: '',
      align: 'right',
      render: (r) => (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate(`/ac/programs/${r.id}`)}
        >
          열기
        </Button>
      ),
    },
  ]

  return (
    <div className="space-y-5">
      <PageHeader
        title="AC 대시보드"
        actions={<Button onClick={() => setCreating(true)}>프로그램 등록</Button>}
      />

      <div className="grid grid-cols-3 gap-3">
        {[
          { label: '전체 프로그램', value: programs.length },
          { label: '운영 중', value: operating },
          { label: '모집 중', value: recruiting },
        ].map((tile) => (
          <div
            key={tile.label}
            className="rounded border border-gray-300 bg-white px-4 py-3"
          >
            <p className="text-caption text-gray-500">{tile.label}</p>
            <p className="text-title-md font-bold tabular-nums text-gray-900">
              {tile.value}
            </p>
          </div>
        ))}
      </div>

      {isLoading ? (
        <Spinner />
      ) : (
        <DataTable
          columns={columns}
          rows={programs}
          rowKey={(r) => r.id}
          emptyText="등록된 프로그램이 없습니다."
        />
      )}

      <ProgramFormModal open={creating} onClose={() => setCreating(false)} />
    </div>
  )
}
