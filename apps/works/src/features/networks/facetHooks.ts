import { useQuery } from '@tanstack/react-query'
import {
  categoryCodes,
  wantsUncategorized,
  type NetworkFilterState,
  type NetworkSearchScope,
} from '@/features/networks/filters'
import { rangeBound, type NetworkListScope } from '@/features/networks/hooks'
import { supabase } from '@/lib/supabase'

/**
 * 구분·권역이 비어 있는 행이 모이는 키. 서버가 같은 문자열을 내려주며, 구분 축에서는
 * 목록 필터의 '미지정'(CATEGORY_UNSET)과 같은 값이다.
 */
export const FACET_UNSET = 'UNSET'

/** 축별 집계. 키는 구분 코드 또는 권역 태그 id이고, 비어 있는 행은 FACET_UNSET에 모인다. */
export interface NetworkFacetCounts {
  category: Map<string, number>
  region: Map<string, number>
  /**
   * 축별 합 — 그 카드의 '전체' 타일이 쓰는 수다. 두 축은 서로의 조건을 빼고 세므로
   * 필터가 둘 다 걸려 있으면 합이 다르다(구분 축의 합은 '구분을 풀었을 때', 권역 축의 합은
   * '권역을 풀었을 때'의 수다). 한 값으로 합치면 한쪽 카드가 자기 것이 아닌 수를 말한다.
   */
  categoryTotal: number
  regionTotal: number
}

/**
 * 목록 요약 카드(구성 현황·권역별 현황)의 집계.
 *
 * 두 카드가 **같은 훅을 부르고 캐시 키도 같아** 요청은 한 번만 나간다. 종전에는 구성 현황이
 * 타일마다 목록 RPC를 한 번씩(10회), 권역별 현황이 행 5000개를 끌어와 클라이언트에서 셌다 —
 * 후자는 원장이 커지면 상한에 닿는 날 오류 없이 그냥 적게 센다.
 *
 * 축마다 자기 조건을 빼고 세는 일은 서버(network_facet_counts)가 한다. 여기서 다시 빼면
 * 같은 규칙이 두 곳에 살게 되고, 어긋났을 때 어느 쪽이 사실인지 판정할 근거가 없다.
 */
export function useNetworkFacetCounts(
  scope: NetworkListScope,
  keyword: string,
  filters: NetworkFilterState,
  searchScope: NetworkSearchScope,
) {
  // 필터 객체는 매 렌더 새로 만들어지므로 값으로 직렬화해 캐시 키를 안정시킨다.
  const filtersKey = JSON.stringify(filters)
  const scopeKey = JSON.stringify(searchScope)
  return useQuery({
    queryKey: ['networks', scope, 'facets', keyword, filtersKey, scopeKey],
    queryFn: async (): Promise<NetworkFacetCounts> => {
      const codes = categoryCodes(filters)
      const { data, error } = await supabase.rpc('network_facet_counts', {
        p_scope: scope,
        p_keyword: keyword.trim() || null,
        p_categories: codes.length ? codes : null,
        p_uncategorized: wantsUncategorized(filters) ? true : null,
        p_regions: filters.regionIds.length ? filters.regionIds : null,
        p_countries: filters.countryIds.length ? filters.countryIds : null,
        p_search_email: searchScope.email,
        p_search_phone: searchScope.phone,
        p_expertise: filters.expertise.length ? filters.expertise : null,
        // 둘 다 고르면 거르지 않은 것과 같다(전체) — 조건을 붙이지 않는다.
        p_match: filters.match.length === 1 ? filters.match[0] : null,
        p_activity_min: rangeBound(filters.activityMin),
        p_activity_max: rangeBound(filters.activityMax),
      })
      if (error) throw error

      const category = new Map<string, number>()
      const region = new Map<string, number>()
      for (const row of (data ?? []) as { axis: string; key: string; cnt: number | string }[]) {
        const target = row.axis === 'region' ? region : category
        target.set(row.key, Number(row.cnt))
      }
      const sum = (m: Map<string, number>) => [...m.values()].reduce((a, b) => a + b, 0)
      return { category, region, categoryTotal: sum(category), regionTotal: sum(region) }
    },
  })
}
