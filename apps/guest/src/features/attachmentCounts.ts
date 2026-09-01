import { useQuery } from '@tanstack/react-query'
import { useGuestClient } from '@/lib/useGuestClient'

/**
 * 게시판형 목록(공지사항·QNA)의 행별 첨부 건수 — 표의 클립 표식이 이 값을 본다.
 * WORKS의 같은 이름 훅과 같은 판정이며, 조회 범위만 RLS가 게스트 몫으로 좁힌다.
 *
 * 첨부를 임베드로 끌어오지 못하는 이유는 `attachments`가 다형 테이블이라 각 원장과
 * 외래키로 이어져 있지 않기 때문이다. 그래서 화면에 뜬 id 묶음으로 한 번만 세어 맵을 만든다.
 */
export function useAttachmentCounts(targetType: string, ids: string[]) {
  const client = useGuestClient()
  // 키는 정렬해 만든다 — 목록 정렬이 바뀌어도 같은 묶음이면 같은 질의로 본다.
  const key = [...ids].sort().join(',')
  return useQuery({
    queryKey: ['guest', 'attachment-counts', targetType, key],
    enabled: Boolean(client) && ids.length > 0,
    queryFn: async (): Promise<Record<string, number>> => {
      const { data, error } = await client!
        .from('attachments')
        .select('target_id')
        .eq('target_type', targetType)
        .in('target_id', ids)
      if (error) throw error
      const counts: Record<string, number> = {}
      for (const row of (data ?? []) as { target_id: string }[]) {
        counts[row.target_id] = (counts[row.target_id] ?? 0) + 1
      }
      return counts
    },
  })
}
