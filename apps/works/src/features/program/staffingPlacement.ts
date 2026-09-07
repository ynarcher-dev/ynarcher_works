import { useMemo } from 'react'
import {
  deptLeafLabel,
  deptPathLabel,
  nearestScopedAncestor,
} from '@/features/management/departmentOptions'
import {
  activeOrgVersionId,
  useDepartments,
  useDeptMembers,
  useOrgVersions,
} from '@/features/management/orgHooks'
import { useEmployees } from '@/features/hub/hooks'
import type { ProgramDepartmentSegment } from '@/features/program/staffingTypes'

/**
 * 한 단계(org 버전)에서 **사람이 어느 사업 지정 부서에 속하는가**를 답하는 판정 묶음.
 *
 * 담당자의 부서는 고르는 값이 아니라 사람에게 종속된 값이다 — 그 단계 조직도에서 본인이 배치된
 * 부서를 사업 지정 부서로 접어 올린 결과가 곧 저장값이다. 이 판정이 컴포넌트가 아니라 훅에 사는
 * 이유는 부서 카드마다(그리고 지정 부서 밖 묶음에서도) 같은 답이 필요하기 때문이다 — 카드마다
 * 다시 계산하면 조직도·배치 조회가 카드 수만큼 늘고, 무엇보다 같은 사람이 카드마다 다른 부서로
 * 판정될 여지가 생긴다.
 */
export function useStaffingPlacement(versionId: string, departments: ProgramDepartmentSegment[]) {
  const { data: employees } = useEmployees()
  // 소속 판정은 이 단계의 조직 버전 기준이다. 부서 트리와 인력 배치를 그 버전에서 읽는다.
  const { data: master } = useDepartments(false, versionId)
  const { data: members } = useDeptMembers(versionId)
  const { data: versions } = useOrgVersions()
  const isActivePhase = versions ? activeOrgVersionId(versions) === versionId : false

  const list = employees ?? []
  const byId = useMemo(() => new Map(list.map((e) => [e.id, e] as const)), [list])
  const placementMap = useMemo(
    () => new Map((members ?? []).map((m) => [m.user_id, m.department_id] as const)),
    [members],
  )
  const scope = useMemo(
    () => new Set(departments.map((d) => d.department_id).filter(Boolean)),
    [departments],
  )

  /**
   * 이 단계 조직 버전에서 그 사람이 배치된 부서. 배치 원장(dept_members)이 원천이며, 행이 없을
   * 때만 users.department_id 미러로 채운다 — 미러는 활성 버전 값이라 다른 단계에는 쓸 수 없다.
   */
  const placementOf = (userId: string): string | null =>
    placementMap.get(userId) ?? (isActivePhase ? byId.get(userId)?.department_id ?? null : null)

  /** 그 사람이 속한 사업 지정 부서(자기 부서에서 위로 접어 올린 결과). 지정 부서 밖이면 null. */
  const programDeptOf = (userId: string): string | null =>
    nearestScopedAncestor(master ?? [], placementOf(userId), scope)

  /**
   * 조직도·배치가 도착했는가. 도착 전에 판정하면 전원이 '지정 부서 밖'으로 보여, 되맞춤이
   * 이미 저장된 담당자의 부서를 지워 버린다.
   */
  const ready = master !== undefined && (members !== undefined || isActivePhase)

  return {
    ready,
    /** 이 단계 지정 부서가 하나라도 정해졌는가. */
    hasScope: scope.size > 0,
    /** 내부 사용자 전체(게스트는 useEmployees가 이미 걸러 낸다). */
    employees: list,
    nameOf: (userId: string) => byId.get(userId)?.name ?? '알 수 없음',
    /** 부서명은 말단 하나로 적고 전체 경로는 툴팁이 답한다 — 사업 목록·상세와 같은 표기. */
    deptName: (id: string) => deptLeafLabel(master ?? [], id) || '부서 미지정',
    deptPath: (id: string) => deptPathLabel(master ?? [], id),
    /** 그 사람의 실제 소속(사업 지정 부서로 접기 전) — 동명이인을 가리는 후보 목록 표기용. */
    placementLabelOf: (userId: string) => deptLeafLabel(master ?? [], placementOf(userId)),
    placementPathOf: (userId: string) => deptPathLabel(master ?? [], placementOf(userId)),
    programDeptOf,
    /** 이 부서(하위 포함)에 배치된 인력. 지정 부서 밖 사람은 배정해도 서버가 되돌린다. */
    candidatesFor: (deptId: string) =>
      ready && deptId ? list.filter((e) => programDeptOf(e.id) === deptId) : [],
  }
}

export type StaffingPlacement = ReturnType<typeof useStaffingPlacement>
