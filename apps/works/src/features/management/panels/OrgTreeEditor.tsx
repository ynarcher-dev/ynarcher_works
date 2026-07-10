import { Button, Spinner } from '@ynarcher/ui'
import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useState,
  type DragEvent,
} from 'react'
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
  /** ?몄쭛/議고쉶 ???議곗쭅 踰꾩쟾(org_versions.id). */
  versionId: string
  /** ?ㅻ뒛???좏슚 踰꾩쟾(?몃젰 諛곗튂瑜?users.department_id濡?誘몃윭?좎? ?먮떒). */
  activeVersionId: string | null
  /** false硫??쎄린?꾩슜(議곗쭅 ?덈꺼 ?몄쭛湲걔룹븸?샕룸뱶?섍렇 ?④?). 湲곕낯 true. */
  editable?: boolean
}

export interface OrgTreeEditorHandle {
  save: () => Promise<void>
  cancel: () => void
}

/**
 * 議곗쭅???몃━ ?몄쭛湲?踰꾩쟾 ?ㅼ퐫??. 議곗쭅 ?덈꺼 ?뺤쓽 + N-depth ?몃━-?뚯씠釉?+ ?몃젰 諛곗튂瑜??대떦?섎ŉ,
 * 議곗쭅愿由??⑤꼸(?꾩옱 議곗쭅)怨?議곗쭅 媛쒗렪 紐⑤떖(珥덉븞 踰꾩쟾)???숈씪 湲곕뒫??怨듭쑀?섍린 ?꾪빐 遺꾨━?덈떎.
 * 紐⑤뱺 ?몄쭛? 利됱떆 mutation?쇰줈 ??ν븳?? editable=false硫?議고쉶 ?꾩슜?쇰줈 ?뚮뜑?쒕떎.
 */
