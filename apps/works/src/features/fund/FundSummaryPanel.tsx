import { Banknote, CircleDollarSign, HandCoins, Layers3, WalletCards } from 'lucide-react'
import { Card, Skeleton, SummaryTile, type SummaryTileTone } from '@ynarcher/ui'
import { useEffect, useRef } from 'react'
import type { FundListFilterState } from '@/features/fund/fundListHooks'
import { useFundListTotals } from '@/features/fund/fundSummaryHooks'

interface FundSummaryPanelProps {
  keyword: string
  filters: FundListFilterState
  mineUserId?: string | null
  listTotal?: number
  /** 목록이 이전 검색·필터 결과를 임시 표시 중인지. 이때는 새 요약과 건수를 대조하지 않는다. */
  listIsPlaceholderData?: boolean
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

/**
 * 목록과 동일한 범위·검색·필터를 반영하는 펀드 현황판.
 *
 * 타일은 전부 좁힌 결과이지 좁히는 조건이 아니다 — 구분(AC/VC/PE)을 묻는 자리는
 * 필터 바의 '구분' 칸 하나이며(2026-09-10 타일 3종 철거), 같은 값을 묻는 컨트롤을
 * 둘 두면 어느 쪽으로 걸었는지에 따라 화면이 다른 곳에서 답한다.
 */
export function FundSummaryPanel({
  keyword,
  filters,
  mineUserId,
  listTotal,
  listIsPlaceholderData = false,
}: FundSummaryPanelProps) {
  // 지표는 지금 목록에 선 그대로를 답해야 하므로 필터를 전부 건 집계를 쓴다.
  const { data, isPending, isPlaceholderData } = useFundListTotals(keyword, filters, mineUserId)
  const lastWarning = useRef<string | null>(null)

  useEffect(() => {
    if (
      !import.meta.env.DEV ||
      !data ||
      listTotal === undefined ||
      listIsPlaceholderData ||
      isPlaceholderData
    )
      return

    if (listTotal === data.fundCount) {
      lastWarning.current = null
      return
    }

    const warningKey = `${listTotal}:${data.fundCount}`
    if (lastWarning.current === warningKey) return
    lastWarning.current = warningKey
    console.warn(
      `[FUND] 요약 지표와 목록 건수가 다릅니다(목록 ${listTotal} / 지표 ${data.fundCount}).`,
    )
  }, [data, isPlaceholderData, listIsPlaceholderData, listTotal])

  if (isPending) {
    return (
      <Card title="펀드 현황">
        <Skeleton className="h-[7.5rem] w-full rounded-radius-lg" />
      </Card>
    )
  }
  if (!data) return null

  const base = data.totalCommitment
  const tiles: FundTile[] = [
    {
      key: 'total', title: '운용펀드', eyebrow: '펀드 구성',
      value: data.fundCount, unit: '개', tone: 'primary', icon: Layers3,
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
        className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5"
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
