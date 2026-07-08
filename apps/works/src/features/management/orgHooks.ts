import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useMemo } from 'react'
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
  /** 소속 조직 버전(org_versions.id). */
  version_id: string
  /** 버전 간 동일 부서를 잇는 계보 id. */
  lineage_id: string
  deleted_at?: string | null
}

/**
 * 조직 관리 트리 조회. 삭제(soft delete) 포함 여부와 버전 스코프를 옵션으로 받는다.
 * versionId 미지정 시 "오늘의 유효 버전"으로 자동 스코프한다(임직원 화면 등 라이브 조직도 조회).
 * 조직관리 편집 화면(DepartmentsPanel)은 선택 버전을 명시적으로 넘긴다.
 * 유효 버전 해석 전(버전 로딩 중)에는 쿼리를 보류해 다른 버전 데이터가 섞이지 않게 한다.
 */
export function useDepartments(includeDeleted = false, versionId?: string) {
  const { data: versions } = useOrgVersions()
  const activeId = versions ? activeOrgVersionId(versions) : null
  const scopeId = versionId ?? activeId ?? undefined
  return useQuery({
    queryKey: ['management', 'departments', includeDeleted, scopeId ?? null],
    enabled: Boolean(scopeId),
    queryFn: async (): Promise<Department[]> => {
      let q = supabase
        .from('departments')
        .select('id, name, parent_id, level_id, sort_order, version_id, lineage_id, deleted_at')
        .eq('version_id', scopeId as string)
        .order('sort_order', { ascending: true })
      if (!includeDeleted) q = q.is('deleted_at', null)
      const { data, error } = await q
      if (error) throw error
      return (data ?? []) as Department[]
    },
  })
}

export interface OrgVersion {
  id: string
  label: string
  effective_from: string
  effective_to: string | null
  status: 'DRAFT' | 'PUBLISHED'
}

/**
 * 오늘의 유효 버전을 고른다.
 *  1) 오늘을 포함하는 버전([시작, 종료), 종료 null=무기한) 중 가장 늦게 시작한 PUBLISHED 버전.
 *  2) 없으면(공백 구간) 가장 최근에 종료된 버전을 유지(직전). 그것도 없으면 null.
 * (서버 current_org_version_id()와 동일 규칙 — 클라이언트 today 기준으로 파생)
 */
export function activeOrgVersionId(versions: OrgVersion[]): string | null {
  const today = new Date().toISOString().slice(0, 10)
  const pub = versions.filter((v) => v.status === 'PUBLISHED')
  const containing = pub
    .filter((v) => v.effective_from <= today && (v.effective_to == null || today < v.effective_to))
    .sort((a, b) => b.effective_from.localeCompare(a.effective_from))
  if (containing.length) return containing[0]!.id
  const ended = pub
    .filter((v) => v.effective_to != null && v.effective_to <= today)
    .sort((a, b) => (b.effective_to as string).localeCompare(a.effective_to as string))
  return ended[0]?.id ?? null
}

/** 조직 버전(가용기간) 목록. 시작일 내림차순(최신 발효가 위). */
export function useOrgVersions() {
  return useQuery({
    queryKey: ['management', 'org-versions'],
    queryFn: async (): Promise<OrgVersion[]> => {
      const { data, error } = await supabase
        .from('org_versions')
        .select('id, label, effective_from, effective_to, status')
        .is('deleted_at', null)
        .order('effective_from', { ascending: false })
      if (error) throw error
      return (data ?? []) as OrgVersion[]
    },
  })
}

export interface OrgLevel {
  id: string
  name: string
  /** 티어(같은 볼륨). sort_order를 티어 값으로 쓴다 — 같은 값이면 병렬 레벨. */
  tier: number
}

/**
 * 조직 레벨 정의 조회. 상위→하위(sort_order=티어) 순, 같은 티어 내에서는 이름순.
 * 같은 sort_order를 가진 레벨은 병렬(같은 볼륨)이며 인사관리 컬럼은 티어당 1개로 합쳐진다.
 */
