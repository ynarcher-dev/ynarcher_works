import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import {
  MINUTE_LINK_TARGETS,
  type MinuteLinkTargetType,
} from '@/features/office/minutes/minuteLinks'

/**
 * 연동 대상 검색 — 선택한 종류의 원장을 제목/코드로 ilike 조회한다.
 * 원장 SELECT RLS가 요청자에게 접근 가능한 행만 돌려주므로("접근 가능 대상만 연동" 결정),
 * 검색 결과 자체가 접근 가능 집합이다. 서버측 최종 강제는 set_minute_links RPC가 별도로 한다.
 */
export interface MinuteLinkCandidate {
  targetType: MinuteLinkTargetType
  targetId: string
  label: string
  code: string | null
}

/** PostgREST .or() 필터를 깨뜨리는 문자를 제거한다(쉼표·괄호·%). */
function sanitize(kw: string): string {
  return kw.replace(/[,()%]/g, ' ').trim()
}

/**
 * 종류별 원장 검색(최대 20건, 제목순). keyword가 비면 최근 등록순 상위 20건을 후보로 보인다.
 * enabled=false면 질의하지 않는다(종류 미선택 시).
 */
export function useMinuteLinkSearch(
  targetType: MinuteLinkTargetType,
  keyword: string,
  enabled: boolean,
) {
  const kw = sanitize(keyword)
  return useQuery({
    queryKey: ['office', 'minute-link-search', targetType, kw],
    enabled,
    queryFn: async (): Promise<MinuteLinkCandidate[]> => {
      const meta = MINUTE_LINK_TARGETS[targetType]
      const cols = ['id', meta.titleColumn, meta.codeColumn].filter(Boolean).join(', ')
      let q = supabase.from(meta.table).select(cols).is('deleted_at', null)

      if (kw) {
        q = meta.codeColumn
          ? q.or(`${meta.titleColumn}.ilike.%${kw}%,${meta.codeColumn}.ilike.%${kw}%`)
          : q.ilike(meta.titleColumn, `%${kw}%`)
        q = q.order(meta.titleColumn, { ascending: true })
      } else {
        // 검색어가 없으면 최근 등록순으로 후보를 보인다.
        q = q.order('created_at', { ascending: false })
      }

      const { data, error } = await q.limit(20)
      if (error) throw error

      return ((data ?? []) as unknown as Record<string, string | null>[]).map((row) => ({
        targetType,
        targetId: row.id as string,
        label: (row[meta.titleColumn] as string) ?? '(제목 없음)',
        code: meta.codeColumn ? ((row[meta.codeColumn] as string | null) ?? null) : null,
      }))
    },
  })
}
