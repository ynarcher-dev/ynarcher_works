import { useCallback, useMemo } from 'react'
import { useEmployees } from '@/features/hub/hooks'
import { useDepartments, useOrgLevels } from '@/features/management/orgHooks'
import { ancestorPath, toNodes } from '@/features/management/panels/departmentsMock'
import { useBranchMembers, useBranches } from '@/features/office/branches/branchesApi'

/** 조직 경로 한 마디(상위→하위 중 하나). */
export interface BranchMemberOrgStep {
  id: string
  name: string
  /** 그 조직의 레벨명(소속·본부·그룹 등). 레벨 미지정이면 null. */
  levelName: string | null
}

/** 상주인력 1명의 표기 단위 — 이름과 조직관리에서 배치된 자리(루트→소속 전체 경로). */
export interface BranchMemberEntry {
  id: string
  name: string
  /** 최상위 조직부터 직접 소속까지. 아직 배치 전이면 빈 배열. */
  orgPath: BranchMemberOrgStep[]
}

/** 조직 경로 한 줄. 아직 배치 전이면 그 사실을 적는다 — 빈 줄은 '없음'인지 '못 읽었는지' 말하지 못한다. */
export function branchMemberOrgLabel(entry: BranchMemberEntry): string {
  return entry.orgPath.length > 0 ? entry.orgPath.map((step) => step.name).join(' · ') : '조직 미배치'
}

/**
 * 임직원 한 명을 "이름 + 조직관리에서 배치된 자리"로 읽는 훅.
 *
 * 자리는 임직원 원장에 따로 적지 않고 조직관리(users.department_id → departments → org_levels)에서
 * 파생한다 — 조직 개편으로 배치가 바뀌면 지사 표기도 자동으로 따라간다.
 * 레벨 수는 조직관리에서 동적으로 늘고 줄기 때문에 직접 소속만 찍지 않고 루트까지의 조상 경로를
 * 통째로 만든다(예: 와이앤아처 · 지원본부 · 경영지원2실). 인사 미노출(hr_hidden) 조직은
 * 인사관리 컬럼과 같은 기준으로 경로에서 건너뛴다.
 * 부서·레벨은 오늘의 유효 조직 버전 스코프다(useDepartments/useOrgLevels 기본값).
 *
 * 지사에 매인 훅이 아니라 사람 한 명을 읽는 훅인 이유는 **같은 줄이 세 자리에 서기** 때문이다 —
 * OFFICE 상세의 명단, MANAGEMENT 수정 창의 오른쪽 기둥(이 지사 상주인력), 그 왼쪽 기둥(임직원
 * 원장 전체). 셋이 같은 생김새여야 하고, 그러려면 이름과 자리를 만드는 자리가 하나여야 한다.
 */
export function useEmployeeOrgEntries() {
  const employeesQuery = useEmployees()
  const { data: departments } = useDepartments()
  const { data: levels } = useOrgLevels()

  const employeeById = useMemo(
    () => new Map((employeesQuery.data ?? []).map((e) => [e.id, e] as const)),
    [employeesQuery.data],
  )
  const nodes = useMemo(() => toNodes(departments ?? []), [departments])
  const levelNameById = useMemo(
    () => new Map((levels ?? []).map((l) => [l.id, l.name] as const)),
    [levels],
  )

  /** 임직원 한 명. 조회 불가한 계정이면 null(표기에서 제외하거나 화면이 대체 문구를 세운다). */
  const entryOf = useCallback(
    (userId: string): BranchMemberEntry | null => {
      const employee = employeeById.get(userId)
      if (!employee) return null
      const path = employee.department_id ? ancestorPath(nodes, employee.department_id) : []
      return {
        id: userId,
        name: employee.name,
        orgPath: path
          .filter((n) => !n.hrHidden)
          .map((n) => ({
            id: n.id,
            name: n.name,
            levelName: levelNameById.get(n.levelId) ?? null,
          })),
      }
    },
    [employeeById, nodes, levelNameById],
  )

  /** 조회 가능한 임직원 전체(이름순 — 원장 조회가 정한 순서 그대로). */
  const entries = useMemo(
    () =>
      (employeesQuery.data ?? []).flatMap((e) => {
        const entry = entryOf(e.id)
        return entry ? [entry] : []
      }),
    [employeesQuery.data, entryOf],
  )

  return { entryOf, entries, isLoading: employeesQuery.isLoading }
}

/**
 * 지사 상주인력을 "이름 + 배치된 자리"로 읽는 훅.
 * branch_members는 user_id만 갖고, 이름과 자리는 임직원·조직 원장(MANAGEMENT 소유)에서 붙인다 —
 * 지사 원장에 이름을 비정규화해 두면 임직원 개명·퇴사·조직 개편이 반영되지 않기 때문이다.
 */
export function useBranchMemberEntries() {
  const membersQuery = useBranchMembers()
  const { entryOf, isLoading } = useEmployeeOrgEntries()

  /** 지사의 상주인력(배정 순서 유지). 조회 불가한 계정은 표기에서 제외한다. */
  const entriesOf = useCallback(
    (branchId: string): BranchMemberEntry[] =>
      (membersQuery.data?.get(branchId) ?? []).flatMap((userId) => {
        const entry = entryOf(userId)
        return entry ? [entry] : []
      }),
    [membersQuery.data, entryOf],
  )

  /**
   * 지사의 상주인력 id 목록(폼 초기값).
   *
   * 표기와 달리 조회 불가한 계정도 그대로 든다 — 여기서 걸러 내면 담당자가 전화번호 한 칸만
   * 고치고 저장해도 그 사람이 조용히 명단에서 빠진다.
   */
  const idsOf = useCallback(
    (branchId: string): string[] => membersQuery.data?.get(branchId) ?? [],
    [membersQuery.data],
  )

  return { entriesOf, idsOf, isLoading: isLoading || membersQuery.isLoading }
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
