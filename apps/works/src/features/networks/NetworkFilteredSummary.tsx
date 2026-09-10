import {
  Building2,
  BriefcaseBusiness,
  CircleDashed,
  GraduationCap,
  Landmark,
  Network,
  Rocket,
  Shapes,
  Sparkles,
  UsersRound,
  UserRoundSearch,
} from 'lucide-react'
import { Card, Skeleton, SummaryTile, type SummaryTileTone } from '@ynarcher/ui'
import {
  CATEGORY_LABEL,
  CATEGORY_ORDER,
  CATEGORY_UNSET,
  type NetworkCategory,
} from '@/features/networks/config'
import { useNetworkFacetCounts } from '@/features/networks/facetHooks'
import type { NetworkFilterState, NetworkSearchScope } from '@/features/networks/filters'
import type { NetworkListScope } from '@/features/networks/hooks'

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

interface TileStyle {
  /** 타일 위 작은 줄. 구분 이름이 답하지 못하는 "무엇의 분야인가"를 한 마디로 얹는다. */
  eyebrow: string
  tone: SummaryTileTone
  icon: typeof Network
}

/**
 * 타일의 **꾸밈**만 여기서 갖는다 — 어떤 구분이 서는지와 그 순서·이름은 `config.ts`가 답한다.
 *
 * 종전에는 이 파일이 구분 목록을 통째로 손으로 들고 있었고, 그래서 구분이 하나 늘었을 때
 * (2026-09-10 `startup`) 폼·필터에는 서는데 이 카드에만 서지 않았다. 카드가 한 칸을 빠뜨리면
 * 그 행들은 '전체'에는 세어지면서 어느 타일에도 없어 **칸의 합이 전체와 어긋난다** — 그때
 * 어느 쪽이 사실인지 화면이 답하지 못한다.
 *
 * `Record<NetworkCategory, …>`라 구분을 늘리면 여기에 꾸밈을 적기 전까지 타입이 통과하지
 * 않는다. 목록이 둘인 것을 규율로 막지 않고 컴파일러가 막게 한다.
 */
const TILE_STYLE: Record<NetworkCategory, TileStyle> = {
  van: { eyebrow: '비즈니스', tone: 'blue', icon: Network },
  exp: { eyebrow: '전문가 그룹', tone: 'purple', icon: Sparkles },
  experts: { eyebrow: '전문 인력', tone: 'cyan', icon: UserRoundSearch },
  investors: { eyebrow: '투자 분야', tone: 'amber', icon: BriefcaseBusiness },
  // 스타트업은 기업(corporates)과 다른 것을 센다 — 저쪽은 조직, 이쪽은 그 기업을 이끄는 사람이다.
  startup: { eyebrow: '기업 인력', tone: 'orchid', icon: Rocket },
  corporates: { eyebrow: '기업 분야', tone: 'peach', icon: Building2 },
  institutions: { eyebrow: '지원 기관', tone: 'rose', icon: Landmark },
  universities: { eyebrow: '산학 분야', tone: 'lime', icon: GraduationCap },
  etc: { eyebrow: '기타 분류', tone: 'mint', icon: Shapes },
  // 은퇴 구분이라 타일로 서지 않는다(CATEGORY_ORDER에 없다). 값은 살아 있으므로 자리만 둔다.
  vendors: { eyebrow: '외주·거래', tone: 'slate', icon: Shapes },
}

type Tile = TileStyle & { key: NetworkCategory | typeof CATEGORY_UNSET; label: string }

const TILES: Tile[] = [
  ...CATEGORY_ORDER.map((key) => ({ key, label: CATEGORY_LABEL[key], ...TILE_STYLE[key] })),
  // 미지정은 구분이 아니라 구분이 비어 있는 상태다. 그래도 타일로 세우는 것은 이 칸이 곧
  // 채워 넣어야 할 일감의 크기이고, 전용 메뉴를 접은 뒤(2026-09-04) 그 크기가 보이는 자리가
  // 여기이기 때문이다. 톤은 채도 없는 회색이다 — 분류가 아니라 빈자리라고 색이 먼저 말한다.
  { key: CATEGORY_UNSET, label: '미지정', eyebrow: '구분 없음', tone: 'slate', icon: CircleDashed },
]

/**
 * 구분별 구성 현황. 타일이 곧 구분 필터이므로 집계에서는 구분 축만 뺀다 —
 * 권역·국가·영역 등 다른 축은 그대로 반영되어야 "지금 보고 있는 목록의 구성"이 된다.
 * '전체'는 미지정까지 포함한 수다 — 목록이 원장 전부를 담으므로 분모도 전부여야 한다.
 *
 * 단위는 '건'이다. 원장 하나에 사람(전문가·BAN)과 조직(기업·기관·대학)이 함께 살아
 * '명'으로는 절반이 틀리고, 바로 위 권역별 현황과 같은 모집단을 세면서 단위만 달라진다.
 */
export function NetworkFilteredSummary({
  scope,
  keyword,
  filters,
  searchScope,
  onToggleCategory,
  onClearCategories,
}: NetworkFilteredSummaryProps) {
  const { data, isPending } = useNetworkFacetCounts(scope, keyword, filters, searchScope)

  if (isPending || !data) {
    return <Card title="구성 현황"><Skeleton className="h-[7.5rem] rounded-radius-lg" /></Card>
  }

  return (
    <Card title="구성 현황">
      <section aria-label="필터가 반영된 구성 현황" className="grid grid-cols-[repeat(auto-fit,minmax(8rem,1fr))] gap-3">
        <SummaryTile
          title="전체"
          eyebrow="전체 구분"
          value={data.categoryTotal}
          unit="건"
          tone="primary"
          icon={<UsersRound aria-hidden className="size-[18px]" strokeWidth={1.8} />}
          onClick={onClearCategories}
          selected={filters.categories.length === 0}
        />
        {TILES.map((tile) => {
          const Icon = tile.icon
          return (
            <SummaryTile
              key={tile.key}
              title={tile.label}
              eyebrow={tile.eyebrow}
              value={data.category.get(tile.key) ?? 0}
              unit="건"
              tone={tile.tone}
              icon={<Icon aria-hidden className="size-[18px]" strokeWidth={1.8} />}
              onClick={() => onToggleCategory(tile.key)}
              selected={filters.categories.includes(tile.key)}
            />
          )
        })}
      </section>
    </Card>
  )
}
