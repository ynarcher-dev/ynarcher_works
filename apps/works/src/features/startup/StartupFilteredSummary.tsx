import { Building2, HandCoins, Search, Shapes, Sprout } from 'lucide-react'
import { Card, Skeleton, SummaryTile, type SummaryTileTone } from '@ynarcher/ui'
import {
  useStartupPoolPage,
  type StartupPoolFilters,
  type StartupSearchScope,
} from '@/features/startup/startupPoolHooks'

interface StartupFilteredSummaryProps {
  keyword: string
  filters: StartupPoolFilters
  mineUserId?: string | null
  searchScope: StartupSearchScope
  /** 구분 타일 토글(다중선택). 타일이 곧 구분 필터다. */
  onToggleCategory: (category: string) => void
  /** '전체기업' 타일 — 구분 조건을 푸는 문. */
  onClearCategories: () => void
}

const TILES: {
  key: string
  status: string | null
  label: string
  eyebrow: string
  tone: SummaryTileTone
  icon: typeof Building2
}[] = [
  { key: 'total', status: null, label: '전체기업', eyebrow: '스타트업 DB', tone: 'primary', icon: Building2 },
  { key: 'sourced', status: 'sourced', label: '발굴기업', eyebrow: '발굴 및 검토', tone: 'amber', icon: Search },
  { key: 'incubated', status: 'incubated', label: '보육기업', eyebrow: '육성 및 지원', tone: 'mint', icon: Sprout },
  { key: 'invested', status: 'invested', label: '투자기업', eyebrow: '투자 포트폴리오', tone: 'purple', icon: HandCoins },
  { key: 'other', status: 'other', label: '기타기업', eyebrow: '기타 분류', tone: 'rose', icon: Shapes },
]

export function StartupFilteredSummary({
  keyword,
  filters,
  mineUserId,
  searchScope,
  onToggleCategory,
  onClearCategories,
}: StartupFilteredSummaryProps) {
  const withoutCategory = { ...filters, categories: [] }
  const total = useStartupPoolPage(keyword, withoutCategory, 0, 1, mineUserId, searchScope)
  const sourced = useStartupPoolPage(keyword, { ...withoutCategory, categories: ['sourced'] }, 0, 1, mineUserId, searchScope)
  const incubated = useStartupPoolPage(keyword, { ...withoutCategory, categories: ['incubated'] }, 0, 1, mineUserId, searchScope)
  const invested = useStartupPoolPage(keyword, { ...withoutCategory, categories: ['invested'] }, 0, 1, mineUserId, searchScope)
  const other = useStartupPoolPage(keyword, { ...withoutCategory, categories: ['other'] }, 0, 1, mineUserId, searchScope)
  const queries = { total, sourced, incubated, invested, other }

  if (Object.values(queries).some((query) => query.isPending)) {
    return <Card title="기업 현황"><Skeleton className="h-[7.5rem] rounded-radius-lg" /></Card>
  }

  return (
    <Card title="기업 현황">
      <section aria-label="필터가 반영된 스타트업 현황" className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {TILES.map((tile) => {
          const Icon = tile.icon
          return (
            <SummaryTile
              key={tile.key}
              title={tile.label}
              eyebrow={tile.eyebrow}
              value={queries[tile.key as keyof typeof queries].data?.total ?? 0}
              unit="개사"
              tone={tile.tone}
              icon={<Icon aria-hidden className="size-[18px]" strokeWidth={1.8} />}
              // 타일은 곧 구분 필터다. 집계에서 구분 축을 뺀 이유(withoutCategory)도 여기에 있다 —
              // 지금 걸린 구분으로 다시 세면 고르지 않은 타일이 전부 0이 되어 누를 수가 없다.
              onClick={tile.status ? () => onToggleCategory(tile.status as string) : onClearCategories}
              selected={
                tile.status ? filters.categories.includes(tile.status) : filters.categories.length === 0
              }
            />
          )
        })}
      </section>
    </Card>
  )
}
