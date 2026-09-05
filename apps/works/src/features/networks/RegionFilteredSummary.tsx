import { useMemo } from 'react'
import { CircleDashed, Flag, Globe2, Layers, MapPin } from 'lucide-react'
import { Card, Skeleton, SummaryTile, type SummaryTileTone } from '@ynarcher/ui'
import { useTags } from '@/features/admin/hooks'
import { REGION_TAG_TABLE } from '@/features/networks/config'
import { domesticRegionIds, useCountryOptions } from '@/features/networks/countryOptions'
import { FACET_UNSET, useNetworkFacetCounts } from '@/features/networks/facetHooks'
import type { NetworkFilterState, NetworkSearchScope } from '@/features/networks/filters'
import type { NetworkListScope } from '@/features/networks/hooks'
import { toggleAxisValue } from '@/lib/filterAxis'

/** 권역 타일 색 — 국내(blue)·해외(cyan)와 겹치지 않는 7색을 권역 수만큼 둔다. */
const REGION_TONES: SummaryTileTone[] = [
  'purple', 'amber', 'peach', 'rose', 'lime', 'mint', 'orchid',
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
 * 타일은 넓은 것부터 좁은 것으로 내려간다: 전체 → 국내 · 해외 → 권역 7종. '해외'는 별도
 * 축이 아니라 국내를 뺀 권역 전부를 한 번에 거는 단축키다(누르면 그 권역들이 함께 켜진다 —
 * 무엇이 걸렸는지 타일이 그대로 말한다).
 *
 * 권역 순서는 건수가 아니라 원장의 노출순위(sort_order)를 따른다. 카드가 상시로 서게 되면
 * 건수순은 필터를 만질 때마다 칸이 자리를 바꿔 같은 곳을 두 번 누르지 못하게 한다.
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
  const { data: countries } = useCountryOptions()

  const { domesticIds, overseasTags } = useMemo(() => {
    const domestic = domesticRegionIds(countries)
    return {
      domesticIds: domestic,
      overseasTags: (regionTags ?? []).filter((t) => !domestic.has(t.id)),
    }
  }, [countries, regionTags])

  if (isPending || !facets || !regionTags || !countries) {
    return <Card title="권역별 현황"><Skeleton className="h-[7.5rem] rounded-radius-lg" /></Card>
  }

  const countOf = (ids: Iterable<string>) => {
    let sum = 0
    for (const id of ids) sum += facets.region.get(id) ?? 0
    return sum
  }
  const overseasIds = overseasTags.map((t) => t.id)
  const selected = new Set(filters.regionIds)
  // '해외'는 국내를 뺀 권역이 빠짐없이 걸려 있을 때만 켜진 것으로 본다 — 그중 하나라도
  // 빠져 있으면 걸린 조건은 '해외'가 아니라 그 권역들이다.
  const overseasOn =
    overseasIds.length > 0 &&
    overseasIds.every((id) => selected.has(id)) &&
    ![...domesticIds].some((id) => selected.has(id))
  const domesticOn =
    domesticIds.size > 0 &&
    [...domesticIds].every((id) => selected.has(id)) &&
    !overseasIds.some((id) => selected.has(id))

  // 국가를 아직 모르는 옛 행. 0이면 세우지 않는다 — 누를 조건이 없는 칸이라, 남아 있다는
  // 사실을 말할 때만 뜻이 선다(신규 등록은 국가가 필수다).
  const unset = facets.region.get(FACET_UNSET) ?? 0

  return (
    <Card title="권역별 현황">
      <section aria-label="필터가 반영된 권역별 현황" className="grid grid-cols-[repeat(auto-fit,minmax(8rem,1fr))] gap-3">
        <SummaryTile
          title="전체"
          eyebrow="전체 지역"
          value={facets.regionTotal}
          unit="건"
          tone="primary"
          icon={<Layers aria-hidden className="size-[18px]" strokeWidth={1.8} />}
          onClick={() => onChangeRegions([])}
          selected={filters.regionIds.length === 0}
        />

        <SummaryTile
          title="국내"
          eyebrow="지역"
          value={countOf(domesticIds)}
          unit="건"
          tone="blue"
          icon={<Flag aria-hidden className="size-[18px]" strokeWidth={1.8} />}
          onClick={() => onChangeRegions(domesticOn ? [] : [...domesticIds])}
          selected={domesticOn}
        />

        <SummaryTile
          title="해외"
          eyebrow="지역"
          value={countOf(overseasIds)}
          unit="건"
          tone="cyan"
          icon={<Globe2 aria-hidden className="size-[18px]" strokeWidth={1.8} />}
          onClick={() => onChangeRegions(overseasOn ? [] : overseasIds)}
          selected={overseasOn}
        />

        {overseasTags.map((tag, index) => (
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
