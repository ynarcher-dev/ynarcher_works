import {
  Banknote,
  Building2,
  CircleDollarSign,
  HandCoins,
  Landmark,
  Layers3,
  Rocket,
  WalletCards,
} from 'lucide-react'
import { Card, Skeleton, SummaryTile, type SummaryTileTone } from '@ynarcher/ui'
import type { FundListFilterState } from '@/features/fund/fundListHooks'
import { useFundListTotals, type FundListTotals } from '@/features/fund/fundSummaryHooks'

interface FundSummaryPanelProps {
  keyword: string
  filters: FundListFilterState
  mineUserId?: string | null
  listTotal?: number
}

const STRATEGIES = ['AC', 'VC', 'PE'] as const
type FundStrategy = (typeof STRATEGIES)[number]

function strategyFilters(filters: FundListFilterState, strategy: FundStrategy): FundListFilterState {
  return { ...filters, strategies: [strategy] }
}

function visibleStrategyCount(
  strategy: FundStrategy,
  filters: FundListFilterState,
  totals: FundListTotals | undefined,
): number {
  if (filters.strategies.length > 0 && !filters.strategies.includes(strategy)) return 0
  return totals?.fundCount ?? 0
}

interface FundTile {
  key: string
  title: string
  eyebrow: string
  value: string | number
  unit: string
  tone: SummaryTileTone
  icon: typeof Layers3
  ratio?: string
}

/** 목록과 동일한 범위·검색·필터를 반영하는 펀드 구성 및 자금 현황판. */
export function FundSummaryPanel({ keyword, filters, mineUserId, listTotal }: FundSummaryPanelProps) {
  const totalQuery = useFundListTotals(keyword, filters, mineUserId)
  const acQuery = useFundListTotals(keyword, strategyFilters(filters, 'AC'), mineUserId)
  const vcQuery = useFundListTotals(keyword, strategyFilters(filters, 'VC'), mineUserId)
  const peQuery = useFundListTotals(keyword, strategyFilters(filters, 'PE'), mineUserId)

  const isPending = totalQuery.isPending || acQuery.isPending || vcQuery.isPending || peQuery.isPending
  const data = totalQuery.data

  if (isPending) {
    return (
      <Card title="펀드 현황">
        <Skeleton className="h-[7.5rem] w-full rounded-radius-lg" />
      </Card>
    )
  }
  if (!data) return null

  if (import.meta.env.DEV && listTotal !== undefined && listTotal !== data.fundCount) {
    console.warn(
      `[FUND] 요약 지표와 목록 건수가 다릅니다(목록 ${listTotal} / 지표 ${data.fundCount}).`,
    )
  }

  const base = data.totalCommitment
  const tiles: FundTile[] = [
    {
      key: 'total', title: '전체 운용펀드', eyebrow: '펀드 구성', value: data.fundCount,
      unit: '개', tone: 'primary', icon: Layers3,
    },
    {
      key: 'ac', title: 'AC 펀드', eyebrow: '액셀러레이팅',
      value: visibleStrategyCount('AC', filters, acQuery.data), unit: '개', tone: 'purple', icon: Rocket,
    },
    {
      key: 'vc', title: 'VC 펀드', eyebrow: '벤처 투자',
      value: visibleStrategyCount('VC', filters, vcQuery.data), unit: '개', tone: 'cyan', icon: Building2,
    },
    {
      key: 'pe', title: 'PE 펀드', eyebrow: '프라이빗 에쿼티',
      value: visibleStrategyCount('PE', filters, peQuery.data), unit: '개', tone: 'amber', icon: Landmark,
    },
    {
      key: 'commitment', title: '약정총액', eyebrow: '자금 현황', value: millionNumber(base),
      unit: '백만원', tone: 'peach', icon: HandCoins, ratio: '기준 100%',
    },
    {
      key: 'paidIn', title: '실출자금액', eyebrow: '자금 현황', value: amountText(data.paidIn),
      unit: '백만원', tone: 'rose', icon: CircleDollarSign, ratio: ratioText(data.paidIn, base),
    },
    {
      key: 'drawn', title: '투자집행액', eyebrow: '자금 현황', value: millionNumber(data.drawn),
      unit: '백만원', tone: 'lime', icon: Banknote, ratio: ratioText(data.drawn, base),
    },
    {
      key: 'balance', title: '투자잔액', eyebrow: '자금 현황', value: millionNumber(data.balance),
      unit: '백만원', tone: 'mint', icon: WalletCards, ratio: ratioText(data.balance, base),
    },
  ]

  return (
    <Card title="펀드 현황">
      <section
        aria-label="펀드 구성 및 자금 현황"
        className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-8"
      >
        {tiles.map((tile) => {
          const Icon = tile.icon
          return (
            <SummaryTile
              key={tile.key}
              title={tile.title}
              eyebrow={tile.eyebrow}
              value={tile.value}
              unit={tile.unit}
              tone={tile.tone}
              compact
              metrics={tile.ratio ? [{ label: '', value: tile.ratio }] : undefined}
              icon={<Icon aria-hidden className="size-[18px]" strokeWidth={1.8} />}
            />
          )
        })}
      </section>
    </Card>
  )
}

function ratioText(value: number | null, base: number): string {
  if (value == null || base <= 0) return '약정 대비 -'
  const ratio = value / base
  const percent = Math.round(ratio * 100)
  if (percent === 0 && ratio > 0) return '약정 대비 <1%'
  if (percent === 100 && ratio < 1) return '약정 대비 >99%'
  return `약정 대비 ${percent.toLocaleString()}%`
}

function amountText(won: number | null): string {
  return won == null ? '-' : millionNumber(won)
}

function millionNumber(won: number): string {
  return Math.round(won / 1_000_000).toLocaleString()
}
