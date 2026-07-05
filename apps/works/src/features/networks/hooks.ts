import {
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { EntityKey } from '@/features/networks/config'

export type EntityRow = Record<string, unknown> & {
  id: string
  name: string
  is_provisional?: boolean
  merged_into_id?: string | null
}

/** 엔티티 목록(검색/미삭제/미병합). */
export function useEntityList(table: EntityKey, keyword: string) {
  return useQuery({
    queryKey: ['networks', table, keyword],
    queryFn: async (): Promise<EntityRow[]> => {
      let q = supabase
        .from(table)
        .select('*')
        .is('deleted_at', null)
        .is('merged_into_id', null)
        .order('name', { ascending: true })
        .limit(200)
      if (keyword.trim()) q = q.ilike('name', `%${keyword.trim()}%`)
      const { data, error } = await q
      if (error) throw error
      return (data ?? []) as EntityRow[]
    },
  })
}

/** 동일 이름 중복 존재 여부(등록 전 검사). */
export async function checkDuplicateName(
  table: EntityKey,
  name: string,
): Promise<boolean> {
  const { data } = await supabase
    .from(table)
    .select('id')
    .eq('name', name)
    .is('deleted_at', null)
    .limit(1)
  return (data ?? []).length > 0
}

/** 엔티티 생성. */
export function useCreateEntity(table: EntityKey) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (values: Record<string, unknown>) => {
      const { error } = await supabase.from(table).insert(values)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['networks', table] }),
  })
}

/** 엔티티 수정. */
export function useUpdateEntity(table: EntityKey) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      id,
      values,
    }: {
      id: string
      values: Record<string, unknown>
    }) => {
      const { error } = await supabase.from(table).update(values).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['networks', table] }),
  })
}

export interface GrowthMetrics {
  technology: number | null
  business_model: number | null
  credibility: number | null
  collaboration: number | null
  matching_feasibility: number | null
  sample_count: number
}

/** 스타트업 성장 5대 지표 평균(멘토 진단 누적, RPC 집계). */
export function useStartupGrowth(startupId: string | undefined) {
  return useQuery({
    queryKey: ['networks', 'growth', startupId],
    enabled: Boolean(startupId),
    queryFn: async (): Promise<GrowthMetrics | null> => {
      const { data, error } = await supabase.rpc('startup_growth_metrics', {
        p_startup_id: startupId,
      })
      if (error) throw error
      const row = (data ?? [])[0] as GrowthMetrics | undefined
      return row ?? null
    },
  })
}

/** 중복 병합: duplicate → primary 로 병합(merged_into_id 지정). */
export function useMergeEntity(table: EntityKey) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      primaryId,
      duplicateId,
    }: {
      primaryId: string
      duplicateId: string
    }) => {
      const { error } = await supabase
        .from(table)
        .update({ merged_into_id: primaryId })
        .eq('id', duplicateId)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['networks', table] }),
  })
}
