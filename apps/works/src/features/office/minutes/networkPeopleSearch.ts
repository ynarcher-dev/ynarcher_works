import { useQuery } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { DIRECTORY_ENTITIES, ENTITIES, type EntityKey } from '@/features/networks/config'

/** 입력값을 지연시켜 반환한다 — 매 키 입력마다 원장 9종을 병렬 조회하지 않도록 검색어를 눅인다. */
export function useDebounced<T>(value: T, delay = 250): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(t)
  }, [value, delay])
  return debounced
}

/** 외부 참석자 검색 결과 1건(networks 원장에서 이름·소속으로 매칭된 인물). */
export interface NetworkPersonHit {
  /** 원장 테이블(= EntityKey). 상세 이동·구분 라벨 판정의 기준. */
  entityTable: EntityKey
  id: string
  name: string
  affiliation: string | null
  /** 구분 라벨(원장 테이블 기준 — 전문가/투자사/기관 등). */
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
 * 외부 참석자 지정용 networks 인물 검색 — 디렉토리 원장(DIRECTORY_ENTITIES)을 이름·소속으로
 * 동시에 검색한다. 통합 검색 RPC가 없어 원장별로 병렬 조회하며(각 원장 SELECT RLS로 접근 가능한
 * 행만 반환), 이름·소속 부분일치 결과를 이름순으로 합쳐 상위 40건을 돌려준다.
 *
 * 회의록 외부 참석자는 문자열 명단이므로(영구 FK 아님), 여기서 고른 인물은 '이름/소속' 표기로
 * 명단에 담긴다 — 이 훅은 그 표기를 채우기 위한 검색 편의일 뿐이다.
 */
export function useNetworkPeopleSearch(keyword: string, enabled = true) {
  const kw = sanitizeOrValue(keyword)
  return useQuery({
    queryKey: ['office', 'minute-external-people', kw],
    enabled: enabled && kw.length >= 1,
    queryFn: async (): Promise<NetworkPersonHit[]> => {
      const perTable = await Promise.all(
        DIRECTORY_ENTITIES.map(async (table) => {
          const { data, error } = await supabase
            .from(table)
            .select('id, name, affiliation')
            .is('deleted_at', null)
            .is('merged_into_id', null)
            .or(`name.ilike.%${kw}%,affiliation.ilike.%${kw}%`)
            .order('name', { ascending: true })
            .limit(8)
          if (error) throw error
          return ((data ?? []) as { id: string; name: string; affiliation: string | null }[]).map(
            (r): NetworkPersonHit => ({
              entityTable: table,
              id: r.id,
              name: r.name,
              affiliation: r.affiliation ?? null,
              categoryLabel: ENTITIES[table].label,
            }),
          )
        }),
      )
      return perTable
        .flat()
        .sort((a, b) => a.name.localeCompare(b.name, 'ko'))
        .slice(0, 40)
    },
  })
}
