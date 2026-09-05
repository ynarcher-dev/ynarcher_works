import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import {
  startupFilterArgs,
  type StartupPoolFilters,
  type StartupSearchScope,
} from '@/features/startup/startupPoolHooks'

/**
 * 구분·권역이 비어 있는 행이 모이는 키. 서버가 같은 문자열을 내려주며,
 * 두 축의 '미지정' 타일이 이 키로 건수를 읽고 필터로도 이 축을 건다.
 */
export const FACET_UNSET = 'UNSET'

/** 축별 집계. 구분 키는 구분 코드(sourced·incubated·invested·other), 권역 키는 권역 태그 id다. */
export interface StartupFacetCounts {
  category: Map<string, number>
  region: Map<string, number>
  /**
   * 축별 합 — 그 카드의 '전체' 타일이 쓰는 수다. 두 축은 서로의 조건을 빼고 세므로
   * 구분·권역이 둘 다 걸려 있으면 합이 다르다(구분 축의 합은 '구분을 풀었을 때',
   * 권역 축의 합은 '권역을 풀었을 때'의 수다). 한 값으로 합치면 한쪽 카드가 자기 것이
   * 아닌 수를 말한다.
   */
  categoryTotal: number
  regionTotal: number
}

/**
 * 기업 목록 요약 카드(기업 현황·권역별 현황)의 집계.
 *
 * 두 카드가 **같은 훅을 부르고 캐시 키도 같아** 요청은 한 번만 나간다. 종전 구분 카드는
 * 타일마다 목록 조회를 한 번씩(5회) 쐈고, 같은 방식으로 두 줄(약 15칸)을 세우면 요약만으로
 * 열댓 번을 호출하게 된다.
 *
 * 축마다 자기 조건을 빼고 세는 일은 서버(startup_facet_counts)가 한다. 여기서 다시 빼면
 * 같은 규칙이 두 곳에 살게 되고, 어긋났을 때 어느 쪽이 사실인지 판정할 근거가 없다.
 */
export function useStartupFacetCounts(
  keyword: string,
  filters: StartupPoolFilters,
  mineUserId: string | null | undefined,
  searchScope: StartupSearchScope,
) {
  // 필터 객체는 매 렌더 새로 만들어지므로 값으로 직렬화해 캐시 키를 안정시킨다.
  const filtersKey = JSON.stringify(filters)
  const scopeKey = JSON.stringify(searchScope)
  return useQuery({
    queryKey: ['startups', 'pool', 'facets', keyword, filtersKey, mineUserId ?? null, scopeKey],
    queryFn: async (): Promise<StartupFacetCounts> => {
      const { data, error } = await supabase.rpc(
        'startup_facet_counts',
        startupFilterArgs(keyword, filters, mineUserId, searchScope),
      )
      if (error) throw error

      const category = new Map<string, number>()
      const region = new Map<string, number>()
      for (const row of (data ?? []) as { axis: string; key: string; cnt: number | string }[]) {
        const target = row.axis === 'category' ? category : region
        target.set(row.key, Number(row.cnt))
      }
      const sum = (m: Map<string, number>) => [...m.values()].reduce((a, b) => a + b, 0)
      return { category, region, categoryTotal: sum(category), regionTotal: sum(region) }
    },
  })
}
