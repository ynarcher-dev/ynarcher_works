/**
 * 조직 편집 세션 훅 — 한 조직 버전을 고치는 데 필요한 원장·파생값·동작을 한 덩어리로 모은다.
 *
 * 편집 화면이 여러 조각(좌측 트리·우측 인력 배치·조직 레벨 모달·삭제 조직 모달·툴바의 저장/취소)으로
 * 나뉘는데, 이들이 각자 데이터를 읽고 각자 저장하면 같은 초안을 두고 서로 다른 상태를 갖게 된다.
 * 그래서 상태와 뮤테이션은 여기 한 곳에 두고 화면 조각들은 이 훅이 준 것만 그린다.
 *
 * 저장 규칙은 두 갈래다 — 구조를 바꾸는 일(추가·삭제·이동·배치·레벨 정의)은 즉시 서버에 쓰고,
 * 타이핑으로 고치는 값(조직명·조직의 레벨 지정)만 초안으로 모아 두었다가 저장에서 함께 쓴다.
 * 타이핑 한 글자마다 쓰면 되돌릴 자리가 없어지고, 반대로 전부 초안으로 모으면 트리 이동 같은
 * 되돌리기 어려운 편집까지 화면에만 있는 상태가 되어 새로고침 한 번에 사라진다.
 */
import { useToast } from '@ynarcher/ui'
import { useEffect, useMemo, useState } from 'react'
import {
  useAssignDeptMember,
  useCreateDepartment,
  useCreateOrgLevel,
  useDeleteOrgLevel,
  useDepartments,
  useDeptMembers,
  useEmployees,
  useMoveDepartments,
  useOrgLevels,
  useSetDepartmentsDeleted,
  useSetDeptHrHidden,
  useUpdateDepartment,
  useUpdateOrgLevel,
} from '@/features/management/hooks'
import {
  buildTree,
  deletedRoots,
  groupByDept,
  moveNode,
  subtreeIds,
  toNodes,
  type DeptNode,
  type DropPos,
} from '@/features/management/panels/departmentsMock'
import { deptPath, deptPathNames } from '@/features/management/panels/directoryModel'

