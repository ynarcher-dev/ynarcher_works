import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { categoryLabel, NETWORK_TABLE } from '@/features/networks/config'

/**
 * 네트워크 원장에서 **사람을 찾는** 조회 하나.
 *
 * 회의록의 외부 참석자 모듈이 사용한다. 참석자 검색은 NETWORKS의 기존 인물을 찾는 기능이며,
 * STARTUP의 대표자·핵심인력을 NETWORKS에 미리 생성하거나 연결해야 한다는 뜻은 아니다.
 */

/** 검색 결과 1건(networks 원장에서 이름·소속으로 매칭된 인물). */
export interface NetworkPersonHit {
  id: string
  name: string
  affiliation: string | null
  /** 구분 라벨(전문가/투자사 등). 구분이 비어 있으면 빈 문자열. */
  categoryLabel: string
}

/**
 * PostgREST `.or()` 값에서 문법 제어문자(콤마·괄호)를 제거해 필터 파싱이 깨지지 않게 한다.
 * (startupPoolHooks·programsPoolHooks의 동일 처리와 맞춘다.)
 */
function sanitizeOrValue(v: string): string {
  return v.replace(/[(),]/g, ' ').trim()
}

/**
 * 이름·소속 부분일치로 상위 40건.
 *
 * 원장 통합(2026-09-04) 이전에는 구분마다 표가 있어 9개를 병렬 조회하고 결과를 합쳤다.
 * 지금은 한 번의 조회이며, 어느 구분인지는 행이 들고 오는 `category`가 답한다.
 * 접근 가능한 행만 돌아온다(원장 SELECT RLS).
 */
export function useNetworkPeopleSearch(keyword: string, enabled = true) {
  const kw = sanitizeOrValue(keyword)
  return useQuery({
    queryKey: ['networks', 'person-search', kw],
    enabled: enabled && kw.length >= 1,
    queryFn: async (): Promise<NetworkPersonHit[]> => {
      const { data, error } = await supabase
        .from(NETWORK_TABLE)
        .select('id, name, affiliation, category')
        .is('deleted_at', null)
        .is('merged_into_id', null)
        .or(`name.ilike.%${kw}%,affiliation.ilike.%${kw}%`)
        .order('name', { ascending: true })
        .limit(40)
      if (error) throw error
      return (
        (data ?? []) as {
          id: string
          name: string
          affiliation: string | null
          category: string | null
        }[]
      ).map((r) => ({
        id: r.id,
        name: r.name,
        affiliation: r.affiliation ?? null,
        categoryLabel: categoryLabel(r.category),
      }))
    },
  })
}
