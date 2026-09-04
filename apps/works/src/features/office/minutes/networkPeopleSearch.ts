import { useQuery } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { categoryLabel, NETWORK_TABLE, NETWORK_TARGET_TYPE } from '@/features/networks/config'
import type { MinuteLink } from '@/features/office/minutes/minuteLinks'

/** 입력값을 지연시켜 반환한다 — 매 키 입력마다 원장을 조회하지 않도록 검색어를 눅인다. */
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
  id: string
  name: string
  affiliation: string | null
  /** 구분 라벨(전문가/투자사/기관 등). 구분이 비어 있으면 빈 문자열. */
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
 * 외부 참석자 지정용 networks 인물 검색 — 이름·소속 부분일치로 상위 40건.
 *
 * 원장 통합(2026-09-04) 이전에는 구분마다 표가 있어 9개를 병렬 조회하고 결과를 합쳤다.
 * 지금은 한 번의 조회이며, 어느 구분인지는 행이 들고 오는 `category`가 답한다.
 * 접근 가능한 행만 돌아온다(원장 SELECT RLS).
 */
export function useNetworkPeopleSearch(keyword: string, enabled = true) {
  const kw = sanitizeOrValue(keyword)
  return useQuery({
    queryKey: ['office', 'minute-external-people', kw],
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
 * 검색 결과 1건 → 회의록이 저장할 상호참조.
 *
 * 이 변환이 있어야 하는 이유가 곧 2026-09-03 변경의 요지다 — 종전에는 여기서 '이름/소속'
 * 문자열만 뽑아 명단에 담았고, 그 순간 어느 레코드에서 온 사람인지가 사라졌다.
 */
export function toExternalPersonLink(hit: NetworkPersonHit): MinuteLink {
  return {
    targetType: NETWORK_TARGET_TYPE,
    targetId: hit.id,
    role: 'EXTERNAL_ATTENDEE',
    label: hit.name,
    code: hit.affiliation,
  }
}
