import { Badge, Button, DataTable, EmptyState, Spinner, PageHeader, type Column } from '@ynarcher/ui'
import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { FundFormModal } from '@/features/fund/FundFormModal'
import { useFunds, type Fund } from '@/features/fund/hooks'

function won(n: number): string {
  return `${(n / 100_000_000).toLocaleString()}억`
}

/** 사이드바 탭 → 페이지 제목. 현황 외 항목은 메뉴만 선반영한 상태(화면 미구현). */
const HEADINGS: Record<string, string> = {
  dashboard: '펀드 현황',
  mine: '내 펀드 관리',
  ac_fund: 'AC 펀드',
  vc_fund: 'VC 펀드',
  pe_fund: 'PE 펀드',
}

/**
 * FUND 워크스페이스: 펀드 현황 / 내 펀드 관리 / AC·VC·PE 펀드. 섹션 전환은 좌측 사이드바(?tab).
 * 현재는 현황 탭만 실제 목록을 렌더링하고, 나머지는 골격만 노출한다.
 */
export function FundPage() {
  const [params] = useSearchParams()
  const tab = params.get('tab') ?? 'dashboard'
  const { data, isLoading } = useFunds()
  const [creating, setCreating] = useState(false)
  const navigate = useNavigate()
  const funds = data ?? []

  if (tab !== 'dashboard') {
    return (
      <div className="space-y-5">
        <PageHeader title={HEADINGS[tab] ?? HEADINGS.dashboard} />
        <EmptyState
          title={`${HEADINGS[tab] ?? HEADINGS.dashboard} 준비 중`}
          description="해당 섹션은 준비 중입니다."
        />
      </div>
    )
  }

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
        <Button variant="ghost" onClick={() => navigate(`/fund/${f.id}`)}>
          열기
        </Button>
      ),
    },
  ]

  return (
    <div className="space-y-5">
      <PageHeader
        title={HEADINGS.dashboard}
        actions={<Button onClick={() => setCreating(true)}>펀드 등록</Button>}
      />

      <div className="grid grid-cols-3 gap-3">
        {[
          { label: '펀드 수', value: String(funds.length) },
          { label: '총 결성액', value: won(totalCommit) },
          { label: '총 집행액', value: won(totalDrawn) },
        ].map((t) => (
          <div key={t.label} className="rounded border border-gray-300 bg-white px-4 py-3">
            <p className="text-caption text-gray-600">{t.label}</p>
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
