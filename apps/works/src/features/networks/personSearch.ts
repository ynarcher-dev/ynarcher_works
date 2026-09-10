import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { categoryLabel, NETWORK_TABLE } from '@/features/networks/config'

/**
 * 네트워크 원장에서 **사람을 찾는** 조회 하나.
 *
 * 종전 자리는 회의록의 외부 참석자 모듈이었다. 2026-09-10에 스타트업 폼의 대표자·핵심인력이
 * 같은 사람을 가리키게 되면서 소비자가 둘이 됐고, 그 순간 이 조회는 어느 화면의 것도 아니게
 * 됐다 — 복사했으면 한쪽만 조건이 바뀌는 날이 오고 두 화면이 같은 이름에 다른 답을 낸다.
 */

/** 검색 결과 1건(networks 원장에서 이름·소속으로 매칭된 인물). */
export interface NetworkPersonHit {
  id: string
  name: string
  affiliation: string | null
  /** 구분 라벨(전문가/투자사/스타트업 등). 구분이 비어 있으면 빈 문자열. */
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

/**
 * 이름 **정확히 일치**로 원장을 되묻는다 — 여러 이름을 한 번에(2026-09-10).
 *
 * 위 검색과 갈리는 지점은 부분일치가 아니라는 것이다. 이 조회의 쓰임은 사람이 타이핑하며
 * 후보를 좁히는 자리가 아니라 **AI 초안이 데려온 이름들을 원장에 대조하는 자리**이고, 거기서
 * `홍길`이 `홍길동`을 물어 오면 그것은 후보가 아니라 오답이다.
 *
 * 한 번에 묻는 이유는 훅 규칙이다 — 사람마다 훅을 부를 수 없으므로(목록 길이가 매번 다르다)
 * 이름 배열 하나로 묻고 결과를 이름별로 나눈다. 동명이인은 그 나눔에서 여러 줄로 남으며,
 * **여럿이면 자동으로 고르지 않는다**(그것이 이 대조의 유일한 위험 지점이다).
 */
export function useNetworkPeopleByNames(names: string[], enabled = true) {
  const list = [...new Set(names.map((n) => n.trim()).filter(Boolean))].sort()
  return useQuery({
    queryKey: ['networks', 'person-by-names', list],
    enabled: enabled && list.length > 0,
    queryFn: async (): Promise<NetworkPersonHit[]> => {
      const { data, error } = await supabase
        .from(NETWORK_TABLE)
        .select('id, name, affiliation, category')
        .is('deleted_at', null)
        .is('merged_into_id', null)
        .in('name', list)
        .order('name', { ascending: true })
        .limit(200)
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
