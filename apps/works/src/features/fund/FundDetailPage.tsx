import {
  BackButton,
  Badge,
  Banner,
  Button,
  DataTable,
  Spinner,
  PageHeader,
  useToast,
  type BadgeTone,
  type Column,
} from '@ynarcher/ui'
import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { DonutChart } from '@/features/fund/DonutChart'
import { InvestmentFormModal } from '@/features/fund/InvestmentFormModal'
import {
  useCapitalCalls,
  useDeleteInvestment,
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

/** 펀드 상세: LP 지분 도넛 / 캐피탈 콜 / 포트폴리오. */
export function FundDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { data: fund, isLoading } = useFund(id)
  const { data: lps } = useFundLps(id)
  const { data: calls } = useCapitalCalls(id)
  const { data: investments } = useInvestments(id)
  const del = useDeleteInvestment(id ?? '')
  const toast = useToast()
  const [tab, setTab] = useState<Tab>('lp')
  // 투자 등록/수정 모달. editing이 있으면 수정, null이면 신규.
  const [invModal, setInvModal] = useState<{ open: boolean; editing: Investment | null }>({
    open: false,
    editing: null,
  })

  const onDeleteInvestment = async (inv: Investment) => {
    if (!window.confirm(`${inv.startup_name ?? '해당'} 투자를 삭제할까요?`)) return
    try {
      await del.mutateAsync(inv.id)
      toast.show('투자를 삭제했습니다.', 'success')
    } catch {
      toast.show('삭제에 실패했습니다. 권한을 확인하세요.', 'danger')
    }
  }

  const invColumns: Column<Investment>[] = [
    {
      key: 'startup',
      header: '피투자사',
      render: (r) => r.startup_name ?? '-',
    },
    { key: 'invested_at', header: '투자일', render: (r) => r.invested_at?.slice(0, 10) ?? '-' },
    { key: 'stage', header: '라운드', render: (r) => r.stage ?? '-' },
    {
      key: 'valuation',
      header: '기업 가치(Pre)',
      align: 'right',
      numeric: true,
      render: (r) => (r.valuation == null ? '-' : Number(r.valuation).toLocaleString()),
    },
    {
      key: 'amount',
      header: '집행액',
      align: 'right',
      numeric: true,
      render: (r) => Number(r.amount).toLocaleString(),
    },
    {
      key: '_action',
      header: '',
      align: 'right',
      render: (r) => (
        <div className="flex justify-end gap-1">
          <Button variant="ghost" onClick={() => setInvModal({ open: true, editing: r })}>
            수정
          </Button>
          <Button variant="ghost" onClick={() => void onDeleteInvestment(r)}>
            삭제
          </Button>
        </div>
      ),
    },
  ]

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
          <BackButton as={Link} to="/fund" />
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
                : 'px-3 py-2 text-body text-gray-600 hover:text-gray-800'
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
        <div className="space-y-3">
          <div className="flex justify-end">
            <Button onClick={() => setInvModal({ open: true, editing: null })}>투자 집행 등록</Button>
          </div>
          <DataTable
            columns={invColumns}
            rows={investments ?? []}
            rowKey={(r) => r.id}
            emptyText="집행된 투자가 없습니다."
          />
        </div>
      )}

      <InvestmentFormModal
        fundId={id}
        open={invModal.open}
        editing={invModal.editing}
        onClose={() => setInvModal({ open: false, editing: null })}
      />
    </div>
  )
}
