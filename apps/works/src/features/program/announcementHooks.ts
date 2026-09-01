import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useProgramWorkspace } from '@/features/program/workspace'

/**
 * 사업 공지사항(사업 단위 게시판) 데이터 접근. 모듈별 NOTICE(noticeHooks)와 축이 다르다 —
 * 이쪽은 사업 전체를 향한 글 목록이라 모듈에 매이지 않는다.
 * 원장은 게스트 로그인을 개방한 워크스페이스에만 있다(config.tables.announcements 유무).
 */

/** 공지 1건. */
export interface ProgramAnnouncement {
  id: string
  title: string
  body: string | null
  created_at: string
  updated_at: string
}

const COLS = 'id, title, body, created_at, updated_at'

/** 사업의 공지 목록(미삭제, 최신순). */
export function useAnnouncements(programId: string | undefined) {
  const config = useProgramWorkspace()
  const table = config.tables.announcements
  return useQuery({
    queryKey: [config.key, 'program-announcements', programId],
    enabled: Boolean(programId && table),
    queryFn: async (): Promise<ProgramAnnouncement[]> => {
      const { data, error } = await supabase
        .from(table!)
        .select(COLS)
        .eq('program_id', programId)
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
        .limit(200)
      if (error) throw error
      return (data ?? []) as unknown as ProgramAnnouncement[]
    },
  })
}

/** 공지 저장(id 있으면 수정, 없으면 신규). created_by는 DB 기본값이 채운다. */
export function useSaveAnnouncement(programId: string) {
  const qc = useQueryClient()
  const config = useProgramWorkspace()
  return useMutation({
    mutationFn: async (input: { id?: string; title: string; body: string | null }) => {
      const table = config.tables.announcements
      if (!table) throw new Error('이 워크스페이스는 공지사항을 운용하지 않습니다.')
      if (input.id) {
        const { error } = await supabase
          .from(table)
          .update({ title: input.title, body: input.body })
          .eq('id', input.id)
        if (error) throw error
        return
      }
      const { error } = await supabase
        .from(table)
        .insert({ program_id: programId, title: input.title, body: input.body })
      if (error) throw error
    },
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: [config.key, 'program-announcements', programId] }),
  })
}

/** 공지 소프트 삭제(물리 삭제 금지). */
export function useDeleteAnnouncement(programId: string) {
  const qc = useQueryClient()
  const config = useProgramWorkspace()
  return useMutation({
    mutationFn: async (id: string) => {
      const table = config.tables.announcements
      if (!table) throw new Error('이 워크스페이스는 공지사항을 운용하지 않습니다.')
      const { error } = await supabase
        .from(table)
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: [config.key, 'program-announcements', programId] }),
  })
}
