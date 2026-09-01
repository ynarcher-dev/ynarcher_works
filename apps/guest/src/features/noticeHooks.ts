import { useQuery } from '@tanstack/react-query'
import { useGuestClient } from '@/lib/useGuestClient'

/**
 * 메뉴별 NOTICE(알림) 읽기. WORKS 담당자가 모듈 화면 우측에서 세운 알림을 게스트가
 * 같은 자리에서 읽는다. 공개 판정은 전적으로 RLS(program_notices_guest_select →
 * app.guest_module_ids())가 하며, 소프트 삭제된 알림도 정책이 걸러 준다 —
 * 다른 게스트 훅과 같은 이유로 화면에서는 어떤 조건도 걸지 않는다.
 */

/** NOTICE 알림 글 1건(읽기 전용). */
export interface GuestNotice {
  id: string
  title: string
  body: string | null
  created_at: string
}

/** 모듈에 속한 알림 목록(최신순). */
export function useModuleNotices(moduleId: string | undefined) {
  const client = useGuestClient()
  return useQuery({
    queryKey: ['guest', 'module-notices', moduleId],
    enabled: Boolean(client && moduleId),
    queryFn: async (): Promise<GuestNotice[]> => {
      const { data, error } = await client!
        .from('program_notices')
        .select('id, title, body, created_at')
        .eq('program_module_id', moduleId)
        .order('created_at', { ascending: false })
        .limit(100)
      if (error) throw error
      return (data ?? []) as unknown as GuestNotice[]
    },
  })
}
