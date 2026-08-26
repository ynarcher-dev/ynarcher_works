import {
  BackButton,
  Badge,
  Banner,
  Button,
  CardHeading,
  CardShell,
  DensityProvider,
  InfoField,
  Spinner,
  Tabs,
  useToast,
  type BadgeTone,
} from '@ynarcher/ui'
import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { DetailDeleteButton } from '@/components/DetailDeleteButton'
import { ChangeHistoryPanel } from '@/features/networks/ChangeHistoryPanel'
import { FeedbackPanel } from '@/features/networks/FeedbackPanel'
import { MaterialPanel } from '@/features/networks/MaterialPanel'
import { RelatedMinutesPanel } from '@/features/office/minutes/RelatedMinutesPanel'
import { CapitalCallPanel } from '@/features/fund/CapitalCallPanel'
import { FundForm } from '@/features/fund/FundForm'
import { FundLpPanel } from '@/features/fund/FundLpPanel'
import { FundPurposeProgress } from '@/features/fund/FundPurposeProgress'
import { InvestmentFormModal } from '@/features/fund/InvestmentFormModal'
import { PortfolioBoardCard } from '@/features/fund/PortfolioBoardCard'
import {
  FUND_CHARACTER_LABEL,
  FUND_SOURCE_LABEL,
  FUND_STATUS_TONE,
  FUND_STRATEGY_LABEL,
  FUND_SUBSCRIPTION_LABEL,
  FUND_TYPE_LABEL,
  formatWon,
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
  useFundPurposes,
  useInvestments,
  type Investment,
} from '@/features/fund/hooks'

const Info = InfoField

const strategyTone: Record<string, BadgeTone> = { AC: 'info', VC: 'success', PE: 'warning', ETC: 'neutral' }

