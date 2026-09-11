import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { MinuteLink } from '@/features/office/minutes/minuteLinks'

/** STARTUP 원장이 직접 소유하는 대표자 검색 결과. 이메일·연락처는 이 경로로 읽지 않는다. */
export interface StartupRepresentativeHit {
  id: string
  companyName: string
  representative: string
}

/** PostgREST `.or()` 문법 제어문자가 검색식을 바꾸지 않게 제거한다. */
function sanitizeOrValue(value: string): string {
  return value.replace(/[(),]/g, ' ').trim()
}

/**
 * 기업명·대표자명으로 살아 있는 STARTUP 대표자를 찾는다.
 *
 * 접근 범위는 `startups` SELECT RLS가 결정한다. 대표자를 NETWORKS 인물로 복제하지 않으며,
 * 회의록 링크에는 STARTUP id만 저장한다. 따라서 이메일 중복이나 별도 사람 원장이 생기지 않는다.
 */
export function useStartupRepresentativeSearch(keyword: string, enabled = true) {
  const kw = sanitizeOrValue(keyword)
  return useQuery({
    queryKey: ['office', 'startup-representative-search', kw],
    enabled: enabled && kw.length >= 1,
    queryFn: async (): Promise<StartupRepresentativeHit[]> => {
      const { data, error } = await supabase
        .from('startups')
        .select('id, name, representative')
        .is('deleted_at', null)
        .is('merged_into_id', null)
        .not('representative', 'is', null)
        .neq('representative', '')
        .or(`name.ilike.%${kw}%,representative.ilike.%${kw}%`)
        .order('name', { ascending: true })
        .limit(40)
      if (error) throw error

      return (
        (data ?? []) as { id: string; name: string; representative: string | null }[]
      )
        .map((row) => ({
          id: row.id,
          companyName: row.name,
          representative: row.representative?.trim() ?? '',
        }))
        .filter((row) => row.representative.length > 0)
    },
  })
}

/** STARTUP 대표자 → 회의록 외부 참석자 링크. 개인 ID 대신 기업 원장을 참조한다. */
export function toStartupRepresentativeLink(hit: StartupRepresentativeHit): MinuteLink {
  return {
    targetType: 'startup',
    targetId: hit.id,
    role: 'EXTERNAL_ATTENDEE',
    label: hit.representative,
    code: hit.companyName,
  }
}
