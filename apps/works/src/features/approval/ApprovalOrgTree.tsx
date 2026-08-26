import { Checkbox, IconButton, cn, tableText } from '@ynarcher/ui'
import { ChevronRight } from 'lucide-react'
import { useMemo, useState } from 'react'
import {
  buildTree,
  toNodes,
  type DeptTreeNode,
} from '@/features/management/panels/departmentsMock'
import { useDepartments, useDeptMembers, useOrgVersions, activeOrgVersionId } from '@/features/management/orgHooks'
import { useEmployees } from '@/features/management/hooks'
import { useJobTitleLabel } from '@/features/management/jobTitleHooks'

export interface OrgPerson {
  id: string
  name: string
  /** 직급·직책 표기(결재선 표의 도장 위 칸에 적힌다). */
  title: string
  /** 소속 부서 경로의 마지막 조직명. */
  deptName: string
}

interface ApprovalOrgTreeProps {
  keyword: string
  /** 지금 체크된 사람. */
  checked: Set<string>
  onCheckedChange: (next: Set<string>) => void
  /** 후보에서 뺄 사람(기안자 본인·이미 결재선에 든 사람). */
  excludeIds: Set<string>
  /** 사람 원장(모달이 이름·직책을 함께 쓰므로 밖으로 올려 준다). */
  onPeopleLoaded?: (people: Map<string, OrgPerson>) => void
}

/** 부서 하위(자손 포함)의 사람 id를 모은다. */
function collectMembers(node: DeptTreeNode, byDept: Map<string, OrgPerson[]>): string[] {
  const own = (byDept.get(node.id) ?? []).map((p) => p.id)
  return [...own, ...node.children.flatMap((c) => collectMembers(c, byDept))]
}

/**
 * 결재선 지정용 조직 트리 — 부서를 펼쳐 사람을 체크한다.
 *
 * 이름을 알고 있으면 검색이 빠르지만, 결재선을 짤 때 실제로 필요한 질문은 대개 "그 부서의
 * 누구인가"다. 그래서 이름 검색과 조직 펼치기를 함께 둔다 — 검색 중에는 트리를 접고 맞는
 * 사람만 평평하게 편다(검색어에 맞는 사람이 어느 부서에 있는지는 각 행이 소속으로 답한다).
 *
 * 보이는 조직은 **오늘의 유효 버전** 하나다(임직원 정보 화면과 같은 규칙).
 */
