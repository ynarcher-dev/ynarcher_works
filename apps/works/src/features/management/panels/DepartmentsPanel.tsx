import { Badge, Button, Select, Spinner } from '@ynarcher/ui'
import { RotateCcw, Table2, Trash2 } from 'lucide-react'
import { useEffect, useMemo, useState, type DragEvent } from 'react'
import { useDepartments, useEmployees } from '@/features/management/hooks'
import { DeptMemberModal } from '@/features/management/panels/DeptMemberModal'
import { DEPT_GRID, DeptTreeRow, dropPosFromEvent } from '@/features/management/panels/DeptTreeRow'
import { HrReflectPreview } from '@/features/management/panels/HrReflectPreview'
import { OrgLevelEditor } from '@/features/management/panels/OrgLevelEditor'
import {
  buildTree,
  canDrop,
  DATA_TOP_LEVEL_INDEX,
  DEFAULT_LEVELS,
  deletedRoots,
  deptNameMap,
  groupByDept,
  MOCK_VERSIONS,
  moveNode,
  subtreeIds,
  toEmployees,
  toNodes,
  type DeptNode,
  type DeptTreeNode,
  type DropPos,
  type Employee,
  type OrgLevel,
} from '@/features/management/panels/departmentsMock'

/**
 * 부서 관리 — 조직도 트리-테이블 목업(UI 전용, DB 미연동).
 * N-depth(그룹-팀 / 그룹-파트-팀 가변)를 parent_id 자기참조로 표현하고,
 * 연도별 조직 스냅샷(버전) 선택 · 인라인 편집 · 드래그 재배치 · soft delete를 확인하기 위한 화면이다.
 */
