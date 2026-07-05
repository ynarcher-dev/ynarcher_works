import { Badge, Button, DataTable, Spinner, PageHeader, type Column } from '@ynarcher/ui'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { FundFormModal } from '@/features/fund/FundFormModal'
import { useFunds, type Fund } from '@/features/fund/hooks'

function won(n: number): string {
  return `${(n / 100_000_000).toLocaleString()}억`
}

/** FUND 현황 보드: 펀드 목록 + 결성/집행 요약. */
export function FundPage() {
  const { data, isLoading } = useFunds()
  const [creating, setCreating] = useState(false)
  const navigate = useNavigate()
  const funds = data ?? []

  const totalCommit = funds.reduce((s, f) => s + Number(f.total_commitment), 0)
  const totalDrawn = funds.reduce((s, f) => s + Number(f.drawn_amount), 0)

  const columns: Column<Fund>[] = [
    { key: 'name', header: '펀드', render: (f) => f.name },
    { key: 'vintage_year', header: '결성연도', render: (f) => f.vintage_year ?? '-' },
    { key: 'status', header: '상태', render: (f) => <Badge tone="info">{f.status}</Badge> },
    {
      key: 'total_commitment',
      header: '결성액',
      align: 'right',
      numeric: true,
      render: (f) => won(Number(f.total_commitment)),
    },
    {
      key: 'drawn_amount',
      header: '집행액',
      align: 'right',
      numeric: true,
      render: (f) => won(Number(f.drawn_amount)),
    },
    {
      key: '_action',
      header: '',
      align: 'right',
      render: (f) => (
        <Button variant="ghost" size="sm" onClick={() => navigate(`/fund/${f.id}`)}>
          열기
        </Button>
      ),
    },
  ]

  return (
    <div className="space-y-5">
      <PageHeader
        title="투자 대시보드"
        actions={<Button onClick={() => setCreating(true)}>펀드 등록</Button>}
      />

      <div className="grid grid-cols-3 gap-3">
        {[
          { label: '펀드 수', value: String(funds.length) },
          { label: '총 결성액', value: won(totalCommit) },
          { label: '총 집행액', value: won(totalDrawn) },
        ].map((t) => (
          <div key={t.label} className="rounded border border-gray-300 bg-white px-4 py-3">
            <p className="text-caption text-gray-500">{t.label}</p>
            <p className="text-title-md font-bold tabular-nums text-gray-900">{t.value}</p>
          </div>
        ))}
      </div>

      {isLoading ? (
        <Spinner />
      ) : (
        <DataTable
          columns={columns}
          rows={funds}
          rowKey={(f) => f.id}
          emptyText="등록된 펀드가 없습니다."
        />
      )}

      <FundFormModal open={creating} onClose={() => setCreating(false)} />
    </div>
  )
}
