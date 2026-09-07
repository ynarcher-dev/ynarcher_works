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
  /**
   * 권역 축 교체. 이 카드가 축 하나를 통째로 소유하므로 두 값을 함께 넘긴다 —
   * 고른 권역들(태그 id)과 '미지정'(국가를 아직 모르는 행) 여부다. 따로 넘기면
   * '전체'를 누를 때 한쪽만 비우는 실수가 호출부마다 생긴다.
   */
  onChangeRegionAxis: (next: { regionIds: string[]; countryUnset: boolean }) => void
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
 * **타일은 전체 하나와 권역들, 그리고 미지정이다.** 국내·해외를 묶는 중간 칸은 두지 않는다 —
 * 국내가 이미 권역 한 줄이어서, 한 축에 '묶음'과 '낱개'가 섞여 서면 같은 줄의 칸들이 서로
 * 다른 크기의 것을 세게 되고 무엇을 눌러야 무엇이 걸리는지가 칸마다 달라진다.
 *
 * **미지정 칸은 늘 서고 눌린다(2026-09-07).** 종전에는 건수가 0보다 클 때만 세우고 누르지도
 * 못했는데, 그러면 같은 줄에서 이 칸만 다른 것이 된다 — 옆 칸은 필터인데 이 칸은 표시였고,
 * 어느 날 0이 되면 칸 자체가 사라져 자리를 기억할 수도 없었다. **타일은 곧 필터**이고 한 축에
 * 칸의 성격은 하나여야 한다(STARTUP 요약 카드가 먼저 정한 규칙). 0건이어도 세우는 것은 그
 * 자체로 사실을 말한다 — 채워 넣을 것이 남지 않았다는 뜻이다.
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
  onChangeRegionAxis,
}: Props) {
  const { data: facets, isPending } = useNetworkFacetCounts(scope, keyword, filters, searchScope)
  const { data: regionTags } = useTags(REGION_TAG_TABLE)

  if (isPending || !facets || !regionTags) {
    return <Card title="권역별 현황"><Skeleton className="h-[7.5rem] rounded-radius-lg" /></Card>
  }

  const selected = new Set(filters.regionIds)
  // 국가를 아직 모르는 행. 0이어도 세운다 — 이 칸은 표시가 아니라 필터다.
  const unset = facets.region.get(FACET_UNSET) ?? 0
  const axisEmpty = filters.regionIds.length === 0 && !filters.countryUnset

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
          onClick={() => onChangeRegionAxis({ regionIds: [], countryUnset: false })}
          selected={axisEmpty}
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
            onClick={() =>
              onChangeRegionAxis({
                regionIds: toggleAxisValue(filters.regionIds, tag.id),
                // 권역을 고르는 것과 '국가가 없는 행만'은 함께 설 수 없다 — 겹쳐 걸면
                // 결과가 늘 0이고, 화면은 왜 비었는지 답하지 못한다.
                countryUnset: false,
              })
            }
            selected={selected.has(tag.id)}
          />
        ))}

        <SummaryTile
          title="미지정"
          eyebrow="국가 없음"
          value={unset}
          unit="건"
          tone="slate"
          icon={<CircleDashed aria-hidden className="size-[18px]" strokeWidth={1.8} />}
          onClick={() =>
            onChangeRegionAxis({ regionIds: [], countryUnset: !filters.countryUnset })
          }
          selected={filters.countryUnset}
        />
      </section>
    </Card>
  )
}
