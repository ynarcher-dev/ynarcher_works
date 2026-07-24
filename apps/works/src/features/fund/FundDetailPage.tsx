import {
  BackButton,
  Badge,
  Banner,
  Button,
  CardShell,
  DataTable,
  DensityProvider,
  InfoField,
  Spinner,
  Tabs,
  useToast,
  type BadgeTone,
  type Column,
} from '@ynarcher/ui'
import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { DetailDeleteButton } from '@/components/DetailDeleteButton'
import { ChangeHistoryPanel } from '@/features/networks/ChangeHistoryPanel'
import { FeedbackPanel } from '@/features/networks/FeedbackPanel'
import { MaterialPanel } from '@/features/networks/MaterialPanel'
import { RelatedApprovalPanel } from '@/features/program/detail/RelatedApprovalPanel'
import { RelatedMinutesPanel } from '@/features/office/minutes/RelatedMinutesPanel'
import { DonutChart } from '@/features/fund/DonutChart'
import { FundForm } from '@/features/fund/FundForm'
import { InvestmentFormModal } from '@/features/fund/InvestmentFormModal'
import {
  FUND_CHARACTER_LABEL,
  FUND_SOURCE_LABEL,
  FUND_STATUS_TONE,
  FUND_STRATEGY_LABEL,
  FUND_SUBSCRIPTION_LABEL,
  FUND_TYPE_LABEL,
  formatEok,
  fundDate,
  fundManagerLabel,
  fundOperatorLabel,
  fundPeriod,
  fundStatusLabel,
} from '@/features/fund/fundListHooks'
import {
  useCapitalCalls,
  useDeactivateFund,
  useDeleteInvestment,
  useFund,
  useFundContributions,
  useFundLps,
  useInvestments,
  type CapitalCall,
  type FundLp,
  type Investment,
} from '@/features/fund/hooks'

const Info = InfoField

const strategyTone: Record<string, BadgeTone> = { AC: 'info', VC: 'success', PE: 'warning', ETC: 'neutral' }

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

const lpColumns: Column<FundLp>[] = [
  { key: 'name', header: 'LP명', primary: true, render: (r) => r.name },
  {
    key: 'commitment_amount',
    header: '약정액',
    align: 'right',
    numeric: true,
    render: (r) => Number(r.commitment_amount).toLocaleString(),
  },
  {
    key: 'ownership_pct',
    header: '지분율',
    align: 'right',
    numeric: true,
    render: (r) => (r.ownership_pct == null ? '-' : `${r.ownership_pct}%`),
  },
]

type DetailTab = 'lp' | 'portfolio' | 'calls'
const DETAIL_TABS: { key: DetailTab; label: string }[] = [
  { key: 'lp', label: '출자자(LP)' },
  { key: 'portfolio', label: '포트폴리오' },
  { key: 'calls', label: '캐피탈 콜' },
]

/** 카드 안 KPI 타일. */
function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-radius-md border border-gray-200 bg-gray-25 px-3 py-2">
      <p className="text-caption text-gray-600">{label}</p>
      <p className="text-body font-bold tabular-nums text-gray-900">{value}</p>
    </div>
  )
}

/**
 * 펀드 상세: 상단 편집/삭제 + 2:1 카드 섹션. 좌측 개요 카드 아래 서브 탭바(출자자/포트폴리오/캐피탈 콜)로
 * 운영 섹션을 전환한다(AC ProgramOverviewTab 구조). 우측(1/3)은 운용 인력·관리 정보 고정.
 * 편집은 페이지형 FundForm으로 인라인 전환한다.
 */
