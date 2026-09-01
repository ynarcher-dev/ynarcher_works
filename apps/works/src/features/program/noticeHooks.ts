import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useProgramWorkspace } from '@/features/program/workspace'

/**
 * 메뉴별 NOTICE(알림) 데이터 접근.
 *
 * 원장은 게스트 로그인을 개방한 워크스페이스에만 있다(config.tables.notices 유무) —
 * 값이 없으면 질의 자체를 걸지 않는다. 원장이 AC 하나뿐이라도 테이블명은 config에서
 * 받는다(사업 공용 모듈의 다른 훅과 같은 규약).
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
  const table = config.tables.notices
  return useQuery({
    queryKey: [config.key, 'module-notices', moduleId],
    enabled: Boolean(moduleId && table),
    queryFn: async (): Promise<ProgramNotice[]> => {
      const { data, error } = await supabase
        .from(table!)
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
      const table = config.tables.notices
      if (!table) throw new Error('이 워크스페이스는 NOTICE를 운용하지 않습니다.')
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
      const table = config.tables.notices
      if (!table) throw new Error('이 워크스페이스는 NOTICE를 운용하지 않습니다.')
      const { error } = await supabase
        .from(table)
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: [config.key, 'module-notices', moduleId] }),
  })
}