export const OrgTreeEditor = forwardRef<OrgTreeEditorHandle, OrgTreeEditorProps>(
function OrgTreeEditor({ versionId, activeVersionId, editable = true }, ref) {
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
  // ?뚯깮 ?곗씠???쒕쾭 ?먯쿇). ?몃젰 諛곗튂??"?좏깮 踰꾩쟾"??dept_members 湲곗?.
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

  // ?붾㈃ ?꾩슜(?섎컻) ?곹깭
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [levelDraftNames, setLevelDraftNames] = useState<Record<string, string>>({})
  const [deptNameDrafts, setDeptNameDrafts] = useState<Record<string, string>>({})
  const [deptLevelDrafts, setDeptLevelDrafts] = useState<Record<string, string>>({})
  const [dragId, setDragId] = useState<string | null>(null)
  const [dropHint, setDropHint] = useState<{ id: string; pos: DropPos } | null>(null)
  const [memberDeptId, setMemberDeptId] = useState<string | null>(null)
  const memberDept = memberDeptId ? nodes.find((n) => n.id === memberDeptId) : null

  useEffect(() => {
    setLevelDraftNames((prev) =>
      Object.fromEntries(levels.map((l) => [l.id, prev[l.id] ?? l.name])),
    )
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
    () =>
      levels.map((l) => ({
        ...l,
        name: levelDraftNames[l.id] ?? l.name,
      })),
    [levels, levelDraftNames],
  )
  const tree = useMemo(() => buildTree(stagedNodes), [stagedNodes])
  const deptNames = useMemo(() => deptNameMap(stagedNodes), [stagedNodes])
  const dirtyLevels = useMemo(
    () =>
      levels.filter((l) => {
        const next = levelDraftNames[l.id]?.trim()
        return next != null && next !== '' && next !== l.name
      }),
    [levels, levelDraftNames],
  )
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

  /** ?먯떇 ?몃뱶 湲곕낯 ?덈꺼: 遺紐??곗뼱??"?ㅼ쓬 ?곗뼱" 泥??덈꺼(?놁쑝硫?蹂댁젙). */
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
        name: '새 조직',
        parent_id: parentId,
        level_id: childLevelId(parent),
        sort_order: sort,
        version_id: versionId,
      },
      {
        onSuccess: ({ id }) => {
          if (parentId) setCollapsed((prev) => new Set([...prev].filter((x) => x !== parentId)))
          setEditingId(id)
          setDraft('새 조직')
        },
      },
    )
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

  // ?몄궗 誘몃끂異쒖? 怨꾨낫 ?⑥쐞(??踰꾩쟾 ?쇨큵) ???쒖꽦/?몄쭛 踰꾩쟾???щ씪???쇨? 諛섏쁺.
  const toggleHrHidden = (id: string, hidden: boolean) => {
    const node = nodes.find((n) => n.id === id)
    if (node) setHrHidden.mutate({ lineageId: node.lineageId, hidden })
  }

  const remove = (id: string) => setDeleted.mutate({ ids: [...subtreeIds(nodes, id)], deleted: true })
  const restore = (id: string) =>
    setDeleted.mutate({ ids: [...subtreeIds(nodes, id)], deleted: false })

  // --- ?덈꺼 ?뺤쓽(= ?몄궗愿由?而щ읆) ---
  const changeLevelDraftName = (id: string, name: string) =>
    setLevelDraftNames((prev) => ({ ...prev, [id]: name }))
  /** ???곗뼱(?섏쐞 蹂쇰ⅷ): 理쒕? ?곗뼱 + 1. ?좏깮 踰꾩쟾 ?ㅼ퐫?? */
  const addTier = () => {
    const maxTier = levels.reduce((m, l) => Math.max(m, l.tier), -1)
    createLevel.mutate({ name: '???덈꺼', sort_order: maxTier + 1, version_id: versionId })
  }
  /** 蹂묐젹 ?덈꺼: 吏???곗뼱? 媛숈? 媛?媛숈? 蹂쇰ⅷ). ?좏깮 踰꾩쟾 ?ㅼ퐫?? */
  const addParallel = (tier: number) =>
    createLevel.mutate({ name: '???덈꺼', sort_order: tier, version_id: versionId })
  const removeLevel = (id: string) => {
    if (levels.length <= 1) return
    const fallback = levels.find((l) => l.id !== id)?.id ?? null
    deleteLevel.mutate({ id, fallbackLevelId: fallback })
  }

  const cancelDrafts = () => {
    setLevelDraftNames(Object.fromEntries(levels.map((l) => [l.id, l.name])))
    setDeptNameDrafts({})
    setDeptLevelDrafts({})
    setEditingId(null)
    setDraft('')
  }

  const saveDrafts = async () => {
    const nextDeptNames = { ...deptNameDrafts }
    if (editingId) {
      const cur = nodes.find((n) => n.id === editingId)
      const name = draft.trim()
      if (cur && name && cur.name !== name) nextDeptNames[editingId] = name
      else if (editingId) delete nextDeptNames[editingId]
    }

    const deptById = new Map(nodes.map((n) => [n.id, n]))
    const nextDirtyDeptIds = nodes
      .filter((n) => {
        const nextName = nextDeptNames[n.id]?.trim()
        const nextLevelId = deptLevelDrafts[n.id]
        return (
          (nextName != null && nextName !== '' && nextName !== n.name) ||
          (nextLevelId != null && nextLevelId !== n.levelId)
        )
      })
      .map((n) => n.id)

    for (const lv of dirtyLevels) {
      await updateLevel.mutateAsync({ id: lv.id, name: levelDraftNames[lv.id]!.trim() })
    }
    for (const id of nextDirtyDeptIds) {
      const cur = deptById.get(id)
      if (!cur) continue
      const values: Record<string, unknown> = {}
      const nextName = nextDeptNames[id]?.trim()
      const nextLevelId = deptLevelDrafts[id]
      if (nextName && nextName !== cur.name) values.name = nextName
      if (nextLevelId && nextLevelId !== cur.levelId) values.level_id = nextLevelId
      if (Object.keys(values).length > 0) {
        await updateDept.mutateAsync({ id, values })
      }
    }
    setDeptNameDrafts({})
    setDeptLevelDrafts({})
    setEditingId(null)
    setDraft('')
  }

  useImperativeHandle(ref, () => ({
    save: saveDrafts,
    cancel: cancelDrafts,
  }))

  const assign = (employeeId: string, deptId: string | null) =>
    assignMember.mutate({
      versionId,
      userId: employeeId,
      departmentId: deptId,
      isActive: versionId === activeVersionId,
    })

  // --- ?쒕옒洹????쒕∼: 而ㅼ꽌 ?꾩튂濡??????덉そ ?먯젙 ??蹂寃쎈텇留????---
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
      {/* 議곗쭅 ?덈꺼 ?뺤쓽(= ?몄궗愿由?而щ읆) ???몄쭛 紐⑤뱶?먯꽌留?*/}
      {editable && (
        <div className="space-y-1">
          <OrgLevelEditor
            levels={stagedLevels}
            draftNames={levelDraftNames}
            onDraftNameChange={changeLevelDraftName}
            onAddTier={addTier}
            onAddParallel={addParallel}
            onRemove={removeLevel}
            onSave={() => void saveDrafts()}
            onCancel={cancelDrafts}
            structureActionsEnabled={false}
          />
          <p className="text-caption text-gray-400">
            쨌 議곗쭅 ?덈꺼(?몄궗愿由?而щ읆)? ??踰꾩쟾?먮쭔 ?곸슜?섎뒗 ?ㅻ깄?룹엯?덈떎. ?덉젙 踰꾩쟾?먯꽌??蹂寃쎌?
            諛쒗슚 ?꾧퉴吏 ?꾩옱 議곗쭅쨌?몄궗???곹뼢??二쇱? ?딆뒿?덈떎.
          </p>
        </div>
      )}

      {false && editable && (
        <div className="flex justify-end">
          <Button size="sm" onClick={() => addChild(null)} disabled={createDept.isPending}>
            + 理쒖긽??議곗쭅 異붽?
          </Button>
        </div>
      )}

      {/* ?몃━-?뚯씠釉?*/}
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
          <p className="py-8 text-center text-body text-gray-400">?깅줉??議곗쭅???놁뒿?덈떎.</p>
        ) : (
          tree.map((root) => (
            <DeptTreeRow
              key={root.id}
              node={root}
              editable={editable}
              structureActionsEnabled={false}
              collapsed={collapsed}
              editingId={editingId}
              draft={draft}
              dropHint={dropHint}
              membersByDept={membersByDept}
              levels={stagedLevels}
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

      {/* ??젣??議곗쭅(soft delete) ??蹂듭썝留??쒓났(臾쇰━ ??젣???뺤콉??湲덉?) */}
      {editable && removed.length > 0 && (
        <div className="rounded-radius-md border border-dashed border-gray-300 bg-gray-25 p-3">
          <p className="mb-2 text-caption font-semibold text-gray-500">??젣??議곗쭅</p>
          <ul className="space-y-1">
            {removed.map((n) => (
              <li key={n.id} className="flex items-center gap-2 text-body text-gray-400">
                <span className="line-through">{n.name}</span>
                <span className="text-caption">(?먯?)</span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => restore(n.id)}
                  className="ml-auto h-7 gap-1 px-2 text-gray-500"
                >
                  蹂듭썝
                </Button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <p className="text-caption text-gray-400">
        議곗쭅紐낃낵 ?덈꺼 蹂寃쎌? ?붾㈃??癒쇱? 諛섏쁺?????곷떒 ???踰꾪듉?쇰줈 ?④퍡 ??λ맗?덈떎. ?쒕옒洹??대룞,
        異붽?/??젣, ?몃젰 諛곗튂??踰꾪듉 ?숈옉 利됱떆 諛섏쁺?⑸땲??
      </p>

      {false && editable && (
        <p className="text-caption text-gray-400">
          쨌 ?쒕옒洹몃줈 ?쒖꽌쨌?뚯냽 蹂寃????꾨옒=?뺤젣, 媛?대뜲=?섏쐞 ?몄엯), ?대쫫 ?대┃??蹂寃? ?덈꺼 ??됲듃濡?          怨꾩링 吏?? ?몄썝 移⑹쑝濡??몃젰 諛곗튂. ?덈꺼 ?뺤쓽媛 ?몄궗愿由?而щ읆???⑸땲?? 紐⑤뱺 ?몄쭛? 利됱떆
          ??λ맗?덈떎.
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
})
