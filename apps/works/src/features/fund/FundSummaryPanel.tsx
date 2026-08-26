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
import { useFundListTotals } from '@/features/fund/fundSummaryHooks'

interface FundSummaryPanelProps {
  keyword: string
  filters: FundListFilterState
  mineUserId?: string | null
  listTotal?: number
  /** 구분 타일 토글(다중선택). 타일이 곧 구분(strategy_type) 필터다. */
  onToggleStrategy: (strategy: string) => void
  /** '전체 운용펀드' 타일 — 구분 조건을 푸는 문. */
  onClearStrategies: () => void
}

type FundStrategy = 'AC' | 'VC' | 'PE'

function strategyFilters(filters: FundListFilterState, strategy: FundStrategy): FundListFilterState {
  return { ...filters, strategies: [strategy] }
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
  /** 지정 시 그 값으로 구분 필터를 토글한다. 금액 타일은 필터 축이 아니라 비운다. */
  strategy?: FundStrategy
  /** 구분 조건을 푸는 타일(전체). */
  clears?: boolean
}

/** 목록과 동일한 범위·검색·필터를 반영하는 펀드 구성 및 자금 현황판. */
export function FundSummaryPanel({
  keyword,
  filters,
  mineUserId,
  listTotal,
  onToggleStrategy,
  onClearStrategies,
}: FundSummaryPanelProps) {
  // 금액 지표는 지금 목록에 선 그대로를 답해야 하므로 필터를 전부 건 집계를 쓴다.
  const scopedQuery = useFundListTotals(keyword, filters, mineUserId)
  // 구분 타일은 반대다 — 자기 축(구분)을 뺀 집계라야 "저걸 누르면 몇 건이 되는가"를 답한다.
  // 종전에는 고르지 않은 구분을 0으로 적었는데, 그러면 누를 수 있게 된 지금은 0을 눌러야
  // 결과가 나오는 화면이 된다. 구분이 비어 있을 때는 위 집계와 조건이 같아 요청도 한 번이다.
  const allStrategyQuery = useFundListTotals(keyword, { ...filters, strategies: [] }, mineUserId)
  const acQuery = useFundListTotals(keyword, strategyFilters(filters, 'AC'), mineUserId)
  const vcQuery = useFundListTotals(keyword, strategyFilters(filters, 'VC'), mineUserId)
  const peQuery = useFundListTotals(keyword, strategyFilters(filters, 'PE'), mineUserId)

  const isPending =
    scopedQuery.isPending ||
    allStrategyQuery.isPending ||
    acQuery.isPending ||
    vcQuery.isPending ||
    peQuery.isPending
  const data = scopedQuery.data

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
      key: 'total', title: '전체 운용펀드', eyebrow: '펀드 구성',
      value: allStrategyQuery.data?.fundCount ?? 0,
      unit: '개', tone: 'primary', icon: Layers3, clears: true,
    },
    {
      key: 'ac', title: 'AC 펀드', eyebrow: '액셀러레이팅',
      value: acQuery.data?.fundCount ?? 0, unit: '개', tone: 'purple', icon: Rocket, strategy: 'AC',
    },
    {
      key: 'vc', title: 'VC 펀드', eyebrow: '벤처 투자',
      value: vcQuery.data?.fundCount ?? 0, unit: '개', tone: 'cyan', icon: Building2, strategy: 'VC',
    },
    {
      key: 'pe', title: 'PE 펀드', eyebrow: '프라이빗 에쿼티',
      value: peQuery.data?.fundCount ?? 0, unit: '개', tone: 'amber', icon: Landmark, strategy: 'PE',
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
              // 필터 축은 구분뿐이다 — 금액 타일(약정·출자·집행·잔액)은 좁힐 조건이 아니라
              // 좁힌 결과라 누르지 않는다.
              onClick={
                tile.strategy
                  ? () => onToggleStrategy(tile.strategy as string)
                  : tile.clears
                    ? onClearStrategies
                    : undefined
              }
              selected={
                tile.strategy
                  ? filters.strategies.includes(tile.strategy)
                  : tile.clears
                    ? filters.strategies.length === 0
                    : undefined
              }
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