type DetailTab = 'overview' | 'portfolio' | 'lp' | 'calls' | 'financials' | 'reports'
// 구분선(divider) = 열람권한 경계. 일반 권한은 개요·포트폴리오까지, 그 뒤(출자자~보고서)는 유관 관리자급만.
const DETAIL_TABS: { key: DetailTab; label: string; divider?: boolean }[] = [
  { key: 'portfolio', label: '포트폴리오' },
  { key: 'overview', label: '목적달성' },
  { key: 'lp', label: '출자자', divider: true },
  { key: 'calls', label: '캐피탈 콜' },
  { key: 'financials', label: '조합 재무' },
  { key: 'reports', label: '보고서' },
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
  const { data: purposes } = useFundPurposes(id)
  const { data: contributions } = useFundContributions(id)
  const del = useDeleteInvestment(id ?? '')
  const deactivate = useDeactivateFund()
  const toast = useToast()
  const [editing, setEditing] = useState(false)
  const [tab, setTab] = useState<DetailTab>('portfolio')
  const [invModal, setInvModal] = useState<{ open: boolean; editing: Investment | null }>({
    open: false,
    editing: null,
  })

  const onDeleteInvestment = async (inv: Investment) => {
    if (!window.confirm(`${inv.startup_name ?? '해당'} 투자를 삭제할까요?`)) return
    try {
      await del.mutateAsync(inv.id)
      toast.show('투자를 삭제했습니다.', 'success')
      // 삭제는 수정 폼 좌측 하단에서 호출된다 — 성공 시 폼을 닫는다.
      setInvModal({ open: false, editing: null })
    } catch {
      toast.show('삭제에 실패했습니다. 권한을 확인하세요.', 'danger')
    }
  }

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
        {/* 좌측(2/3): 펀드 기본 데이터 카드(이름·배지 + 요약지표 + 정보부, 탭 무관 상단 고정) + 운영 서브 탭.
            STARTUP·NETWORKS 상세의 첫 카드 섹션과 동일한 구성이다. */}
        <div className="space-y-4 lg:col-span-2">
          <CardShell>
            <DensityProvider value="page">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-title-md font-bold text-gray-900">{fund.name}</h1>
                {fund.strategy_type && (
                  <Badge tone={strategyTone[fund.strategy_type] ?? 'neutral'}>
                    {FUND_STRATEGY_LABEL[fund.strategy_type] ?? fund.strategy_type}
                  </Badge>
                )}
                <Badge tone={FUND_STATUS_TONE[fund.status] ?? 'neutral'}>{fundStatusLabel(fund.status)}</Badge>
              </div>
            </DensityProvider>

            {/* 요약 지표(약정·실출자·집행·잔액) */}
            <div className="mt-5 grid grid-cols-2 gap-3 border-t border-gray-100 pt-4 sm:grid-cols-4">
              <Stat label="약정총액" value={formatWon(commit)} />
              <Stat label="실출자금액" value={paidIn == null ? '-' : formatWon(paidIn)} />
              <Stat label="집행액" value={formatWon(drawn)} />
              <Stat label="잔액" value={formatWon(commit - drawn)} />
            </div>

            {/* 펀드 속성(재원·성격·유형·기간·출자방식) */}
            <div className="mt-4 grid grid-cols-1 gap-2.5 border-t border-gray-100 pt-4 sm:grid-cols-3">
              {/* 펀드코드: 사업코드와 같은 형식(6자리 영숫자)이며 워크스페이스를 가로질러 유니크하다. */}
              <Info label="펀드코드" value={fund.code || '-'} />
              <Info
                label="재원구분"
                value={fund.source_type ? FUND_SOURCE_LABEL[fund.source_type] ?? fund.source_type : '-'}
              />
              <Info
                label="성격구분"
                value={
                  fund.character_type ? FUND_CHARACTER_LABEL[fund.character_type] ?? fund.character_type : '-'
                }
              />
              <Info
                label="펀드유형"
                value={fund.fund_type ? FUND_TYPE_LABEL[fund.fund_type] ?? fund.fund_type : '-'}
              />
              {/* 결성일은 존속기간 시작일과 같은 날이라 은퇴했다 — 묻지도 적지도 않는다(20260731240000). */}
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
            </div>

            {/* 인력·등록 그룹: 펀드 속성과 구분선으로 분리. */}
            <div className="mt-4 grid grid-cols-1 gap-2.5 border-t border-gray-100 pt-4 sm:grid-cols-3">
              <Info label="대표펀드매니저" value={fund.manager?.name || '-'} />
              <Info label="운용인력" value={fundOperatorLabel(operators, true) ?? '-'} />
              <Info label="관리인력" value={fundManagerLabel(operators, true) ?? '-'} />
              {/* 생성자(created_by) — 관리 주체(대표펀드매니저·운용·관리인력)와 별개 축이다. */}
              <Info label="생성자" value={fund.creator?.name || '-'} />
              <Info label="수정일" value={fundDate(fund.updated_at ?? null) ?? '-'} />
            </div>
          </CardShell>

          <div>
            <Tabs items={DETAIL_TABS} value={tab} onChange={(k) => setTab(k as DetailTab)} />
            <div className="mt-4">
              {tab === 'overview' && (
                <div className="space-y-4">
                  {/* 목적별 달성 현황: 규약 주목적·특수목적 목표비율 대비 부합 투자 집행 달성률. */}
                  <CardShell>
                    <CardHeading level="subhead" className="mb-3">
                      목적별 달성 현황
                    </CardHeading>
                    <FundPurposeProgress
                      purposes={purposes ?? []}
                      investments={investments ?? []}
                      commitment={commit}
                    />
                  </CardShell>
                </div>
              )}
              {tab === 'lp' && <FundLpPanel fundId={id} lps={lps ?? []} />}
              {tab === 'portfolio' && (
                <PortfolioBoardCard
                  fundName={fund.name}
                  investments={investments ?? []}
                  purposes={purposes ?? []}
                  onAdd={() => setInvModal({ open: true, editing: null })}
                  onEdit={(inv) => setInvModal({ open: true, editing: inv })}
                />
              )}
              {tab === 'calls' && (
                <CapitalCallPanel
                  fundId={id}
                  fundName={fund.name}
                  calls={calls ?? []}
                  lps={lps ?? []}
                />
              )}
              {tab === 'financials' && (
                <CardShell>
                  <Banner tone="info">
                    조합 재무(재무상태표·손익), 관리보수 산출·환입, 회계감사인 원장은 후속 마이그레이션에서
                    연결됩니다.
                  </Banner>
                </CardShell>
              )}
              {tab === 'reports' && (
                <CardShell>
                  <Banner tone="info">
                    영업보고서·운용보고(월간 투자현황) 자동 생성은 후속 Phase에서 제공됩니다.
                  </Banner>
                </CardShell>
              )}
            </div>
          </div>
        </div>

        {/* 우측(1/3): AC 상세와 동일한 공용 패널 — 자료 관리 → 관련 회의록 → 변동 이력 → 코멘트.
            '전자결재' 패널은 2026-08-26 걷어냈다 — 결재 문서의 워크스페이스 연동이 받는 대상은
            사업 3종(AC·M&A·PROJECT)뿐이라(approval_program_links의 CHECK 제약), 조합은 걸릴 수
            있는 대상이 아니어서 이 자리가 영원히 "연결된 전자결재가 없습니다"로 남는다. 없는
            연결을 빈 칸으로 세워 두면 언젠가 채워질 자리로 읽힌다. */}
        <div className="space-y-4 lg:col-span-1">
          {/* 자료 업로드는 편집 페이지에서 — 상세는 읽기 전용 뷰. */}
          <MaterialPanel targetType="fund" targetId={fund.id} readOnly />
          <RelatedMinutesPanel targetType="fund" targetId={fund.id} />
          <ChangeHistoryPanel contributions={contributions} />
          <FeedbackPanel targetType="fund" targetId={fund.id} />
        </div>
      </div>

      <InvestmentFormModal
        fundId={id}
        fundName={fund.name}
        open={invModal.open}
        editing={invModal.editing}
        onClose={() => setInvModal({ open: false, editing: null })}
        onDelete={(inv) => void onDeleteInvestment(inv)}
      />

    </div>
  )
}