export function useOrgLevels() {
  return useQuery({
    queryKey: ['management', 'org-levels'],
    queryFn: async (): Promise<OrgLevel[]> => {
      const { data, error } = await supabase
        .from('org_levels')
        .select('id, name, sort_order')
        .is('deleted_at', null)
        .order('sort_order', { ascending: true })
        .order('name', { ascending: true })
      if (error) throw error
      return (data ?? []).map((l) => ({
        id: l.id as string,
        name: l.name as string,
        tier: l.sort_order as number,
      }))
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
      version_id: string
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

const VERSION_KEY = ['management', 'org-versions'] as const

/**
 * 조직 버전 복제. 원본 버전의 부서 트리(레벨 태그·계층·정렬)를 새 가용기간으로 통째 복사한다.
 * effectiveTo가 비면(무기한) null로 전달한다. 생성된 버전 id를 반환(생성 직후 선택 전환용).
 */
export function useCloneOrgVersion() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (v: {
      srcVersionId: string
      label: string
      effectiveFrom: string
      effectiveTo: string | null
    }): Promise<string> => {
      const { data, error } = await supabase.rpc('clone_org_version', {
        p_src_version: v.srcVersionId,
        p_label: v.label,
        p_from: v.effectiveFrom,
        p_to: v.effectiveTo,
      })
      if (error) throw error
      return data as string
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: VERSION_KEY })
      void qc.invalidateQueries({ queryKey: DEPT_KEY })
      void qc.invalidateQueries({ queryKey: MEMBER_KEY })
    },
  })
}

const MEMBER_KEY = ['management', 'dept-members'] as const

export interface DeptMember {
  user_id: string
  department_id: string
}

/**
 * 특정 버전의 인력 배치((임직원)→부서). versionId 미지정 시 보류(활성 버전은 useActivePlacementMap 사용).
 */
export function useDeptMembers(versionId?: string) {
  return useQuery({
    queryKey: [...MEMBER_KEY, versionId ?? null],
    enabled: Boolean(versionId),
    queryFn: async (): Promise<DeptMember[]> => {
      const { data, error } = await supabase
        .from('dept_members')
        .select('user_id, department_id')
        .eq('version_id', versionId as string)
        .is('deleted_at', null)
      if (error) throw error
      return (data ?? []) as DeptMember[]
    },
  })
}

/**
 * 오늘의 유효 버전 인력 배치 맵((임직원 id)→부서 id). 임직원 화면의 소속 컬럼 원천.
 * ready=false(버전/배치 로딩 전)에는 호출부가 users.department_id 미러로 폴백한다.
 */
export function useActivePlacementMap(): { map: Map<string, string>; ready: boolean } {
  const { data: versions } = useOrgVersions()
  const activeId = versions ? activeOrgVersionId(versions) : null
  const { data, isSuccess } = useDeptMembers(activeId ?? undefined)
  return useMemo(() => {
    const map = new Map<string, string>()
    for (const r of data ?? []) map.set(r.user_id, r.department_id)
    return { map, ready: Boolean(activeId) && isSuccess }
  }, [data, activeId, isSuccess])
}

/**
 * 인력 배치 변경(선택 버전 기준). 기존 배치를 soft delete 후 신규 배치 삽입(부서 null=배치 해제).
 * 편집 버전이 활성 버전이면 users.department_id 미러도 함께 갱신한다(라이브 표시 일관).
 */
export function useAssignDeptMember() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (v: {
      versionId: string
      userId: string
      departmentId: string | null
      isActive: boolean
    }) => {
      const { error: delErr } = await supabase
        .from('dept_members')
        .update({ deleted_at: new Date().toISOString() })
        .eq('version_id', v.versionId)
        .eq('user_id', v.userId)
        .is('deleted_at', null)
      if (delErr) throw delErr
      if (v.departmentId) {
        const { error: insErr } = await supabase
          .from('dept_members')
          .insert({ version_id: v.versionId, department_id: v.departmentId, user_id: v.userId })
        if (insErr) throw insErr
      }
      if (v.isActive) {
        const { error: mirErr } = await supabase
          .from('users')
          .update({ department_id: v.departmentId })
          .eq('id', v.userId)
        if (mirErr) throw mirErr
      }
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: MEMBER_KEY })
      void qc.invalidateQueries({ queryKey: ['management', 'employees'] })
      void qc.invalidateQueries({ queryKey: ['management', 'employees-page'] })
    },
  })
}
