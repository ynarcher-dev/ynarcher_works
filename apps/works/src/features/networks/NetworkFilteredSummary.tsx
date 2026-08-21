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
import type { EntityKey } from '@/features/networks/config'
import type { NetworkListFilterState, NetworkSearchScope } from '@/features/networks/filters'
import { useNetworkListPage, type NetworkListScope } from '@/features/networks/hooks'

interface NetworkFilteredSummaryProps {
  scope: NetworkListScope
  keyword: string
  filters: NetworkListFilterState
  searchScope: NetworkSearchScope
}

const TILES: {
  key: EntityKey | 'total'
  label: string
  eyebrow: string
  tone: SummaryTileTone
  icon: typeof Network
}[] = [
  { key: 'total', label: '전체', eyebrow: '국내 전체', tone: 'primary', icon: UsersRound },
  { key: 'van', label: 'BAN', eyebrow: '비즈니스', tone: 'blue', icon: Network },
  { key: 'exp', label: 'EXP', eyebrow: '전문가 그룹', tone: 'purple', icon: Sparkles },
  { key: 'experts', label: '전문가', eyebrow: '전문 인력', tone: 'cyan', icon: UserRoundSearch },
  { key: 'investors', label: '투자자', eyebrow: '투자 분야', tone: 'amber', icon: BriefcaseBusiness },
  { key: 'corporates', label: '기업', eyebrow: '기업 분야', tone: 'peach', icon: Building2 },
  { key: 'institutions', label: '기관', eyebrow: '지원 기관', tone: 'rose', icon: Landmark },
  { key: 'universities', label: '대학', eyebrow: '산학 분야', tone: 'lime', icon: GraduationCap },
  { key: 'etc', label: '기타', eyebrow: '기타 분류', tone: 'mint', icon: Shapes },
]

export function NetworkFilteredSummary({ scope, keyword, filters, searchScope }: NetworkFilteredSummaryProps) {
  const withoutEntity = { ...filters, entities: [] }
  const total = useNetworkListPage(scope, keyword, 0, 1, withoutEntity, searchScope)
  const van = useNetworkListPage(scope, keyword, 0, 1, { ...withoutEntity, entities: ['van'] }, searchScope)
  const exp = useNetworkListPage(scope, keyword, 0, 1, { ...withoutEntity, entities: ['exp'] }, searchScope)
  const experts = useNetworkListPage(scope, keyword, 0, 1, { ...withoutEntity, entities: ['experts'] }, searchScope)
  const investors = useNetworkListPage(scope, keyword, 0, 1, { ...withoutEntity, entities: ['investors'] }, searchScope)
  const corporates = useNetworkListPage(scope, keyword, 0, 1, { ...withoutEntity, entities: ['corporates'] }, searchScope)
  const institutions = useNetworkListPage(scope, keyword, 0, 1, { ...withoutEntity, entities: ['institutions'] }, searchScope)
  const universities = useNetworkListPage(scope, keyword, 0, 1, { ...withoutEntity, entities: ['universities'] }, searchScope)
  const etc = useNetworkListPage(scope, keyword, 0, 1, { ...withoutEntity, entities: ['etc'] }, searchScope)
  const queries = { total, van, exp, experts, investors, corporates, institutions, universities, etc }

  if (Object.values(queries).some((query) => query.isPending)) {
    return <Card title="구성 현황"><Skeleton className="h-[7.5rem] rounded-radius-lg" /></Card>
  }

  return (
    <Card title="구성 현황">
      <section aria-label="필터가 반영된 구성 현황" className="grid grid-cols-[repeat(auto-fit,minmax(8rem,1fr))] gap-3">
        {TILES.map((tile) => {
          const Icon = tile.icon
          return (
            <SummaryTile
              key={tile.key}
              title={tile.label}
              eyebrow={tile.eyebrow}
              value={queries[tile.key as keyof typeof queries].data?.total ?? 0}
              unit="명"
              tone={tile.tone}
              icon={<Icon aria-hidden className="size-[18px]" strokeWidth={1.8} />}
            />
          )
        })}
      </section>
    </Card>
  )
}
