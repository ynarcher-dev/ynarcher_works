import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useProgramWorkspace } from '@/features/program/workspace'

export type Row = Record<string, unknown> & { id: string }

/**
 * program_id 직속 테이블 조회. 테이블명은 호출부가 넘긴다(공용 테이블은 config, AC 전용 테이블은 리터럴).
 * 쿼리 키에는 워크스페이스 키를 함께 넣어 캐시가 섞이지 않게 한다.
 */
export function useByProgram(
  table: string,
  programId: string | undefined,
  columns: string,
) {
  const config = useProgramWorkspace()
  return useQuery({
    queryKey: [config.key, table, programId],
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
  const config = useProgramWorkspace()
  return useQuery({
    queryKey: [config.key, table, 'module', moduleId],
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