export function FundDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { data: fund, isLoading } = useFund(id)
  const { data: lps } = useFundLps(id)
  const { data: calls } = useCapitalCalls(id)
  const { data: investments } = useInvestments(id)
  const { data: contributions } = useFundContributions(id)
  const del = useDeleteInvestment(id ?? '')
  const deactivate = useDeactivateFund()
  const toast = useToast()
  const [editing, setEditing] = useState(false)
  const [tab, setTab] = useState<DetailTab>('lp')
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
    { key: 'startup', header: '피투자사', primary: true, render: (r) => r.startup_name ?? '-' },
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

  // 편집: 페이지형 폼으로 인라인 전환(상세 ↔ 폼).
  if (editing) {
    return (
      <FundForm
        fundId={id}
        initial={fund}
        onCancel={() => setEditing(false)}
        onDone={() => setEditing(false)}
      />
    )
  }

  const commit = Number(fund.total_commitment)
  const drawn = Number(fund.drawn_amount)
  const paidIn = fund.paid_in_amount == null ? null : Number(fund.paid_in_amount)
  const segments = (lps ?? []).map((lp) => ({ label: lp.name, value: Number(lp.commitment_amount) }))
  const operators = fund.operators ?? []

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <BackButton as={Link} to="/fund" />
        <div className="flex items-center gap-2">
          {/* 펀드는 삭제 사유 인프라가 없어 확인창(confirm)으로 소프트 삭제한다. */}
          <DetailDeleteButton
            name={fund.name}
            withReason={false}
            onDelete={async () => {
              await deactivate.mutateAsync(fund.id)
            }}
            onDeleted={() => navigate('/fund')}
          />
          <Button onClick={() => setEditing(true)}>편집</Button>
        </div>
      </div>

      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-3">
        {/* 좌측(2/3): 개요 카드 + 운영 서브 탭 */}
        <div className="space-y-4 lg:col-span-2">
          <CardShell>
            <DensityProvider value="page">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-title-md font-bold text-gray-900">{fund.name}</h1>
                {fund.source_type && (
                  <Badge tone={fund.source_type === 'MOTAE' ? 'info' : 'neutral'}>
                    {FUND_SOURCE_LABEL[fund.source_type] ?? fund.source_type}
                  </Badge>
                )}
                {fund.character_type && (
                  <Badge tone="neutral">{FUND_CHARACTER_LABEL[fund.character_type] ?? fund.character_type}</Badge>
                )}
                {fund.strategy_type && (
                  <Badge tone={strategyTone[fund.strategy_type] ?? 'neutral'}>
                    {FUND_STRATEGY_LABEL[fund.strategy_type] ?? fund.strategy_type}
                  </Badge>
                )}
                {fund.fund_type && (
                  <Badge tone={fund.fund_type === 'PROJECT' ? 'info' : 'neutral'}>
                    {FUND_TYPE_LABEL[fund.fund_type] ?? fund.fund_type}
                  </Badge>
                )}
                <Badge tone={FUND_STATUS_TONE[fund.status] ?? 'neutral'}>{fundStatusLabel(fund.status)}</Badge>
              </div>
            </DensityProvider>

            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Stat label="약정총액" value={formatEok(commit)} />
              <Stat label="실출자금액" value={paidIn == null ? '-' : formatEok(paidIn)} />
              <Stat label="집행액" value={formatEok(drawn)} />
              <Stat label="잔액" value={formatEok(commit - drawn)} />
            </div>

            <div className="mt-4 grid grid-cols-1 gap-2.5 border-t border-gray-100 pt-4 sm:grid-cols-3">
              <Info label="결성일" value={fundDate(fund.formed_on ?? null) ?? '-'} />
              <Info label="존속기간" value={fundPeriod(fund.term_start ?? null, fund.term_end ?? null) ?? '-'} />
              <Info
                label="운용기간"
                value={fundPeriod(fund.operation_start ?? null, fund.operation_end ?? null) ?? '-'}
              />
              <Info
                label="출자 방식"
                value={
                  fund.subscription_type
                    ? FUND_SUBSCRIPTION_LABEL[fund.subscription_type] ?? fund.subscription_type
                    : '-'
                }
              />
              <Info label="대표펀드매니저" value={fund.manager?.name || '-'} />
              <Info label="운용인력" value={fundOperatorLabel(operators) ?? '-'} />
              <Info label="관리인력" value={fundManagerLabel(operators) ?? '-'} />
              <Info label="등록자" value={fund.creator?.name || '-'} />
              <Info label="수정일" value={fundDate(fund.updated_at ?? null) ?? '-'} />
            </div>
          </CardShell>

          <div>
            <Tabs items={DETAIL_TABS} value={tab} onChange={(k) => setTab(k as DetailTab)} />
            <div className="mt-4">
              {tab === 'lp' && (
                <CardShell>
                  {segments.length > 0 ? (
                    <div className="space-y-4">
                      <DonutChart segments={segments} />
                      <DataTable columns={lpColumns} rows={lps ?? []} rowKey={(r) => r.id} standardColumns={false} />
                    </div>
                  ) : (
                    <p className="text-body text-gray-600">등록된 출자자(LP)가 없습니다.</p>
                  )}
                </CardShell>
              )}
              {tab === 'portfolio' && (
                <CardShell>
                  <div className="mb-3 flex justify-end">
                    <Button onClick={() => setInvModal({ open: true, editing: null })}>투자 집행 등록</Button>
                  </div>
                  <DataTable
                    columns={invColumns}
                    rows={investments ?? []}
                    rowKey={(r) => r.id}
                    standardColumns={false}
                    emptyText="집행된 투자가 없습니다."
                  />
                </CardShell>
              )}
              {tab === 'calls' && (
                <CardShell>
                  <DataTable
                    columns={callColumns}
                    rows={calls ?? []}
                    rowKey={(r) => r.id}
                    standardColumns={false}
                    emptyText="캐피탈 콜 일정이 없습니다."
                  />
                </CardShell>
              )}
            </div>
          </div>
        </div>

        {/* 우측(1/3): AC 상세와 동일한 공용 패널 — 전자결재·관련회의록·자료관리·코멘트·변동이력 */}
        <div className="space-y-4 lg:col-span-1">
          <RelatedApprovalPanel />
          <RelatedMinutesPanel targetType="fund" targetId={fund.id} />
          {/* 자료 업로드는 편집 페이지에서 — 상세는 읽기 전용 뷰. */}
          <MaterialPanel targetType="fund" targetId={fund.id} readOnly />
          <FeedbackPanel targetType="fund" targetId={fund.id} />
          <ChangeHistoryPanel contributions={contributions} />
        </div>
      </div>

      <InvestmentFormModal
        fundId={id}
        open={invModal.open}
        editing={invModal.editing}
        onClose={() => setInvModal({ open: false, editing: null })}
      />
    </div>
  )
}
