import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

/**
 * 조직 관리(조직도 트리 + 조직 레벨) 데이터 훅. departments/org_levels 조회·mutation을 담당한다.
 * 임포트 경로 호환을 위해 features/management/hooks.ts에서 재노출한다.
 */

export interface Department {
  id: string
  name: string
  parent_id: string | null
  level_id: string | null
  sort_order: number
  deleted_at?: string | null
}

/** 조직 관리 트리 조회. 삭제(soft delete) 포함 여부를 옵션으로 받는다(삭제된 조직 섹션용). */
export function useDepartments(includeDeleted = false) {
  return useQuery({
    queryKey: ['management', 'departments', includeDeleted],
    queryFn: async (): Promise<Department[]> => {
      let q = supabase
        .from('departments')
        .select('id, name, parent_id, level_id, sort_order, deleted_at')
        .order('sort_order', { ascending: true })
      if (!includeDeleted) q = q.is('deleted_at', null)
      const { data, error } = await q
      if (error) throw error
      return (data ?? []) as Department[]
    },
  })
}

export interface OrgLevel {
  id: string
  name: string
}

/** 조직 레벨(계층) 정의 조회. 상위→하위 순(sort_order). 이름이 인사관리 컬럼이 된다. */
export function useOrgLevels() {
  return useQuery({
    queryKey: ['management', 'org-levels'],
    queryFn: async (): Promise<OrgLevel[]> => {
      const { data, error } = await supabase
        .from('org_levels')
        .select('id, name, sort_order')
        .is('deleted_at', null)
        .order('sort_order', { ascending: true })
      if (error) throw error
      return (data ?? []).map((l) => ({ id: l.id as string, name: l.name as string }))
    },
  })
}

const DEPT_KEY = ['management', 'departments'] as const

/** 조직관리 트리/삭제목록 쿼리 무효화(공용). */
function useInvalidateDepartments() {
  const qc = useQueryClient()
  return () => qc.invalidateQueries({ queryKey: DEPT_KEY })
}

/** 부서 생성. 생성된 id를 반환(생성 직후 이름 편집 진입용). */
export function useCreateDepartment() {
  const invalidate = useInvalidateDepartments()
  return useMutation({
    mutationFn: async (v: {
      name: string
      parent_id: string | null
      level_id: string | null
      sort_order: number
    }): Promise<{ id: string }> => {
      const { data, error } = await supabase
        .from('departments')
        .insert(v)
        .select('id')
        .single()
      if (error) throw error
      return data as { id: string }
    },
    onSuccess: () => invalidate(),
  })
}

/** 부서 단건 수정(이름/레벨/부모/정렬 부분 갱신). */
export function useUpdateDepartment() {
  const invalidate = useInvalidateDepartments()
  return useMutation({
    mutationFn: async (v: { id: string; values: Record<string, unknown> }) => {
      const { error } = await supabase.from('departments').update(v.values).eq('id', v.id)
      if (error) throw error
    },
    onSuccess: () => invalidate(),
  })
}

/** 다건 부서 정렬/부모 갱신(드래그 이동 결과 반영). 개별 UPDATE(부분 컬럼)로 처리. */
export function useMoveDepartments() {
  const invalidate = useInvalidateDepartments()
  return useMutation({
    mutationFn: async (rows: { id: string; parent_id: string | null; sort_order: number }[]) => {
      for (const r of rows) {
        const { error } = await supabase
          .from('departments')
          .update({ parent_id: r.parent_id, sort_order: r.sort_order })
          .eq('id', r.id)
        if (error) throw error
      }
    },
    onSuccess: () => invalidate(),
  })
}

/** 부서 소프트 삭제/복원(하위 포함). deleted=true면 deleted_at 기록, false면 해제. */
export function useSetDepartmentsDeleted() {
  const invalidate = useInvalidateDepartments()
  return useMutation({
    mutationFn: async (v: { ids: string[]; deleted: boolean }) => {
      const { error } = await supabase
        .from('departments')
        .update({ deleted_at: v.deleted ? new Date().toISOString() : null })
        .in('id', v.ids)
      if (error) throw error
    },
    onSuccess: () => invalidate(),
  })
}

const LEVEL_KEY = ['management', 'org-levels'] as const

/** 조직 레벨 생성(맨 아래 순서로). */
export function useCreateOrgLevel() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (v: { name: string; sort_order: number }) => {
      const { error } = await supabase.from('org_levels').insert(v)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: LEVEL_KEY }),
  })
}

/** 조직 레벨 이름 변경. */
export function useUpdateOrgLevel() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (v: { id: string; name: string }) => {
      const { error } = await supabase.from('org_levels').update({ name: v.name }).eq('id', v.id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: LEVEL_KEY }),
  })
}

/**
 * 조직 레벨 소프트 삭제. 해당 레벨을 쓰던 부서는 대체 레벨(fallbackLevelId)로 재태그해
 * 인사관리 컬럼에 빈 참조가 남지 않게 한다.
 */
export function useDeleteOrgLevel() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (v: { id: string; fallbackLevelId: string | null }) => {
      const { error } = await supabase
        .from('org_levels')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', v.id)
      if (error) throw error
      const { error: re } = await supabase
        .from('departments')
        .update({ level_id: v.fallbackLevelId })
        .eq('level_id', v.id)
      if (re) throw re
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: LEVEL_KEY })
      void qc.invalidateQueries({ queryKey: DEPT_KEY })
    },
  })
}
