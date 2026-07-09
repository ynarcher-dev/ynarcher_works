import { Button, Spinner } from '@ynarcher/ui'
import { useMemo, useState, type DragEvent } from 'react'
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
import { DeptMemberModal } from '@/features/management/panels/DeptMemberModal'
import { DEPT_GRID, DeptTreeRow, dropPosFromEvent } from '@/features/management/panels/DeptTreeRow'
import { OrgLevelEditor } from '@/features/management/panels/OrgLevelEditor'
import {
  buildTree,
  canDrop,
  deletedRoots,
  deptNameMap,
  groupByDept,
  moveNode,
  subtreeIds,
  toNodes,
  type DeptNode,
  type DeptTreeNode,
  type DropPos,
} from '@/features/management/panels/departmentsMock'

interface OrgTreeEditorProps {
  /** 편집/조회 대상 조직 버전(org_versions.id). */
  versionId: string
  /** 오늘의 유효 버전(인력 배치를 users.department_id로 미러할지 판단). */
  activeVersionId: string | null
  /** false면 읽기전용(조직 레벨 편집기·액션·드래그 숨김). 기본 true. */
  editable?: boolean
}

/**
 * 조직도 트리 편집기(버전 스코프). 조직 레벨 정의 + N-depth 트리-테이블 + 인력 배치를 담당하며,
 * 조직관리 패널(현재 조직)과 조직 개편 모달(초안 버전)이 동일 기능을 공유하기 위해 분리했다.
 * 모든 편집은 즉시 mutation으로 저장한다. editable=false면 조회 전용으로 렌더한다.
 */
