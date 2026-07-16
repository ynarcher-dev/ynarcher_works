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

/** 특정 모듈 인스턴스(program_module_id = moduleId) 하위 테이블 조회. */
export function useByModuleId(
  table: string,
  moduleId: string | undefined,
  columns: string,
) {
  return useQuery({
    queryKey: ['ac', table, 'module', moduleId],
    enabled: Boolean(moduleId),
    queryFn: async (): Promise<Row[]> => {
      const { data } = await supabase
        .from(table)
        .select(columns)
        .eq('program_module_id', moduleId)
        .limit(200)
      return (data ?? []) as unknown as Row[]
    },
  })
}
