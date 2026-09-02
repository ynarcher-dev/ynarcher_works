import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { SHARED_TABLES, useProgramWorkspace } from '@/features/program/workspace'

/**
 * 메뉴별 NOTICE(알림) 데이터 접근.
 *
 * 원장은 세 사업 워크스페이스가 공유한다. 소속을 답하는 것은 이 표의 컬럼이 아니라
 * 매달린 모듈(program_module_id)이다 — 같은 사실을 두 곳에 적으면 어긋날 자리가 생긴다.
 */

/** NOTICE 알림 글 1건. */
export interface ProgramNotice {
  id: string
  title: string
  body: string | null
  created_at: string
  updated_at: string
}

const NOTICE_COLS = 'id, title, body, created_at, updated_at'

/** 모듈에 속한 알림 목록(미삭제, 최신순). */
export function useModuleNotices(moduleId: string | undefined) {
  const config = useProgramWorkspace()
  const table = SHARED_TABLES.notices
  return useQuery({
    queryKey: [config.key, 'module-notices', moduleId],
    enabled: Boolean(moduleId),
    queryFn: async (): Promise<ProgramNotice[]> => {
      const { data, error } = await supabase
        .from(table)
        .select(NOTICE_COLS)
        .eq('program_module_id', moduleId)
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
        .limit(200)
      if (error) throw error
      return (data ?? []) as unknown as ProgramNotice[]
    },
  })
}

/** 알림 저장(id 있으면 수정, 없으면 신규). created_by는 DB 기본값이 채운다. */
export function useSaveNotice(programId: string, moduleId: string) {
  const qc = useQueryClient()
  const config = useProgramWorkspace()
  return useMutation({
    mutationFn: async (input: { id?: string; title: string; body: string | null }) => {
      const table = SHARED_TABLES.notices
      if (input.id) {
        const { error } = await supabase
          .from(table)
          .update({ title: input.title, body: input.body })
          .eq('id', input.id)
        if (error) throw error
        return
      }
      const { error } = await supabase.from(table).insert({
        program_id: programId,
        program_module_id: moduleId,
        title: input.title,
        body: input.body,
      })
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: [config.key, 'module-notices', moduleId] }),
  })
}

/** 알림 소프트 삭제(물리 삭제 금지). */
export function useDeleteNotice(moduleId: string) {
  const qc = useQueryClient()
  const config = useProgramWorkspace()
  return useMutation({
    mutationFn: async (id: string) => {
      const table = SHARED_TABLES.notices
      const { error } = await supabase
        .from(table)
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: [config.key, 'module-notices', moduleId] }),
  })
}
