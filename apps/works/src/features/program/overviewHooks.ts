import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useProgramWorkspace } from '@/features/program/workspace'

/**
 * 사업개요(사업소개문) 데이터 접근. **사업 1건 = 개요 1건**(program_id가 PK)이라 목록이
 * 없고, 원장은 게스트 로그인을 개방한 워크스페이스에만 있다(config.tables.overviews 유무)
 * — 값이 없으면 질의 자체를 걸지 않는다(NOTICE 훅과 같은 규약).
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
  const table = config.tables.overviews
  return useQuery({
    queryKey: [config.key, 'program-overview', programId],
    enabled: Boolean(programId && table),
    queryFn: async (): Promise<ProgramOverview | null> => {
      const { data, error } = await supabase
        .from(table!)
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
      const table = config.tables.overviews
      if (!table) throw new Error('이 워크스페이스는 사업개요를 운용하지 않습니다.')
      const { error } = await supabase
        .from(table)
        .upsert({ program_id: programId, body }, { onConflict: 'program_id' })
      if (error) throw error
    },
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: [config.key, 'program-overview', programId] }),
  })
}
