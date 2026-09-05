import { CircleDashed, Layers, MapPin } from 'lucide-react'
import { Card, Skeleton, SummaryTile, type SummaryTileTone } from '@ynarcher/ui'
import { useTags } from '@/features/admin/hooks'
import { REGION_TAG_TABLE } from '@/features/networks/config'
import { FACET_UNSET, useNetworkFacetCounts } from '@/features/networks/facetHooks'
import type { NetworkFilterState, NetworkSearchScope } from '@/features/networks/filters'
import type { NetworkListScope } from '@/features/networks/hooks'
import { toggleAxisValue } from '@/lib/filterAxis'

/** 권역 타일 색. 권역 수만큼 돌려 쓰며 순서가 곧 색이라 같은 칸은 늘 같은 색이다. */
const REGION_TONES: SummaryTileTone[] = [
  'blue', 'purple', 'cyan', 'amber', 'peach', 'rose', 'lime', 'mint', 'orchid',
]

interface Props {
  scope: NetworkListScope
  keyword: string
  filters: NetworkFilterState
  searchScope: NetworkSearchScope
  /** 권역 조건 교체. 값은 목록 필터와 같은 태그 id 배열이다. */
  onChangeRegions: (next: string[]) => void
}

/**
 * 권역별 현황 — 목록 위에 상시로 선다(2026-09-05).
 *
 * 종전에는 지역을 해외로 좁혔을 때만 세웠다. 국내 행에 권역이 없던 시절의 규칙인데,
 * 2026-09-04 통합에서 '국내'가 권역 태그 한 줄이 되면서 근거가 사라졌다 — 국내도 자기
 * 칸에 서므로 섞어 세도 '미지정'이 최대 칸이 되지 않는다.
 *
 * 그래서 이 카드가 **지역 축을 통째로 소유한다.** 필터 줄의 '지역'(국내/해외) 칩은 이 카드의
 * 부분집합이라 함께 걷었다 — 같은 물음을 두 컨트롤이 답하면 엇갈리게 걸 수 있고(지역=국내 +
 * 권역=중동) 그때 결과가 빈 이유가 화면 어디에도 보이지 않는다.
 *
 * **타일은 전체 하나와 권역들뿐이다.** 국내·해외를 묶는 중간 칸을 두지 않는 이유는 국내가
 * 이미 권역 한 줄이어서다 — 한 축에 '묶음'과 '낱개'가 섞여 서면 같은 줄의 칸들이 서로 다른
 * 크기의 것을 세게 되고, 무엇을 눌러야 무엇이 걸리는지가 칸마다 달라진다.
 *
 * 권역 순서는 건수가 아니라 원장의 노출순위(sort_order)를 따른다. 카드가 상시로 서게 되면
 * 건수순은 필터를 만질 때마다 칸이 자리를 바꿔 같은 곳을 두 번 누르지 못하게 한다.
 * 국내가 맨 앞에 서는 것도 그 순위(0)가 정한 것이지 화면이 특별 취급한 결과가 아니다.
 */
export function RegionFilteredSummary({
  scope,
  keyword,
  filters,
  searchScope,
  onChangeRegions,
}: Props) {
  const { data: facets, isPending } = useNetworkFacetCounts(scope, keyword, filters, searchScope)
  const { data: regionTags } = useTags(REGION_TAG_TABLE)

  if (isPending || !facets || !regionTags) {
    return <Card title="권역별 현황"><Skeleton className="h-[7.5rem] rounded-radius-lg" /></Card>
  }

  const selected = new Set(filters.regionIds)
  // 국가를 아직 모르는 옛 행. 0이면 세우지 않는다 — 누를 조건이 없는 칸이라, 남아 있다는
  // 사실을 말할 때만 뜻이 선다(신규 등록은 국가가 필수다).
  const unset = facets.region.get(FACET_UNSET) ?? 0

  return (
    <Card title="권역별 현황">
      <section aria-label="필터가 반영된 권역별 현황" className="grid grid-cols-[repeat(auto-fit,minmax(8rem,1fr))] gap-3">
        <SummaryTile
          title="전체"
          eyebrow="전체 권역"
          value={facets.regionTotal}
          unit="건"
          tone="primary"
          icon={<Layers aria-hidden className="size-[18px]" strokeWidth={1.8} />}
          onClick={() => onChangeRegions([])}
          selected={filters.regionIds.length === 0}
        />

        {regionTags.map((tag, index) => (
          <SummaryTile
            key={tag.id}
            title={tag.name}
            eyebrow="권역"
            value={facets.region.get(tag.id) ?? 0}
            unit="건"
            tone={REGION_TONES[index % REGION_TONES.length]}
            icon={<MapPin aria-hidden className="size-[18px]" strokeWidth={1.8} />}
            onClick={() => onChangeRegions(toggleAxisValue(filters.regionIds, tag.id))}
            selected={selected.has(tag.id)}
          />
        ))}

        {unset > 0 && (
          <SummaryTile
            title="미지정"
            eyebrow="국가 없음"
            value={unset}
            unit="건"
            tone="slate"
            icon={<CircleDashed aria-hidden className="size-[18px]" strokeWidth={1.8} />}
          />
        )}
      </section>
    </Card>
  )
}