export function ApprovalOrgTree({
  keyword,
  checked,
  onCheckedChange,
  excludeIds,
  onPeopleLoaded,
}: ApprovalOrgTreeProps) {
  const { data: versions } = useOrgVersions()
  const versionId = useMemo(() => activeOrgVersionId(versions ?? []), [versions])
  const { data: deptRows } = useDepartments(false, versionId ?? undefined)
  const { data: memberRows } = useDeptMembers(versionId ?? undefined)
  const { data: empRows } = useEmployees()
  const jobTitle = useJobTitleLabel()

  const nodes = useMemo(() => toNodes(deptRows ?? []), [deptRows])
  const tree = useMemo(() => buildTree(nodes), [nodes])
  const deptNameById = useMemo(
    () => new Map(nodes.map((n) => [n.id, n.name])),
    [nodes],
  )

  // 부서 id → 그 부서에 직접 배치된 사람.
  const byDept = useMemo(() => {
    const placement = new Map<string, string>()
    for (const r of memberRows ?? []) placement.set(r.user_id, r.department_id)
    const m = new Map<string, OrgPerson[]>()
    for (const e of empRows ?? []) {
      const deptId = placement.get(e.id)
      if (!deptId) continue
      const profile = (e.profile ?? {}) as Record<string, unknown>
      const rank = typeof profile.rank === 'string' ? profile.rank : ''
      const position = typeof profile.position === 'string' ? profile.position : ''
      const list = m.get(deptId) ?? []
      list.push({
        id: e.id,
        name: e.name,
        title: jobTitle(rank, position),
        deptName: deptNameById.get(deptId) ?? '',
      })
      m.set(deptId, list)
    }
    return m
  }, [memberRows, empRows, jobTitle, deptNameById])

  // 사람 원장을 밖으로 한 번 올려 준다(모달의 오른쪽 목록이 이름·직책을 그린다).
  const allPeople = useMemo(() => {
    const m = new Map<string, OrgPerson>()
    for (const list of byDept.values()) for (const p of list) m.set(p.id, p)
    return m
  }, [byDept])
  const loadedRef = useMemo(() => ({ sent: false }), [])
  if (!loadedRef.sent && allPeople.size > 0) {
    loadedRef.sent = true
    onPeopleLoaded?.(allPeople)
  }

  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const toggleCollapse = (id: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const togglePerson = (id: string) => {
    const next = new Set(checked)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    onCheckedChange(next)
  }

  const toggleDept = (node: DeptTreeNode) => {
    const ids = collectMembers(node, byDept).filter((id) => !excludeIds.has(id))
    const allChecked = ids.length > 0 && ids.every((id) => checked.has(id))
    const next = new Set(checked)
    for (const id of ids) {
      if (allChecked) next.delete(id)
      else next.add(id)
    }
    onCheckedChange(next)
  }

  const q = keyword.trim().toLowerCase()

  // 검색 중에는 트리를 접고 맞는 사람만 평평하게 편다.
  if (q) {
    const matched = [...allPeople.values()].filter(
      (p) =>
        !excludeIds.has(p.id) &&
        (p.name.toLowerCase().includes(q) ||
          p.title.toLowerCase().includes(q) ||
          p.deptName.toLowerCase().includes(q)),
    )
    return (
      <div className="h-80 overflow-auto rounded-radius-md border border-gray-200 p-2">
        {matched.length === 0 ? (
          <p className={cn('py-6 text-center', tableText.empty)}>검색 결과가 없습니다.</p>
        ) : (
          matched.map((p) => (
            <PersonRow
              key={p.id}
              person={p}
              checked={checked.has(p.id)}
              onToggle={() => togglePerson(p.id)}
              showDept
            />
          ))
        )}
      </div>
    )
  }

  return (
    <div className="h-80 overflow-auto rounded-radius-md border border-gray-200 p-2">
      {tree.length === 0 ? (
        <p className={cn('py-6 text-center', tableText.empty)}>조직 정보를 불러오는 중입니다.</p>
      ) : (
        tree.map((root) => (
          <DeptRow
            key={root.id}
            node={root}
            byDept={byDept}
            collapsed={collapsed}
            checked={checked}
            excludeIds={excludeIds}
            onToggleCollapse={toggleCollapse}
            onTogglePerson={togglePerson}
            onToggleDept={toggleDept}
          />
        ))
      )}
    </div>
  )
}

function PersonRow({
  person,
  checked,
  onToggle,
  depth = 0,
  showDept = false,
}: {
  person: OrgPerson
  checked: boolean
  onToggle: () => void
  depth?: number
  showDept?: boolean
}) {
  return (
    <div
      className="flex items-center gap-2 rounded-radius-sm py-1 pr-1 hover:bg-gray-50"
      style={{ paddingLeft: `${depth * 16 + 24}px` }}
    >
      <Checkbox density="table" checked={checked} onChange={onToggle} />
      <span className={tableText.body}>{person.name}</span>
      {person.title && <span className={tableText.meta}>{person.title}</span>}
      {showDept && person.deptName && (
        <span className={cn('ml-auto', tableText.meta)}>{person.deptName}</span>
      )}
    </div>
  )
}

function DeptRow({
  node,
  byDept,
  collapsed,
  checked,
  excludeIds,
  onToggleCollapse,
  onTogglePerson,
  onToggleDept,
}: {
  node: DeptTreeNode
  byDept: Map<string, OrgPerson[]>
  collapsed: Set<string>
  checked: Set<string>
  excludeIds: Set<string>
  onToggleCollapse: (id: string) => void
  onTogglePerson: (id: string) => void
  onToggleDept: (node: DeptTreeNode) => void
}) {
  const isCollapsed = collapsed.has(node.id)
  const members = (byDept.get(node.id) ?? []).filter((p) => !excludeIds.has(p.id))
  const total = collectMembers(node, byDept).filter((id) => !excludeIds.has(id)).length
  const allChecked = total > 0 && collectMembers(node, byDept)
    .filter((id) => !excludeIds.has(id))
    .every((id) => checked.has(id))

  return (
    <>
      <div
        className="flex items-center gap-1 rounded-radius-sm py-1 pr-1 hover:bg-gray-50"
        style={{ paddingLeft: `${node.depth * 16 + 4}px` }}
      >
        <IconButton
          density="table"
          variant="ghost"
          label={isCollapsed ? '펼치기' : '접기'}
          onClick={() => onToggleCollapse(node.id)}
          icon={
            <ChevronRight
              size={14}
              className={cn('transition-transform', isCollapsed ? '' : 'rotate-90')}
            />
          }
        />
        <Checkbox
          density="table"
          checked={allChecked}
          disabled={total === 0}
          onChange={() => onToggleDept(node)}
        />
        <span className={cn(tableText.body, 'font-semibold')}>{node.name}</span>
        <span className={tableText.meta}>({total})</span>
      </div>

      {!isCollapsed && (
        <>
          {members.map((p) => (
            <PersonRow
              key={p.id}
              person={p}
              depth={node.depth}
              checked={checked.has(p.id)}
              onToggle={() => onTogglePerson(p.id)}
            />
          ))}
          {node.children.map((child) => (
            <DeptRow
              key={child.id}
              node={child}
              byDept={byDept}
              collapsed={collapsed}
              checked={checked}
              excludeIds={excludeIds}
              onToggleCollapse={onToggleCollapse}
              onTogglePerson={onTogglePerson}
              onToggleDept={onToggleDept}
            />
          ))}
        </>
      )}
    </>
  )
}
