import { useCallback, useMemo } from 'react'
import { useEmployees } from '@/features/hub/hooks'
import { useBranchMembers, useBranches } from '@/features/office/branches/branchesApi'

/**
 * 지사 배정인력을 이름으로 읽는 훅.
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

  /** 지사의 배정인력 이름 목록(배정 순서 유지). 조회 불가한 계정은 표기에서 제외한다. */
  const namesOf = useCallback(
    (branchId: string): string[] =>
      (membersQuery.data?.get(branchId) ?? [])
        .map((id) => nameById.get(id))
        .filter((n): n is string => Boolean(n)),
    [membersQuery.data, nameById],
  )

  /** 지사의 배정인력 id 목록(폼 초기값). */
  const idsOf = useCallback(
    (branchId: string): string[] => membersQuery.data?.get(branchId) ?? [],
    [membersQuery.data],
  )

  return { namesOf, idsOf, isLoading: membersQuery.isLoading }
}

/**
 * 반대 방향 조회 — 임직원 한 명이 배정된 지사명을 읽는 훅.
 * 임직원 원장에 지사를 따로 적지 않는다. 배정은 지사 원장(branch_members)이 단일 원천이고,
 * 임직원 정보는 거기서 파생해 보여주기만 한다 — 양쪽에 적으면 한쪽만 고쳐질 때 서로 어긋난다.
 * 비활성 지사는 목록(useBranches 기본값)에서 빠지므로 자연히 표기에서도 사라진다.
 */
export function useEmployeeBranchNames() {
  const branchesQuery = useBranches()
  const membersQuery = useBranchMembers()

  // user_id → 지사명 목록(지사 정렬 순서 유지).
  const byUser = useMemo(() => {
    const map = new Map<string, string[]>()
    for (const b of branchesQuery.data ?? []) {
      for (const userId of membersQuery.data?.get(b.id) ?? []) {
        const arr = map.get(userId) ?? []
        arr.push(b.name)
        map.set(userId, arr)
      }
    }
    return map
  }, [branchesQuery.data, membersQuery.data])

  const branchNamesOf = useCallback(
    (userId: string): string[] => byUser.get(userId) ?? [],
    [byUser],
  )

  return {
    branchNamesOf,
    isLoading: branchesQuery.isLoading || membersQuery.isLoading,
  }
}
