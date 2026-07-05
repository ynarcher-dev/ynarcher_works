import {
  Badge,
  Banner,
  DataTable,
  Spinner,
  PageHeader,
  type BadgeTone,
  type Column,
} from '@ynarcher/ui'
import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { DonutChart } from '@/features/fund/DonutChart'
import {
  useCapitalCalls,
  useFund,
  useFundLps,
  useInvestments,
  type CapitalCall,
  type Investment,
} from '@/features/fund/hooks'

type Tab = 'lp' | 'calls' | 'portfolio'

const callTone: Record<string, BadgeTone> = {
  PAID: 'success',
  OVERDUE: 'danger',
  NOTIFIED: 'warning',
  PARTIALLY_PAID: 'warning',
  SCHEDULED: 'neutral',
}

const callColumns: Column<CapitalCall>[] = [
  { key: 'call_no', header: '회차', render: (r) => `${r.call_no}차` },
  {
    key: 'amount',
    header: '금액',
    align: 'right',
    numeric: true,
    render: (r) => Number(r.amount).toLocaleString(),
  },
  { key: 'due_date', header: '납입 기한', render: (r) => r.due_date ?? '-' },
  {
    key: 'status',
    header: '상태',
    render: (r) => <Badge tone={callTone[r.status] ?? 'neutral'}>{r.status}</Badge>,
  },
]

const invColumns: Column<Investment>[] = [
  {
    key: 'startup_id',
    header: '피투자사',
    render: (r) => (r.startup_id ? r.startup_id.slice(0, 8) : '-'),
  },
  { key: 'stage', header: '단계', render: (r) => r.stage ?? '-' },
  {
    key: 'amount',
    header: '투자금',
    align: 'right',
    numeric: true,
    render: (r) => Number(r.amount).toLocaleString(),
  },
  {
    key: 'is_own',
    header: '구분',
    render: (r) => (r.is_own_investment ? <Badge tone="info">자사 투자</Badge> : '-'),
  },
]

/** 펀드 상세: LP 지분 도넛 / 캐피탈 콜 / 포트폴리오. */
export function FundDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { data: fund, isLoading } = useFund(id)
  const { data: lps } = useFundLps(id)
  const { data: calls } = useCapitalCalls(id)
  const { data: investments } = useInvestments(id)
  const [tab, setTab] = useState<Tab>('lp')

  if (isLoading) return <Spinner />
  if (!fund || !id) return <Banner tone="warning">펀드를 찾을 수 없습니다.</Banner>

  const segments = (lps ?? []).map((lp) => ({
    label: lp.name,
    value: Number(lp.commitment_amount),
  }))

  return (
    <div className="space-y-5">
      <PageHeader
        back={
          <Link to="/fund" className="text-caption font-semibold text-brand hover:text-brand-600">
            ← FUND 보드
          </Link>
        }
        title={fund.name}
      />

      <nav className="flex gap-1 border-b border-gray-200">
        {[
          { key: 'lp' as const, label: '출자자(LP)' },
          { key: 'calls' as const, label: '캐피탈 콜' },
          { key: 'portfolio' as const, label: '포트폴리오' },
        ].map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={
              tab === t.key
                ? 'border-b-2 border-brand px-3 py-2 text-body font-medium text-brand'
                : 'px-3 py-2 text-body text-gray-500 hover:text-gray-800'
            }
          >
            {t.label}
          </button>
        ))}
      </nav>

      {tab === 'lp' &&
        (segments.length > 0 ? (
          <DonutChart segments={segments} />
        ) : (
          <Banner tone="info">등록된 출자자(LP)가 없습니다.</Banner>
        ))}
      {tab === 'calls' && (
        <DataTable
          columns={callColumns}
          rows={calls ?? []}
          rowKey={(r) => r.id}
          emptyText="캐피탈 콜 일정이 없습니다."
        />
      )}
      {tab === 'portfolio' && (
        <DataTable
          columns={invColumns}
          rows={investments ?? []}
          rowKey={(r) => r.id}
          emptyText="집행된 투자가 없습니다."
        />
      )}
    </div>
  )
}
