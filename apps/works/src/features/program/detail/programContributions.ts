import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { Contribution } from '@/features/networks/hooks'
import { useProgramWorkspace } from '@/features/program/workspace'


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

// 기록(쓰기)은 클라이언트에 두지 않는다 — 사업 원장 3종의 변동 이력은 원장 트리거
// app.log_program_contribution()이 같은 트랜잭션에서 남긴다(마이그레이션 20260721140000).
// 화면에서 손으로 남기던 시절에는 비활성화 경로가 통째로 누락돼 있었고, 원장 쓰기와 로그 쓰기가
// 별개 요청이라 원자성도 없었다.
