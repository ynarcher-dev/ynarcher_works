/**
 * 업로드 검증에 쓰는 태그 원장 스냅숏. 명세가 요구하는 태그 테이블을 한 번에 읽어
 * "이 파일의 값이 ADMIN 태그 관리에 실제로 있는 이름인가"를 파싱 단계에서 판정하게 한다.
 *
 * 캐시 키는 useTags와 같은 모양을 쓴다 — 같은 원장을 두 키로 담으면 화면마다 다른 스냅숏을 보게 된다.
 */
import { useQueries } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { BulkTagLookup } from '@/features/bulk/bulkImport'

interface TagRow {
  name: string
}

/**
 * 태그 원장 여러 개를 병렬로 읽어 `테이블 → 태그명[]`으로 돌려준다.
 * `ready`가 false인 동안에는 파싱을 미룬다 — 원장을 못 읽은 채 검증하면 모든 값이 통과해 버려,
 * 검증이 있는 화면과 없는 화면이 파일 로딩 타이밍에 따라 갈린다.
 */
export function useBulkTagLookup(tables: string[]): { lookup: BulkTagLookup; ready: boolean } {
  const results = useQueries({
    queries: tables.map((table) => ({
      queryKey: ['admin', 'tags', table, 'plain'],
      queryFn: async (): Promise<TagRow[]> => {
        const { data, error } = await supabase
          .from(table)
          .select('id, name, sort_order, created_at, updated_at')
          .is('deleted_at', null)
          .order('sort_order', { ascending: true })
          .order('name', { ascending: true })
        if (error) throw error
        return (data ?? []) as unknown as TagRow[]
      },
    })),
  })

  const lookup: BulkTagLookup = {}
  tables.forEach((table, i) => {
    lookup[table] = (results[i]?.data ?? []).map((t) => t.name)
  })
  return { lookup, ready: results.every((r) => r.isSuccess) }
}