export function DepartmentsPanel() {
  // 실제 인사관리 데이터(부서/임직원)를 원천으로 로드한다. 구조·배치 편집은 스키마 확정 전까지
  // 로컬 상태에서만 반영하며(아직 DB 미기록), 인력 배치 리스트는 HR 화면과 동일한 실제 인원이다.
  const { data: deptRows, isLoading: deptLoading } = useDepartments()
  const { data: empRows, isLoading: empLoading } = useEmployees()

  const [nodes, setNodes] = useState<DeptNode[]>([])
  const [employees, setEmployees] = useState<Employee[]>([])
  const [levels, setLevels] = useState<OrgLevel[]>(DEFAULT_LEVELS)
  const [previewOpen, setPreviewOpen] = useState(false)
  const [versionId, setVersionId] = useState(MOCK_VERSIONS[0]!.id)
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [seq, setSeq] = useState(100)
  const [dragId, setDragId] = useState<string | null>(null)
  const [dropHint, setDropHint] = useState<{ id: string; pos: DropPos } | null>(null)
  const [memberDeptId, setMemberDeptId] = useState<string | null>(null)

  useEffect(() => {
    if (deptRows) setNodes(toNodes(deptRows, DEFAULT_LEVELS, DATA_TOP_LEVEL_INDEX))
  }, [deptRows])
  useEffect(() => {
    if (empRows) setEmployees(toEmployees(empRows))
  }, [empRows])

  const version = MOCK_VERSIONS.find((v) => v.id === versionId) ?? MOCK_VERSIONS[0]!
  const tree = useMemo(() => buildTree(nodes), [nodes])
  const removed = useMemo(() => deletedRoots(nodes), [nodes])
  const membersByDept = useMemo(() => groupByDept(employees), [employees])
  const deptNames = useMemo(() => deptNameMap(nodes), [nodes])
  const memberDept = memberDeptId ? nodes.find((n) => n.id === memberDeptId) : null

  /** 임직원 배치/해제(단일 소속). 인사/부서 양쪽이 공유하는 관계를 갱신한다. */
  const assign = (employeeId: string, deptId: string | null) =>
    setEmployees((prev) => prev.map((e) => (e.id === employeeId ? { ...e, deptId } : e)))

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
    if (editingId && name) {
      setNodes((prev) => prev.map((n) => (n.id === editingId ? { ...n, name } : n)))
    }
    setEditingId(null)
  }

  /** 자식 노드의 기본 레벨: 부모 레벨의 한 단계 아래(없으면 최상위/최하위로 보정). */
  const childLevelId = (parent: DeptNode | null): string => {
    if (!parent) return levels[0]?.id ?? ''
    const pi = levels.findIndex((l) => l.id === parent.levelId)
    return levels[Math.min(pi + 1, levels.length - 1)]?.id ?? parent.levelId
  }

  const addChild = (parentId: string | null) => {
    const parent = parentId ? nodes.find((n) => n.id === parentId) ?? null : null
    const siblings = nodes.filter((n) => n.parentId === parentId && !n.deleted)
    const id = `n${seq}`
    setSeq((s) => s + 1)
    setNodes((prev) => [
      ...prev,
      { id, parentId, name: '새 부서', levelId: childLevelId(parent), sort: siblings.length },
    ])
    if (parentId) setCollapsed((prev) => new Set([...prev].filter((x) => x !== parentId)))
    setEditingId(id)
    setDraft('새 부서')
  }

  const changeNodeLevel = (id: string, levelId: string) =>
    setNodes((prev) => prev.map((n) => (n.id === id ? { ...n, levelId } : n)))

  // --- 레벨 정의 편집(이름=인사관리 컬럼) ---
  const renameLevel = (id: string, name: string) =>
    setLevels((prev) => prev.map((l) => (l.id === id ? { ...l, name } : l)))
  const addLevel = () => {
    const id = `lv-${seq}`
    setSeq((s) => s + 1)
    setLevels((prev) => [...prev, { id, name: '새 레벨' }])
  }
  const removeLevel = (id: string) => {
    if (levels.length <= 1) return
    const fallback = levels.find((l) => l.id !== id)!.id
    setLevels((prev) => prev.filter((l) => l.id !== id))
    setNodes((prev) => prev.map((n) => (n.levelId === id ? { ...n, levelId: fallback } : n)))
  }

  const remove = (id: string) => {
    const ids = subtreeIds(nodes, id)
    setNodes((prev) => prev.map((n) => (ids.has(n.id) ? { ...n, deleted: true } : n)))
  }
  const restore = (id: string) => {
    const ids = subtreeIds(nodes, id)
    setNodes((prev) => prev.map((n) => (ids.has(n.id) ? { ...n, deleted: false } : n)))
  }
  /** 휴지통 비우기: soft delete된 조직을 물리 삭제(목업 — 되돌릴 수 없음). */
  const purge = () => {
    if (!window.confirm('삭제된 조직을 영구 삭제합니다. 되돌릴 수 없습니다. 계속할까요?')) return
    setNodes((prev) => prev.filter((n) => !n.deleted))
  }

  // --- 드래그 앤 드롭: 행 위 커서 위치로 앞/뒤/안쪽을 판정해 이동 ---
  const onDragOverRow = (e: DragEvent, id: string) => {
    if (!dragId || !canDrop(nodes, dragId, id)) return
    e.preventDefault()
    const pos = dropPosFromEvent(e)
    setDropHint((prev) => (prev?.id === id && prev.pos === pos ? prev : { id, pos }))
  }
  const onDropRow = (id: string) => {
    if (dragId && dropHint?.id === id) {
      setNodes((prev) => moveNode(prev, dragId, id, dropHint.pos))
    }
    setDragId(null)
    setDropHint(null)
  }
  const onDragEndRow = () => {
    setDragId(null)
    setDropHint(null)
  }

  if ((deptLoading && nodes.length === 0) || (empLoading && employees.length === 0)) {
    return <Spinner />
  }

  return (
    <div className="space-y-4">
      {/* 상단 도구막대: 조직 버전 선택 + 최상위 조직 추가 */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Select
            value={versionId}
            onChange={(e) => setVersionId(e.target.value)}
            className="max-w-44"
          >
            {MOCK_VERSIONS.map((v) => (
              <option key={v.id} value={v.id}>
                {v.label}
              </option>
            ))}
          </Select>
          <Badge tone={version.status === 'ACTIVE' ? 'success' : 'neutral'} size="sm">
            {version.status === 'ACTIVE' ? '활성' : '보관'}
          </Badge>
          <Button variant="outline" size="sm" disabled title="목업 — 미구현">
            새 연도 버전 복제
          </Button>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setPreviewOpen(true)}>
            <Table2 size={14} /> 인사 반영 미리보기
          </Button>
          <Button size="sm" onClick={() => addChild(null)}>
            + 최상위 조직 추가
          </Button>
        </div>
      </div>

      {/* 조직 레벨 정의(= 인사관리 컬럼) */}
      <OrgLevelEditor
        levels={levels}
        onRename={renameLevel}
        onAdd={addLevel}
        onRemove={removeLevel}
      />

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
          <p className="py-8 text-center text-body text-gray-400">등록된 부서가 없습니다.</p>
        ) : (
          tree.map((root) => (
            <DeptTreeRow
              key={root.id}
              node={root}
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
              onDelete={remove}
              onDragStartRow={setDragId}
              onDragOverRow={onDragOverRow}
              onDropRow={onDropRow}
              onDragEndRow={onDragEndRow}
            />
          ))
        )}
      </div>

      {/* 삭제된 조직(soft delete) */}
      {removed.length > 0 && (
        <div className="rounded-radius-md border border-dashed border-gray-300 bg-gray-25 p-3">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-caption font-semibold text-gray-500">삭제된 조직</p>
            <Button
              variant="ghost"
              size="sm"
              onClick={purge}
              className="h-7 gap-1 px-2 text-brand-700 hover:bg-brand-25 hover:text-brand-800"
            >
              <Trash2 size={13} /> 영구삭제
            </Button>
          </div>
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
                  <RotateCcw size={13} /> 복원
                </Button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <p className="text-caption text-gray-400">
        · UI 목업(DB 미연동) — 드래그로 순서·소속 변경(위/아래=형제, 가운데=하위 편입), 이름 클릭해 변경,
        레벨 셀렉트로 조직 계층 지정, 인원 칩으로 인력 배치. 레벨 정의가 인사관리 컬럼이 됩니다.
      </p>

      {memberDept && (
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

      <HrReflectPreview
        open={previewOpen}
        onClose={() => setPreviewOpen(false)}
        levels={levels}
        nodes={nodes}
        employees={employees}
      />
    </div>
  )
}
