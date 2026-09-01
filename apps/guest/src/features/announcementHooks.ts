import { useQuery } from '@tanstack/react-query'
import { useGuestStore } from '@/auth/guestStore'
import { useGuestClient } from '@/lib/useGuestClient'

/**
 * 사업 공지사항 읽기. WORKS 공지사항 탭에서 담당자가 쓴 글 목록을 게스트가 고정 메뉴
 * '공지사항'에서 읽는다. 조회 범위 판정은 전적으로 RLS(program_announcements_guest_select
 * → app.guest_program_ids())가 하며, 소프트 삭제도 정책이 걸러 준다.
 */

/** 공지 1건(읽기 전용). */
export interface GuestAnnouncement {
  id: string
  title: string
  body: string | null
  created_at: string
}

/** 사업의 공지 목록(최신순). */
export function useProgramAnnouncements() {
  const client = useGuestClient()
  const programId = useGuestStore((s) => s.program)?.id
  return useQuery({
    queryKey: ['guest', 'program-announcements', programId],
    enabled: Boolean(client && programId),
    queryFn: async (): Promise<GuestAnnouncement[]> => {
      const { data, error } = await client!
        .from('program_announcements')
        .select('id, title, body, created_at')
        .eq('program_id', programId)
        .order('created_at', { ascending: false })
        .limit(200)
      if (error) throw error
      return (data ?? []) as unknown as GuestAnnouncement[]
    },
  })
}
