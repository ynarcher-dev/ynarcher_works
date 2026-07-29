import { useCallback, useMemo } from 'react'
import { useEmployees } from '@/features/hub/hooks'
import { useDepartments, useOrgLevels } from '@/features/management/orgHooks'
import { useBranchMembers, useBranches } from '@/features/office/branches/branchesApi'

/**
 * 지사 상주인력을 이름으로 읽는 훅.
 * branch_members는 user_id만 갖고, 이름은 임직원 원장(MANAGEMENT 소유)에서 붙인다 —
 * 지사 원장에 이름을 비정규화해 두면 임직원 개명·퇴사가 반영되지 않기 때문이다.
 */
export function useBranchMemberNames() {
  const membersQuery = useBranchMembers()
  const { data: employees } = useEmployees()

  const nameById = useMemo(
    () => new Map((employees ?? []).map((e) => [e.id, e.name] as const)),
    [employees],
  )

  /** 지사의 상주인력 이름 목록(배정 순서 유지). 조회 불가한 계정은 표기에서 제외한다. */
  const namesOf = useCallback(
    (branchId: string): string[] =>
      (membersQuery.data?.get(branchId) ?? [])
        .map((id) => nameById.get(id))
        .filter((n): n is string => Boolean(n)),
    [membersQuery.data, nameById],
  )

  /** 지사의 상주인력 id 목록(폼 초기값). */
  const idsOf = useCallback(
    (branchId: string): string[] => membersQuery.data?.get(branchId) ?? [],
    [membersQuery.data],
  )

  return { namesOf, idsOf, isLoading: membersQuery.isLoading }
}

/** 상주인력 1명의 표기 단위 — 이름과 조직관리에서 배치된 자리. */
export interface BranchMemberEntry {
  id: string
  name: string
  /** 배치된 조직명(부서). 아직 배치 전이면 null. */
  deptName: string | null
  /** 그 조직의 레벨명(본부·그룹 등). */
  levelName: string | null
}

/**
 * 상주인력을 "이름 + 조직관리에서 배치된 자리"로 읽는 훅.
 * 자리는 임직원 원장에 따로 적지 않고 조직관리(users.department_id → departments → org_levels)에서
 * 파생한다 — 조직 개편으로 배치가 바뀌면 지사 표기도 자동으로 따라간다.
 * 부서·레벨은 오늘의 유효 조직 버전 스코프다(useDepartments/useOrgLevels 기본값).
 */
export function useBranchMemberEntries() {
  const membersQuery = useBranchMembers()
  const { data: employees } = useEmployees()
  const { data: departments } = useDepartments()
  const { data: levels } = useOrgLevels()

  const employeeById = useMemo(
    () => new Map((employees ?? []).map((e) => [e.id, e] as const)),
    [employees],
  )
  const deptById = useMemo(
    () => new Map((departments ?? []).map((d) => [d.id, d] as const)),
    [departments],
  )
  const levelNameById = useMemo(
    () => new Map((levels ?? []).map((l) => [l.id, l.name] as const)),
    [levels],
  )

  const entriesOf = useCallback(
    (branchId: string): BranchMemberEntry[] =>
      (membersQuery.data?.get(branchId) ?? []).flatMap((userId) => {
        const employee = employeeById.get(userId)
        if (!employee) return [] // 조회 불가한 계정은 표기에서 제외
        const dept = employee.department_id ? deptById.get(employee.department_id) ?? null : null
        return [
          {
            id: userId,
            name: employee.name,
            deptName: dept?.name ?? null,
            levelName: dept?.level_id ? levelNameById.get(dept.level_id) ?? null : null,
          },
        ]
      }),
    [membersQuery.data, employeeById, deptById, levelNameById],
  )

  return { entriesOf, isLoading: membersQuery.isLoading }
}

/**
 * 반대 방향 조회 — 임직원 한 명이 배정된 지사를 읽는 훅.
 * 임직원 원장에 지사를 따로 적지 않는다. 배정은 지사 원장(branch_members)이 단일 원천이고,
 * 임직원 정보는 거기서 파생해 보여주기만 한다 — 양쪽에 적으면 한쪽만 고쳐질 때 서로 어긋난다.
 * 인사 관리에서 지사를 지정할 때도 이 원장을 그대로 고친다(set_user_branches RPC).
 * 비활성 지사는 목록(useBranches 기본값)에서 빠지므로 자연히 표기·편집 대상에서도 사라진다.
 */
export function useEmployeeBranchNames() {
  const branchesQuery = useBranches()
  const membersQuery = useBranchMembers()

  // user_id → 배정 지사 목록(지사 정렬 순서 유지).
  const byUser = useMemo(() => {
    const map = new Map<string, { id: string; name: string }[]>()
    for (const b of branchesQuery.data ?? []) {
      for (const userId of membersQuery.data?.get(b.id) ?? []) {
        const arr = map.get(userId) ?? []
        arr.push({ id: b.id, name: b.name })
        map.set(userId, arr)
      }
    }
    return map
  }, [branchesQuery.data, membersQuery.data])

  const branchNamesOf = useCallback(
    (userId: string): string[] => (byUser.get(userId) ?? []).map((b) => b.name),
    [byUser],
  )

  /** 배정 지사 id 목록(인사 관리 수정 폼 초기값). */
  const branchIdsOf = useCallback(
    (userId: string): string[] => (byUser.get(userId) ?? []).map((b) => b.id),
    [byUser],
  )

  return {
    branchNamesOf,
    branchIdsOf,
    isLoading: branchesQuery.isLoading || membersQuery.isLoading,
  }
}
