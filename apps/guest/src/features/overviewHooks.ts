import { useQuery } from '@tanstack/react-query'
import { useGuestStore } from '@/auth/guestStore'
import { useGuestClient } from '@/lib/useGuestClient'
import type { GuestFile } from '@/features/moduleHooks'

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

/**
 * 사업개요에 딸린 파일(소개문 우측 칸). 파일첨부 모듈과 같은 attachments 행이되 귀속이
 * target_type='program_overview'다 — 모듈이 아니라 모듈 마커(program_module_id)를 쓸 수
 * 없다. 조회 범위 판정은 RLS(attachments_overview_guest_select → guest_program_ids())가
 * 하며, 다운로드는 모듈 파일과 같은 Edge Function 경로를 탄다.
 */
export function useOverviewFiles() {
  const client = useGuestClient()
  const programId = useGuestStore((s) => s.program)?.id
  return useQuery({
    queryKey: ['guest', 'overview-files', programId],
    enabled: Boolean(client && programId),
    queryFn: async (): Promise<GuestFile[]> => {
      const { data, error } = await client!
        .from('attachments')
        .select('id, file_name, content_type, byte_size, created_at')
        .eq('target_type', 'program_overview')
        .eq('target_id', programId)
        .order('created_at', { ascending: false })
        .limit(100)
      if (error) throw error
      return (data ?? []) as unknown as GuestFile[]
    },
  })
}