export function useOrgEditing(versionId: string, activeVersionId: string | null) {
  const toast = useToast()
  const { data: deptRows, isLoading: deptLoading } = useDepartments(true, versionId || undefined)
  const { data: levelRows, isLoading: levelLoading } = useOrgLevels(versionId || undefined)
  const { data: empRows, isLoading: empLoading } = useEmployees()
  const { data: memberRows, isLoading: memberLoading } = useDeptMembers(versionId || undefined)

  const createDept = useCreateDepartment()
  const updateDept = useUpdateDepartment()
  const moveDepts = useMoveDepartments()
  const setDeleted = useSetDepartmentsDeleted()
  const setHrHidden = useSetDeptHrHidden()
  const createLevel = useCreateOrgLevel()
  const updateLevel = useUpdateOrgLevel()
  const deleteLevel = useDeleteOrgLevel()
  const assignMember = useAssignDeptMember()

  // 파생 데이터(서버 원천). 인력 배치는 "선택 버전"의 dept_members 기준.
  const nodes = useMemo(() => toNodes(deptRows ?? []), [deptRows])
  const levels = useMemo(() => levelRows ?? [], [levelRows])
  const placement = useMemo(() => {
    const m = new Map<string, string>()
    for (const r of memberRows ?? []) m.set(r.user_id, r.department_id)
    return m
  }, [memberRows])
  const employees = useMemo(
    () => (empRows ?? []).map((e) => ({ id: e.id, name: e.name, deptId: placement.get(e.id) ?? null })),
    [empRows, placement],
  )
  const removed = useMemo(() => deletedRoots(nodes), [nodes])
  const membersByDept = useMemo(() => groupByDept(employees), [employees])

  // 초안(저장 전까지 화면에만 있는 값)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [levelDraftNames, setLevelDraftNames] = useState<Record<string, string>>({})
  const [deptNameDrafts, setDeptNameDrafts] = useState<Record<string, string>>({})
  const [deptLevelDrafts, setDeptLevelDrafts] = useState<Record<string, string>>({})

  useEffect(() => {
    setLevelDraftNames((prev) => Object.fromEntries(levels.map((l) => [l.id, prev[l.id] ?? l.name])))
  }, [levels])

  const stagedNodes = useMemo(
    () =>
      nodes.map((n) => ({
        ...n,
        name: deptNameDrafts[n.id] ?? n.name,
        levelId: deptLevelDrafts[n.id] ?? n.levelId,
      })),
    [nodes, deptNameDrafts, deptLevelDrafts],
  )
  const stagedLevels = useMemo(
    () => levels.map((l) => ({ ...l, name: levelDraftNames[l.id] ?? l.name })),
    [levels, levelDraftNames],
  )
  const tree = useMemo(() => buildTree(stagedNodes), [stagedNodes])
  // 소속 표기는 부서명 한 토막이 아니라 최상위까지의 전체 경로다 — 같은 이름의 실·팀이 여러
  // 본부에 있어 '3팀'만으로는 어느 조직인지 갈리지 않는다(부서 정보 화면과 같은 규칙).
  const pathOf = (deptId: string) => deptPath(stagedNodes, deptId)
  const pathNamesOf = (deptId: string) => deptPathNames(stagedNodes, deptId)

  const startRename = (node: DeptNode | { id: string; name: string }) => {
    setEditingId(node.id)
    setDraft(node.name)
  }
  const commitRename = () => {
    const name = draft.trim()
    const cur = editingId ? nodes.find((n) => n.id === editingId) : null
    if (editingId && cur && name) {
      setDeptNameDrafts((prev) => {
        const next = { ...prev }
        if (cur.name === name) delete next[editingId]
        else next[editingId] = name
        return next
      })
    }
    setEditingId(null)
  }

  /** 자식 노드 기본 레벨: 부모 티어의 "다음 티어" 첫 레벨(없으면 보정). */
  const childLevelId = (parent: DeptNode | null): string | null => {
    if (!levels.length) return null
    if (!parent) {
      const firstTier = Math.min(...levels.map((l) => l.tier))
      return levels.find((l) => l.tier === firstTier)?.id ?? null
    }
    const parentLevel = levels.find((l) => l.id === parent.levelId)
    const parentTier = parentLevel?.tier ?? Number.NEGATIVE_INFINITY
    const higher = levels.filter((l) => l.tier > parentTier)
    if (!higher.length) return parentLevel?.id ?? levels[0]?.id ?? null
    const nextTier = Math.min(...higher.map((l) => l.tier))
    return levels.find((l) => l.tier === nextTier)?.id ?? parentLevel?.id ?? null
  }

  /** 조직 추가(부모 없으면 최상위). 만든 즉시 이름 편집 상태로 두고 새 id를 돌려준다. */
  const addDept = async (parentId: string | null): Promise<string> => {
    const parent = parentId ? nodes.find((n) => n.id === parentId) ?? null : null
    const siblings = nodes.filter((n) => n.parentId === parentId && !n.deleted)
    const sort = siblings.length ? Math.max(...siblings.map((s) => s.sort)) + 1 : 0
    const { id } = await createDept.mutateAsync({
      name: '새 조직',
      parent_id: parentId,
      level_id: childLevelId(parent),
      sort_order: sort,
      version_id: versionId,
    })
    setEditingId(id)
    setDraft('새 조직')
    return id
  }

  const changeNodeLevel = (id: string, levelId: string) => {
    const cur = nodes.find((n) => n.id === id)
    setDeptLevelDrafts((prev) => {
      const next = { ...prev }
      if (!cur || cur.levelId === levelId) delete next[id]
      else next[id] = levelId
      return next
    })
  }

  // 인사 미노출은 계보 단위(전 버전 일괄) — 활성/편집 버전이 달라도 일관 반영.
  const toggleHrHidden = (id: string, hidden: boolean) => {
    const node = nodes.find((n) => n.id === id)
    if (node) setHrHidden.mutate({ lineageId: node.lineageId, hidden })
  }

  /**
   * 조직 삭제(하위 동반). 배치는 화면이 아니라 DB 트리거(trg_departments_clear_members)가 끊는다 —
   * 화면에서 사람 수만큼 요청을 돌리면 중간에 끊겼을 때 절반만 정리된 상태가 남는다.
   */
  const remove = (id: string) => setDeleted.mutate({ ids: [...subtreeIds(nodes, id)], deleted: true })
  /** 복원은 조직만 되살린다 — 배치는 삭제 시점에 끊겼고, 누구를 되돌릴지는 사람이 정할 일이다. */
  const restore = (id: string) =>
    setDeleted.mutate({ ids: [...subtreeIds(nodes, id)], deleted: false })

  // --- 조직 레벨 정의(= 인사관리 컬럼) ---
  const changeLevelDraftName = (id: string, name: string) =>
    setLevelDraftNames((prev) => ({ ...prev, [id]: name }))
  /** 새 티어(하위 계층): 최대 티어 + 1. 선택 버전 스코프. */
  const addTier = () => {
    const maxTier = levels.reduce((m, l) => Math.max(m, l.tier), -1)
    createLevel.mutate({ name: '새 레벨', sort_order: maxTier + 1, version_id: versionId })
  }
  /** 병렬 레벨: 지정 티어와 같은 값(같은 계층). 선택 버전 스코프. */
  const addParallel = (tier: number) =>
    createLevel.mutate({ name: '새 레벨', sort_order: tier, version_id: versionId })
  const removeLevel = (id: string) => {
    // 마지막 레벨까지 지우면 부서가 가리킬 레벨이 없어진다(인사관리 컬럼도 사라진다).
    if (levels.length <= 1) {
      toast.show('마지막 조직 레벨은 삭제할 수 없습니다.', 'warning')
      return
    }
    const fallback = levels.find((l) => l.id !== id)?.id ?? null
    deleteLevel.mutate({ id, fallbackLevelId: fallback })
  }

  const assign = (employeeId: string, deptId: string | null) =>
    assignMember.mutate({
      versionId,
      userId: employeeId,
      departmentId: deptId,
      isActive: versionId === activeVersionId,
    })

  /** 드래그 이동: 변경된 형제 순서·부모만 골라 저장한다. */
  const move = (dragId: string, targetId: string, pos: DropPos) => {
    const next = moveNode(nodes, dragId, targetId, pos)
    const byId = new Map(nodes.map((n) => [n.id, n]))
    const changed = next
      .filter((n) => {
        const o = byId.get(n.id)
        return o && (o.parentId !== n.parentId || o.sort !== n.sort)
      })
      .map((n) => ({ id: n.id, parent_id: n.parentId, sort_order: n.sort }))
    if (changed.length) moveDepts.mutate(changed)
  }

  const cancel = () => {
    setLevelDraftNames(Object.fromEntries(levels.map((l) => [l.id, l.name])))
    setDeptNameDrafts({})
    setDeptLevelDrafts({})
    setEditingId(null)
    setDraft('')
  }

  const save = async () => {
    // 편집 중이던 입력도 저장 대상에 포함한다 — 저장을 누르려면 입력에서 포커스가 빠지는데,
    // 그 순간 타이핑 중이던 값이 사라지면 "저장했는데 안 바뀐" 것으로 보인다.
    const nextDeptNames = { ...deptNameDrafts }
    if (editingId) {
      const cur = nodes.find((n) => n.id === editingId)
      const name = draft.trim()
      if (cur && name && cur.name !== name) nextDeptNames[editingId] = name
      else delete nextDeptNames[editingId]
    }

    const deptById = new Map(nodes.map((n) => [n.id, n]))
    const dirtyDeptIds = nodes
      .filter((n) => {
        const nextName = nextDeptNames[n.id]?.trim()
        const nextLevelId = deptLevelDrafts[n.id]
        return (
          (nextName != null && nextName !== '' && nextName !== n.name) ||
          (nextLevelId != null && nextLevelId !== n.levelId)
        )
      })
      .map((n) => n.id)

    const dirtyLevels = levels.filter((l) => {
      const next = levelDraftNames[l.id]?.trim()
      return next != null && next !== '' && next !== l.name
    })

    for (const lv of dirtyLevels) {
      await updateLevel.mutateAsync({ id: lv.id, name: levelDraftNames[lv.id]!.trim() })
    }
    for (const id of dirtyDeptIds) {
      const cur = deptById.get(id)
      if (!cur) continue
      const values: Record<string, unknown> = {}
      const nextName = nextDeptNames[id]?.trim()
      const nextLevelId = deptLevelDrafts[id]
      if (nextName && nextName !== cur.name) values.name = nextName
      if (nextLevelId && nextLevelId !== cur.levelId) values.level_id = nextLevelId
      if (Object.keys(values).length > 0) await updateDept.mutateAsync({ id, values })
    }
    setDeptNameDrafts({})
    setDeptLevelDrafts({})
    setEditingId(null)
    setDraft('')
  }

  const loading =
    !versionId ||
    (deptLoading && !deptRows) ||
    (levelLoading && !levelRows) ||
    (empLoading && !empRows) ||
    (memberLoading && !memberRows)

  return {
    loading,
    nodes,
    tree,
    levels: stagedLevels,
    levelDraftNames,
    employees,
    membersByDept,
    /** 부서 id → 최상위부터의 전체 소속 경로(예: '와이앤아처 > AC본부 > 로컬라이즈그룹 > 3팀'). */
    pathOf,
    /** 같은 경로를 조각으로. 머리글처럼 상위와 말단을 다르게 그릴 때 쓴다. */
    pathNamesOf,
    removed,
    editingId,
    draft,
    setDraft,
    startRename,
    commitRename,
    cancelRename: () => setEditingId(null),
    addDept,
    changeNodeLevel,
    toggleHrHidden,
    remove,
    restore,
    changeLevelDraftName,
    addTier,
    addParallel,
    removeLevel,
    assign,
    move,
    save,
    cancel,
  }
}

export type OrgEditing = ReturnType<typeof useOrgEditing>
