import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { Contribution } from '@/features/networks/hooks'
import { useProgramWorkspace, type ProgramWorkspaceConfig } from '@/features/program/workspace'


/**
 * 프로그램 변동 이력(entity_contributions, 오래된 순).
 * NETWORKS 상세의 ChangeHistoryPanel을 재사용하기 위한 프로그램 전용 조회 훅이다.
 * (networks의 useContributions는 EntityKey 타입에 묶여 있어 program을 받지 못하므로 분리.)
 */
export function useProgramContributions(programId: string | undefined) {
  const config = useProgramWorkspace()
  return useQuery({
    queryKey: [config.key, 'contributions', programId],
    enabled: Boolean(programId),
    queryFn: async (): Promise<Contribution[]> => {
      const { data, error } = await supabase
        .from('entity_contributions')
        .select('*')
        .eq('entity_table', config.entityKey)
        .eq('entity_id', programId)
        .order('created_at', { ascending: true })
      if (error) throw error
      return (data ?? []) as Contribution[]
    },
  })
}

/**
 * 프로그램 기여 1건 기록(user_id·user_name은 서버 트리거가 현재 유저로 스탬프).
 * 부수 기록이므로 실패해도 본 작업(등록/수정)을 막지 않는다(에러를 삼킨다).
 */
export async function recordProgramContribution(
  entityKey: ProgramWorkspaceConfig['entityKey'],
  programId: string,
  action: Contribution['action'],
): Promise<void> {
  await supabase
    .from('entity_contributions')
    .insert({ entity_table: entityKey, entity_id: programId, action, source: 'manual' })
}
