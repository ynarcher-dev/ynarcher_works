import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { SHARED_TABLES, useProgramWorkspace } from '@/features/program/workspace'

/**
 * 사업개요(사업소개문) 데이터 접근. **사업 1건 = 개요 1건**(program_id가 PK)이라 목록이
 * 없다. 원장은 세 사업 워크스페이스가 공유하며 소속은 entity_key가 답한다(2026-09-03 통합).
 */

/** 사업개요 1건. */
export interface ProgramOverview {
  program_id: string
  body: string | null
  updated_at: string
}

/** 사업의 개요(없으면 null — 아직 아무도 쓰지 않은 상태). */
export function useProgramOverview(programId: string | undefined) {
  const config = useProgramWorkspace()
  const table = SHARED_TABLES.overviews
  return useQuery({
    queryKey: [config.key, 'program-overview', programId],
    enabled: Boolean(programId),
    queryFn: async (): Promise<ProgramOverview | null> => {
      const { data, error } = await supabase
        .from(table)
        .select('program_id, body, updated_at')
        .eq('program_id', programId)
        .maybeSingle()
      if (error) throw error
      return (data as unknown as ProgramOverview) ?? null
    },
  })
}

/**
 * 개요 저장. 사업당 한 건이므로 신규·수정을 가르지 않고 upsert 하나로 받는다 —
 * 행의 존재 여부를 화면이 판정해 갈라 보내면, 두 창이 동시에 처음 쓸 때 한쪽이 죽는다.
 */
export function useSaveProgramOverview(programId: string) {
  const qc = useQueryClient()
  const config = useProgramWorkspace()
  return useMutation({
    mutationFn: async (body: string | null) => {
      const table = SHARED_TABLES.overviews
      const { error } = await supabase
        .from(table)
        .upsert(
          { entity_key: config.entityKey, program_id: programId, body },
          { onConflict: 'program_id' },
        )
      if (error) throw error
    },
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: [config.key, 'program-overview', programId] }),
  })
}
