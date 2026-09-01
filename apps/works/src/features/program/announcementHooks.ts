import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useProgramWorkspace } from '@/features/program/workspace'

/**
 * 사업 공지사항(사업 단위 게시판) 데이터 접근. 모듈별 NOTICE(noticeHooks)와 축이 다르다 —
 * 이쪽은 사업 전체를 향한 글 목록이라 모듈에 매이지 않는다.
 * 원장은 게스트 로그인을 개방한 워크스페이스에만 있다(config.tables.announcements 유무).
 */

/**
 * 공지 첨부의 다형 키. 귀속 단위가 **공지 1건**이라 target_id는 공지 id다 —
 * 사업개요 파일(사업당 개요가 하나라 target_id가 사업)과 갈리는 지점이며,
 * 업로드·조회·보류 업로드가 모두 이 상수 하나를 본다.
 */
export const ANNOUNCEMENT_ATTACHMENT_TYPE = 'program_announcement'

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

/**
 * 공지 저장(id 있으면 수정, 없으면 신규). created_by는 DB 기본값이 채운다.
 * **저장된 공지의 id를 돌려준다** — 신규 등록에서 보류 첨부를 붙일 대상이 그 id이기 때문이다.
 */
export function useSaveAnnouncement(programId: string) {
  const qc = useQueryClient()
  const config = useProgramWorkspace()
  return useMutation({
    mutationFn: async (input: {
      id?: string
      title: string
      body: string | null
    }): Promise<string> => {
      const table = config.tables.announcements
      if (!table) throw new Error('이 워크스페이스는 공지사항을 운용하지 않습니다.')
      if (input.id) {
        const { error } = await supabase
          .from(table)
          .update({ title: input.title, body: input.body })
          .eq('id', input.id)
        if (error) throw error
        return input.id
      }
      const { data, error } = await supabase
        .from(table)
        .insert({ program_id: programId, title: input.title, body: input.body })
        .select('id')
        .single()
      if (error) throw error
      return (data as { id: string }).id
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
