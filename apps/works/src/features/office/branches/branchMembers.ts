import { useCallback, useMemo } from 'react'
import { useEmployees } from '@/features/hub/hooks'
import { useBranchMembers } from '@/features/office/branches/branchesApi'

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
