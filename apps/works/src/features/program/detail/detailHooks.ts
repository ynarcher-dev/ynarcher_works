import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { ProgramModule } from '@/features/program/hooks'
import { SHARED_TABLES, useProgramWorkspace } from '@/features/program/workspace'

/**
 * 프로그램 마스터 수정(제목/상태/기간/설명/분류 — 편집 모달용, 사유 필수).
 * 사유는 원장 컬럼이 아니라 기여 로그의 note로만 남으므로 update_entity RPC를 경유한다
 * (20260721200000). 변동 이력 'edited'는 그 트랜잭션 안에서 원장 트리거가 남기며,
 * 값이 실제로 바뀐 경우에만 기록되므로 무변경 저장은 이력에 남지 않는다.
 */
export function useUpdateProgram(id: string) {
  const qc = useQueryClient()
  const config = useProgramWorkspace()
  return useMutation({
    mutationFn: async ({
      values,
      reason,
    }: {
      values: {
        title: string
        status: string
        proposal_start_date: string | null
        proposal_end_date: string | null
        start_date: string | null
        end_date: string | null
        description: string | null
        category: string | null
        /** 분야 태그(태그명 배열). jsonb 컬럼이라 배열 그대로 실어 보낸다. */
        industries: string[]
        /**
         * 주관(자유 서술). 운용하지 않는 워크스페이스는 키를 아예 빼고 보낸다 —
         * update_entity는 넘어온 키만 SET하므로, 빼면 그 원장의 값은 손대지 않는다.
         */
        host_organization?: string | null
      }
      reason: string
    }) => {
      const { error } = await supabase.rpc('update_entity', {
        p_table: config.tables.programs,
        p_id: id,
        p_values: values,
        p_note: reason,
      })
      if (error) throw error
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: [config.key, 'program', id] })
      void qc.invalidateQueries({ queryKey: [config.key, 'programs'] })
      void qc.invalidateQueries({ queryKey: [config.key, 'contributions', id] })
    },
  })
}

/**
 * 모듈 인스턴스 상태만 변경(칸반 드래그앤드롭 전용). status 컬럼만 인스턴스 id 기준 부분 업데이트하며,
 * 드래그 직후 즉시 컬럼이 이동하도록 낙관적 업데이트하고 실패 시 이전 상태로 롤백한다.
 */
export function useUpdateModuleStatus(programId: string) {
  const qc = useQueryClient()
  const config = useProgramWorkspace()
  const key = [config.key, 'modules', programId]
  return useMutation({
    mutationFn: async (input: { moduleId: string; status: string }) => {
      const { error } = await supabase
        .from(SHARED_TABLES.modules)
        .update({ status: input.status })
        .eq('id', input.moduleId)
      if (error) throw error
    },
    onMutate: async (input) => {
      await qc.cancelQueries({ queryKey: key })
      const prev = qc.getQueryData<ProgramModule[]>(key)
      qc.setQueryData<ProgramModule[]>(key, (old) =>
        (old ?? []).map((m) => (m.id === input.moduleId ? { ...m, status: input.status } : m)),
      )
      return { prev }
    },
    onError: (_err, _input, ctx) => {
      if (ctx?.prev) qc.setQueryData(key, ctx.prev)
    },
    onSettled: () => qc.invalidateQueries({ queryKey: key }),
  })
}
