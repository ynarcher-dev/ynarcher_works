import {
  Building2,
  BriefcaseBusiness,
  GraduationCap,
  Landmark,
  Network,
  Shapes,
  Sparkles,
  UsersRound,
  UserRoundSearch,
} from 'lucide-react'
import { Card, Skeleton, SummaryTile, type SummaryTileTone } from '@ynarcher/ui'
import type { NetworkCategory } from '@/features/networks/config'
import type { NetworkFilterState, NetworkSearchScope } from '@/features/networks/filters'
import { useNetworkListPage, type NetworkListScope } from '@/features/networks/hooks'

interface NetworkFilteredSummaryProps {
  scope: NetworkListScope
  keyword: string
  filters: NetworkFilterState
  searchScope: NetworkSearchScope
  /** 구분 타일 토글(다중선택). 값은 구분 코드로 목록 필터와 같다. */
  onToggleCategory: (category: string) => void
  /** '전체' 타일 — 구분 조건을 푸는 문. */
  onClearCategories: () => void
}

const TILES: {
  key: NetworkCategory | 'total'
  label: string
  eyebrow: string
  tone: SummaryTileTone
  icon: typeof Network
}[] = [
  { key: 'total', label: '전체', eyebrow: '전체 구분', tone: 'primary', icon: UsersRound },
  { key: 'van', label: 'BAN', eyebrow: '비즈니스', tone: 'blue', icon: Network },
  { key: 'exp', label: 'EXP', eyebrow: '전문가 그룹', tone: 'purple', icon: Sparkles },
  { key: 'experts', label: '전문가', eyebrow: '전문 인력', tone: 'cyan', icon: UserRoundSearch },
  { key: 'investors', label: '투자사', eyebrow: '투자 분야', tone: 'amber', icon: BriefcaseBusiness },
  { key: 'corporates', label: '기업', eyebrow: '기업 분야', tone: 'peach', icon: Building2 },
  { key: 'institutions', label: '기관', eyebrow: '지원 기관', tone: 'rose', icon: Landmark },
  { key: 'universities', label: '대학', eyebrow: '산학 분야', tone: 'lime', icon: GraduationCap },
  { key: 'etc', label: '기타', eyebrow: '기타 분류', tone: 'mint', icon: Shapes },
]

/**
 * 구분별 구성 현황. 타일이 곧 구분 필터이므로 집계에서는 구분 축만 뺀다 —
 * 지역·권역·영역 등 다른 축은 그대로 반영되어야 "지금 보고 있는 목록의 구성"이 된다.
 */
export function NetworkFilteredSummary({
  scope,
  keyword,
  filters,
  searchScope,
  onToggleCategory,
  onClearCategories,
}: NetworkFilteredSummaryProps) {
  const base = { ...filters, categories: [] }
  const one = (category: NetworkCategory) => ({ ...base, categories: [category] })
  const total = useNetworkListPage(scope, keyword, 0, 1, base, searchScope)
  const van = useNetworkListPage(scope, keyword, 0, 1, one('van'), searchScope)
  const exp = useNetworkListPage(scope, keyword, 0, 1, one('exp'), searchScope)
  const experts = useNetworkListPage(scope, keyword, 0, 1, one('experts'), searchScope)
  const investors = useNetworkListPage(scope, keyword, 0, 1, one('investors'), searchScope)
  const corporates = useNetworkListPage(scope, keyword, 0, 1, one('corporates'), searchScope)
  const institutions = useNetworkListPage(scope, keyword, 0, 1, one('institutions'), searchScope)
  const universities = useNetworkListPage(scope, keyword, 0, 1, one('universities'), searchScope)
  const etc = useNetworkListPage(scope, keyword, 0, 1, one('etc'), searchScope)
  const queries = { total, van, exp, experts, investors, corporates, institutions, universities, etc }

  if (Object.values(queries).some((query) => query.isPending)) {
    return <Card title="구성 현황"><Skeleton className="h-[7.5rem] rounded-radius-lg" /></Card>
  }

  return (
    <Card title="구성 현황">
      <section aria-label="필터가 반영된 구성 현황" className="grid grid-cols-[repeat(auto-fit,minmax(8rem,1fr))] gap-3">
        {TILES.map((tile) => {
          const Icon = tile.icon
          const isTotal = tile.key === 'total'
          return (
            <SummaryTile
              key={tile.key}
              title={tile.label}
              eyebrow={tile.eyebrow}
              value={queries[tile.key as keyof typeof queries].data?.total ?? 0}
              unit="명"
              tone={tile.tone}
              icon={<Icon aria-hidden className="size-[18px]" strokeWidth={1.8} />}
              onClick={isTotal ? onClearCategories : () => onToggleCategory(tile.key)}
              selected={
                isTotal ? filters.categories.length === 0 : filters.categories.includes(tile.key)
              }
            />
          )
        })}
      </section>
    </Card>
  )
}
