/**
 * 조직 관리 UI 목업 데이터/헬퍼 — DB 미연동(로컬 상태 전용).
 * 스키마 확정 전 화면 감을 잡기 위한 임시 모듈이며, 실제 연동 시 삭제/교체한다.
 * 계층은 parent_id 자기참조(인접 리스트)로 N-depth를 표현하고,
 * 각 노드에 조직 레벨(그룹/회사/본부/팀/파트…)을 태그해 인사관리 컬럼을 파생한다.
 */

/**
 * 조직 레벨(계층) 정의. 순서는 배열 인덱스(상위→하위). 이름(변수명)은 자유 편집이며
 * 인사관리 컬럼 헤더가 된다. 각 부서 노드는 이 중 하나를 levelId로 가리킨다.
 */
export interface OrgLevel {
  id: string
  name: string
  /** 티어(같은 볼륨). 같은 tier면 병렬 레벨(예: 본부·실). 인사관리 컬럼은 티어당 1개. */
  tier: number
}

/** 티어 = 인사관리 컬럼 1개. 같은 tier의 레벨들을 하나로 묶는다. */
export interface OrgTier {
  tier: number
  levelIds: string[]
  /** 병렬 레벨 이름을 '/'로 이은 컬럼 헤더(예: '본부 / 실'). */
  label: string
}

/** 레벨을 티어로 묶어 정렬(상위→하위). 인사관리 컬럼 파생의 단일 기준. */
export function buildTiers(levels: OrgLevel[]): OrgTier[] {
  const byTier = new Map<number, OrgLevel[]>()
  for (const lv of levels) {
    const list = byTier.get(lv.tier) ?? []
    list.push(lv)
    byTier.set(lv.tier, list)
  }
  return [...byTier.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([tier, lvs]) => ({
      tier,
      levelIds: lvs.map((l) => l.id),
      label: lvs.map((l) => l.name).join(' / '),
    }))
}

export interface DeptNode {
  id: string
  parentId: string | null
  name: string
  /** 버전 간 동일 부서를 잇는 계보 id(인사 미노출 등 논리-조직 단위 처리에 사용). */
  lineageId: string
  /** 이 부서의 조직 레벨(OrgLevel.id). 깊이와 무관하게 노드별로 지정한다. */
  levelId: string
  /** 형제 내 정렬 순서(sort_order). 가나다순이 아닌 의미 순서. */
  sort: number
  /** true면 인사관리 조직 컬럼 파생에서 제외(트리엔 유지). */
  hrHidden: boolean
  /** soft delete 여부. 삭제 시 하위까지 함께 표시 대상에서 제외한다. */
  deleted?: boolean
}

/** 트리 렌더용: 노드 + 자식 배열(재귀). */
export interface DeptTreeNode extends DeptNode {
  children: DeptTreeNode[]
  depth: number
}

/**
 * 임직원(인사관리 리스트) 목업. 실제로는 인사관리(useEmployees)에서 가져오며,
 * deptId는 hr_assignments의 최신 발령(단일 소속)에 대응한다. 이 관계를 부서 관리와
 * 인사 관리 양쪽에서 편집하면 상호 참조가 된다.
 */
export interface Employee {
  id: string
  name: string
  /** 현재 소속 부서 id. null = 미배치. */
  deptId: string | null
}

/** 실제 departments 행 → 트리 노드. level_id/sort_order/deleted_at을 그대로 매핑한다. */
export function toNodes(
  rows: {
    id: string
    name: string
    parent_id: string | null
    level_id: string | null
    sort_order: number
    lineage_id?: string
    hr_hidden?: boolean
    deleted_at?: string | null
  }[],
): DeptNode[] {
  return rows.map((r) => ({
    id: r.id,
    parentId: r.parent_id,
    name: r.name,
    lineageId: r.lineage_id ?? r.id,
    levelId: r.level_id ?? '',
    sort: r.sort_order,
    hrHidden: r.hr_hidden ?? false,
    deleted: r.deleted_at != null,
  }))
}

/** 루트→자신 조상 경로(레벨 해석용). */
export function ancestorPath(nodes: DeptNode[], deptId: string): DeptNode[] {
  const byId = new Map(nodes.map((n) => [n.id, n]))
  const path: DeptNode[] = []
  let cur = byId.get(deptId)
  while (cur) {
    path.unshift(cur)
    cur = cur.parentId ? byId.get(cur.parentId) : undefined
  }
  return path
}

/**
 * 임직원의 소속 부서를 조상 경로로 펼쳐 티어별 소속명을 만든다(인사관리 컬럼 값).
 * 병렬 레벨은 한 티어로 합쳐져, 조상 중 그 티어에 속한 부서명을 채운다.
 * 반환: { [tier]: 해당 티어 조상 부서명 | '-' }.
 */
