import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import {
  MINUTE_LINK_TARGETS,
  type MinuteLinkTargetType,
} from '@/features/office/minutes/minuteLinks'

/**
 * 연동 대상 후보 풀 — 선택한 종류의 원장에서 요청자가 접근 가능한 행을 한 번에 불러온다.
 * 원장 SELECT RLS가 접근 가능한 행만 돌려주므로("접근 가능 대상만 연동" 결정) 이 풀 자체가
 * 접근 가능 집합이며, 검색·필터는 클라이언트(TokenMultiSelect)가 수행한다 — 내부 참석자 피커가
 * 전 임직원을 로드해 필드 안에서 검색·태그하는 UX와 동일하게 맞추기 위함이다.
 * 서버측 최종 강제는 set_minute_links RPC가 별도로 한다.
 */
export interface MinuteLinkCandidate {
  targetType: MinuteLinkTargetType
  targetId: string
  label: string
  code: string | null
}

/** 종류별 접근 가능 후보(제목순, 최대 500건). enabled=false면 질의하지 않는다. */
export function useMinuteLinkPool(targetType: MinuteLinkTargetType, enabled = true) {
  return useQuery({
    queryKey: ['office', 'minute-link-pool', targetType],
    enabled,
    queryFn: async (): Promise<MinuteLinkCandidate[]> => {
      const meta = MINUTE_LINK_TARGETS[targetType]
      const cols = ['id', meta.titleColumn, meta.codeColumn].filter(Boolean).join(', ')
      const { data, error } = await supabase
        .from(meta.table)
        .select(cols)
        .is('deleted_at', null)
        .order(meta.titleColumn, { ascending: true })
        .limit(500)
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