export function OrgTreeEditor({ versionId, activeVersionId, editable = true }: OrgTreeEditorProps) {
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
  const tree = useMemo(() => buildTree(nodes), [nodes])
  const removed = useMemo(() => deletedRoots(nodes), [nodes])
  const membersByDept = useMemo(() => groupByDept(employees), [employees])
  const deptNames = useMemo(() => deptNameMap(nodes), [nodes])

  // 화면 전용(휘발) 상태
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [dragId, setDragId] = useState<string | null>(null)
  const [dropHint, setDropHint] = useState<{ id: string; pos: DropPos } | null>(null)
  const [memberDeptId, setMemberDeptId] = useState<string | null>(null)
  const memberDept = memberDeptId ? nodes.find((n) => n.id === memberDeptId) : null

  const toggle = (id: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const startEdit = (node: DeptTreeNode | DeptNode) => {
    setEditingId(node.id)
    setDraft(node.name)
  }
  const commitEdit = () => {
    const name = draft.trim()
    const cur = editingId ? nodes.find((n) => n.id === editingId) : null
    if (editingId && cur && name && cur.name !== name) {
      updateDept.mutate({ id: editingId, values: { name } })
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

  const addChild = (parentId: string | null) => {
    const parent = parentId ? nodes.find((n) => n.id === parentId) ?? null : null
    const siblings = nodes.filter((n) => n.parentId === parentId && !n.deleted)
    const sort = siblings.length ? Math.max(...siblings.map((s) => s.sort)) + 1 : 0
    createDept.mutate(
      {
        name: '새 부서',
        parent_id: parentId,
        level_id: childLevelId(parent),
        sort_order: sort,
        version_id: versionId,
      },
      {
        onSuccess: ({ id }) => {
          if (parentId) setCollapsed((prev) => new Set([...prev].filter((x) => x !== parentId)))
          setEditingId(id)
          setDraft('새 부서')
        },
      },
    )
  }

  const changeNodeLevel = (id: string, levelId: string) =>
    updateDept.mutate({ id, values: { level_id: levelId } })

  // 인사 미노출은 계보 단위(전 버전 일괄) — 활성/편집 버전이 달라도 일관 반영.
  const toggleHrHidden = (id: string, hidden: boolean) => {
    const node = nodes.find((n) => n.id === id)
    if (node) setHrHidden.mutate({ lineageId: node.lineageId, hidden })
  }

  const remove = (id: string) => setDeleted.mutate({ ids: [...subtreeIds(nodes, id)], deleted: true })
  const restore = (id: string) =>
    setDeleted.mutate({ ids: [...subtreeIds(nodes, id)], deleted: false })

  // --- 레벨 정의(= 인사관리 컬럼) ---
  const renameLevel = (id: string, name: string) => {
    const cur = levels.find((l) => l.id === id)
    if (cur && name.trim() && cur.name !== name.trim()) {
      updateLevel.mutate({ id, name: name.trim() })
    }
  }
  /** 새 티어(하위 볼륨): 최대 티어 + 1. 선택 버전 스코프. */
  const addTier = () => {
    const maxTier = levels.reduce((m, l) => Math.max(m, l.tier), -1)
    createLevel.mutate({ name: '새 레벨', sort_order: maxTier + 1, version_id: versionId })
  }
  /** 병렬 레벨: 지정 티어와 같은 값(같은 볼륨). 선택 버전 스코프. */
  const addParallel = (tier: number) =>
    createLevel.mutate({ name: '새 레벨', sort_order: tier, version_id: versionId })
  const removeLevel = (id: string) => {
    if (levels.length <= 1) return
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

  // --- 드래그 앤 드롭: 커서 위치로 앞/뒤/안쪽 판정 후 변경분만 저장 ---
  const onDragOverRow = (e: DragEvent, id: string) => {
    if (!dragId || !canDrop(nodes, dragId, id)) return
    e.preventDefault()
    const pos = dropPosFromEvent(e)
    setDropHint((prev) => (prev?.id === id && prev.pos === pos ? prev : { id, pos }))
  }
  const onDropRow = (id: string) => {
    if (dragId && dropHint?.id === id) {
      const next = moveNode(nodes, dragId, id, dropHint.pos)
      const byId = new Map(nodes.map((n) => [n.id, n]))
      const changed = next
        .filter((n) => {
          const o = byId.get(n.id)
          return o && (o.parentId !== n.parentId || o.sort !== n.sort)
        })
        .map((n) => ({ id: n.id, parent_id: n.parentId, sort_order: n.sort }))
      if (changed.length) moveDepts.mutate(changed)
    }
    setDragId(null)
    setDropHint(null)
  }
  const onDragEndRow = () => {
    setDragId(null)
    setDropHint(null)
  }

  if (
    !versionId ||
    (deptLoading && !deptRows) ||
    (levelLoading && !levelRows) ||
    (empLoading && !empRows) ||
    (memberLoading && !memberRows)
  ) {
    return <Spinner />
  }

  return (
    <div className="space-y-4">
      {/* 조직 레벨 정의(= 인사관리 컬럼) — 편집 모드에서만 */}
      {editable && (
        <div className="space-y-1">
          <OrgLevelEditor
            levels={levels}
            onRename={renameLevel}
            onAddTier={addTier}
            onAddParallel={addParallel}
            onRemove={removeLevel}
          />
          <p className="text-caption text-gray-400">
            · 조직 레벨(인사관리 컬럼)은 이 버전에만 적용되는 스냅샷입니다. 예정 버전에서의 변경은
            발효 전까지 현재 조직·인사에 영향을 주지 않습니다.
          </p>
        </div>
      )}

      {editable && (
        <div className="flex justify-end">
          <Button size="sm" onClick={() => addChild(null)} disabled={createDept.isPending}>
            + 최상위 조직 추가
          </Button>
        </div>
      )}

      {/* 트리-테이블 */}
      <div className="overflow-hidden rounded-radius-md border border-gray-200 bg-white">
        <div
          className={`${DEPT_GRID} items-center gap-2 border-b border-gray-200 bg-gray-50 py-2 pr-2 text-caption font-semibold text-gray-500`}
        >
          <span className="pl-2">조직명</span>
          <span>레벨</span>
          <span>인원</span>
          <span />
        </div>
        {tree.length === 0 ? (
          <p className="py-8 text-center text-body text-gray-400">등록된 조직이 없습니다.</p>
        ) : (
          tree.map((root) => (
            <DeptTreeRow
              key={root.id}
              node={root}
              editable={editable}
              collapsed={collapsed}
              editingId={editingId}
              draft={draft}
              dropHint={dropHint}
              membersByDept={membersByDept}
              levels={levels}
              onChangeLevel={changeNodeLevel}
              onManageMembers={setMemberDeptId}
              onDraftChange={setDraft}
              onToggle={toggle}
              onStartEdit={startEdit}
              onCommitEdit={commitEdit}
              onCancelEdit={() => setEditingId(null)}
              onAddChild={addChild}
              onToggleHrHidden={toggleHrHidden}
              onDelete={remove}
              onDragStartRow={setDragId}
              onDragOverRow={onDragOverRow}
              onDropRow={onDropRow}
              onDragEndRow={onDragEndRow}
            />
          ))
        )}
      </div>

      {/* 삭제된 조직(soft delete) — 복원만 제공(물리 삭제는 정책상 금지) */}
      {editable && removed.length > 0 && (
        <div className="rounded-radius-md border border-dashed border-gray-300 bg-gray-25 p-3">
          <p className="mb-2 text-caption font-semibold text-gray-500">삭제된 조직</p>
          <ul className="space-y-1">
            {removed.map((n) => (
              <li key={n.id} className="flex items-center gap-2 text-body text-gray-400">
                <span className="line-through">{n.name}</span>
                <span className="text-caption">(폐지)</span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => restore(n.id)}
                  className="ml-auto h-7 gap-1 px-2 text-gray-500"
                >
                  복원
                </Button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {editable && (
        <p className="text-caption text-gray-400">
          · 드래그로 순서·소속 변경(위/아래=형제, 가운데=하위 편입), 이름 클릭해 변경, 레벨 셀렉트로
          계층 지정, 인원 칩으로 인력 배치. 레벨 정의가 인사관리 컬럼이 됩니다. 모든 편집은 즉시
          저장됩니다.
        </p>
      )}

      {editable && memberDept && (
        <DeptMemberModal
          open={Boolean(memberDept)}
          onClose={() => setMemberDeptId(null)}
          deptId={memberDept.id}
          deptName={memberDept.name}
          employees={employees}
          deptNames={deptNames}
          onAssign={assign}
        />
      )}
    </div>
  )
}