export function resolveByTier(
  nodes: DeptNode[],
  tiers: OrgTier[],
  deptId: string | null,
): Record<number, string> {
  const path = deptId ? ancestorPath(nodes, deptId) : []
  const out: Record<number, string> = {}
  for (const t of tiers) {
    // 인사관리 미노출(hrHidden) 부서는 컬럼 파생에서 건너뛴다.
    out[t.tier] = path.find((n) => !n.hrHidden && t.levelIds.includes(n.levelId))?.name ?? '-'
  }
  return out
}

/** 부서 id → 직접 소속 임직원 목록. */
export function groupByDept(employees: Employee[]): Map<string, Employee[]> {
  const m = new Map<string, Employee[]>()
  for (const e of employees) {
    if (!e.deptId) continue
    const list = m.get(e.deptId) ?? []
    list.push(e)
    m.set(e.deptId, list)
  }
  return m
}

/** 부서 id → 이름(모달에서 현재 소속 표기용). */
export function deptNameMap(nodes: DeptNode[]): Map<string, string> {
  return new Map(nodes.map((n) => [n.id, n.name]))
}

/** 살아있는 노드만 부모→자식 트리로 조립(형제는 sort 순). */
export function buildTree(nodes: DeptNode[]): DeptTreeNode[] {
  const alive = nodes.filter((n) => !n.deleted)
  const byParent = new Map<string | null, DeptNode[]>()
  for (const n of alive) {
    const list = byParent.get(n.parentId) ?? []
    list.push(n)
    byParent.set(n.parentId, list)
  }
  const attach = (parentId: string | null, depth: number): DeptTreeNode[] =>
    (byParent.get(parentId) ?? [])
      .slice()
      .sort((a, b) => a.sort - b.sort)
      .map((n) => ({ ...n, depth, children: attach(n.id, depth + 1) }))
  return attach(null, 0)
}

/** 삭제된 조직의 "삭제 기점"(부모가 살아있는 삭제 노드)만 추린다. */
export function deletedRoots(nodes: DeptNode[]): DeptNode[] {
  const byId = new Map(nodes.map((n) => [n.id, n]))
  return nodes.filter((n) => {
    if (!n.deleted) return false
    const parent = n.parentId ? byId.get(n.parentId) : null
    return !parent || !parent.deleted
  })
}

/** 특정 노드와 그 하위 전체 id 집합(삭제/복원 시 하위 동반 처리용). */
export function subtreeIds(nodes: DeptNode[], rootId: string): Set<string> {
  const result = new Set<string>([rootId])
  let grew = true
  while (grew) {
    grew = false
    for (const n of nodes) {
      if (n.parentId && result.has(n.parentId) && !result.has(n.id)) {
        result.add(n.id)
        grew = true
      }
    }
  }
  return result
}

/** 드래그 드롭 위치: 대상 위(형제 앞)/아래(형제 뒤)/안쪽(하위로 편입). */
export type DropPos = 'before' | 'after' | 'inside'

/** 자기 자신 또는 자기 하위로는 드롭할 수 없다(순환 방지). */
export function canDrop(nodes: DeptNode[], dragId: string, targetId: string): boolean {
  if (dragId === targetId) return false
  return !subtreeIds(nodes, dragId).has(targetId)
}

/**
 * dragId 노드를 targetId 기준 pos 위치로 이동한다(재부모화 포함).
 * 이동 후 영향받은 형제 그룹의 sort를 0..n으로 재부여한다.
 */
export function moveNode(
  nodes: DeptNode[],
  dragId: string,
  targetId: string,
  pos: DropPos,
): DeptNode[] {
  if (!canDrop(nodes, dragId, targetId)) return nodes
  const target = nodes.find((n) => n.id === targetId)
  if (!target) return nodes
  const newParent = pos === 'inside' ? target.id : target.parentId

  // 대상 부모의 살아있는 형제 순서(드래그 노드 제외)를 구한다.
  const siblings = nodes
    .filter((n) => n.parentId === newParent && !n.deleted && n.id !== dragId)
    .sort((a, b) => a.sort - b.sort)
    .map((n) => n.id)

  let insertAt = siblings.length
  if (pos !== 'inside') {
    const ti = siblings.indexOf(targetId)
    insertAt = pos === 'before' ? ti : ti + 1
  }
  siblings.splice(insertAt, 0, dragId)

  const sortMap = new Map(siblings.map((id, i) => [id, i]))
  return nodes.map((n) => {
    if (n.id === dragId) return { ...n, parentId: newParent, sort: sortMap.get(n.id) ?? n.sort }
    if (sortMap.has(n.id)) return { ...n, sort: sortMap.get(n.id)! }
    return n
  })
}
