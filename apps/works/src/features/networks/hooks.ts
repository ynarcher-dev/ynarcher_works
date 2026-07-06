import {
  keepPreviousData,
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

/** 엔티티 목록 페이지(0-base page). 서버 사이드 페이지네이션 결과와 건수 정보. */
export interface EntityPage {
  rows: EntityRow[]
  /** 현재 검색어(필터)에 반영된 건수. 페이지 수·No. 넘버링의 기준. */
  total: number
  /** 필터 미적용(미삭제/미병합) 전체 건수. 검색어가 없으면 total과 같다. */
  totalAll: number
}

/**
 * 엔티티 목록의 서버 사이드 페이지네이션(검색/미삭제/미병합).
 * `.range()`로 페이지 구간만 조회하고 `count: 'exact'`로 필터 반영 건수를 함께 받는다.
 * 검색어가 있으면 필터 미적용 전체 건수(totalAll)를 head 카운트로 추가 조회한다(행 미전송).
 * page는 0-base. 페이지 전환 시 이전 페이지를 유지(keepPreviousData)해 깜빡임을 줄인다.
 */
export function useEntityPage(
  table: EntityKey,
  keyword: string,
  page: number,
  pageSize: number,
) {
  return useQuery({
    queryKey: ['networks', table, 'page', keyword, page, pageSize],
    placeholderData: keepPreviousData,
    queryFn: async (): Promise<EntityPage> => {
      const from = page * pageSize
      const to = from + pageSize - 1
      let q = supabase
        .from(table)
        .select('*', { count: 'exact' })
        .is('deleted_at', null)
        .is('merged_into_id', null)
        .order('name', { ascending: true })
        .range(from, to)
      const trimmed = keyword.trim()
      if (trimmed) q = q.ilike('name', `%${trimmed}%`)
      const { data, error, count } = await q
      if (error) throw error
      const total = count ?? 0

      // 검색어가 없으면 필터 반영 건수 == 전체 건수. 있을 때만 전체 건수를 별도 조회한다.
      let totalAll = total
      if (trimmed) {
        const { count: allCount } = await supabase
          .from(table)
          .select('*', { count: 'exact', head: true })
          .is('deleted_at', null)
          .is('merged_into_id', null)
        totalAll = allCount ?? total
      }

      return { rows: (data ?? []) as EntityRow[], total, totalAll }
    },
  })
}

/** 엔티티 단건 조회(상세페이지). id 미지정 시 비활성. */
export function useEntity(table: EntityKey, id: string | undefined) {
  return useQuery({
    queryKey: ['networks', table, 'detail', id],
    enabled: Boolean(id),
    queryFn: async (): Promise<EntityRow | null> => {
      const { data, error } = await supabase
        .from(table)
        .select('*')
        .eq('id', id)
        .maybeSingle()
      if (error) throw error
      return (data ?? null) as EntityRow | null
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

/** 엔티티 생성(생성된 id 반환). */
export function useCreateEntity(table: EntityKey) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (values: Record<string, unknown>): Promise<string> => {
      const { data, error } = await supabase
        .from(table)
        .insert(values)
        .select('id')
        .single()
      if (error) throw error
      return (data as { id: string }).id
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
