import { useQuery } from '@tanstack/react-query'
import { ATTACHMENT_COUNT_KEY } from '@/features/networks/materialHooks'
import { supabase } from '@/lib/supabase'

/**
 * 게시판형 목록(공지사항·QNA)의 행별 첨부 건수 — 표의 클립 표식이 이 값을 본다.
 *
 * 첨부를 임베드로 끌어오지 못하는 이유는 `attachments`가 다형 테이블이라 각 원장과 외래키로
 * 이어져 있지 않기 때문이다. 그래서 화면에 뜬 id 묶음으로 **한 번만** 세어 맵을 만든다 —
 * 행마다 세면 한 화면에 열 번의 왕복이 생긴다.
 *
 * 키 접두사를 `materialHooks`와 공유하므로, 첨부를 올리거나 지우면 이 카운트도 함께 낡는다.
 */
export function useAttachmentCounts(targetType: string, ids: string[]) {
  // 키는 정렬해 만든다 — 목록 정렬이 바뀌어도 같은 묶음이면 같은 질의로 본다.
  const key = [...ids].sort().join(',')
  return useQuery({
    queryKey: [ATTACHMENT_COUNT_KEY, targetType, key],
    enabled: ids.length > 0,
    queryFn: async (): Promise<Record<string, number>> => {
      const { data, error } = await supabase
        .from('attachments')
        .select('target_id')
        .eq('target_type', targetType)
        .in('target_id', ids)
        .is('deleted_at', null)
      if (error) throw error
      const counts: Record<string, number> = {}
      for (const row of (data ?? []) as { target_id: string }[]) {
        counts[row.target_id] = (counts[row.target_id] ?? 0) + 1
      }
      return counts
    },
  })
}
