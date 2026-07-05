import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export type Row = Record<string, unknown> & { id: string }

/** program_id 직속 테이블 조회. */
export function useByProgram(
  table: string,
  programId: string | undefined,
  columns: string,
) {
  return useQuery({
    queryKey: ['ac', table, programId],
    enabled: Boolean(programId),
    queryFn: async (): Promise<Row[]> => {
      const { data } = await supabase
        .from(table)
        .select(columns)
        .eq('program_id', programId)
        .order('created_at', { ascending: false })
        .limit(200)
      return (data ?? []) as unknown as Row[]
    },
  })
}

/** program_module_id 경유 테이블 조회(모듈 타입 → 모듈 id → 대상 테이블). */
export function useByModuleType(
  table: string,
  programId: string | undefined,
  moduleType: string,
  columns: string,
) {
  return useQuery({
    queryKey: ['ac', table, programId, moduleType],
    enabled: Boolean(programId),
    queryFn: async (): Promise<Row[]> => {
      const { data: mod } = await supabase
        .from('program_modules')
        .select('id')
        .eq('program_id', programId)
        .eq('module_type', moduleType)
        .maybeSingle()
      if (!mod) return []
      const { data } = await supabase
        .from(table)
        .select(columns)
        .eq('program_module_id', (mod as { id: string }).id)
        .limit(200)
      return (data ?? []) as unknown as Row[]
    },
  })
}
