import { useQuery } from '@tanstack/react-query'
import { useGuestStore } from '@/auth/guestStore'
import { useGuestClient } from '@/lib/useGuestClient'

/**
 * 사업개요(사업소개문) 읽기. WORKS 사업 상세의 사업개요 탭에서 담당자가 쓴 소개문을
 * 게스트가 로그인 직후 첫 화면에서 읽는다. 조회 범위 판정은 전적으로
 * RLS(program_overviews_guest_select → app.guest_program_ids())가 하며, 세션에 고정된
 * 사업의 행 하나만 돌아온다 — 다른 게스트 훅과 같은 이유로 화면에서는 조건을 걸지 않는다.
 */
export function useProgramOverview() {
  const client = useGuestClient()
  const programId = useGuestStore((s) => s.program)?.id
  return useQuery({
    queryKey: ['guest', 'program-overview', programId],
    enabled: Boolean(client),
    queryFn: async (): Promise<string | null> => {
      const { data, error } = await client!
        .from('program_overviews')
        .select('body')
        .maybeSingle()
      if (error) throw error
      return (data?.body as string | null) ?? null
    },
  })
}
