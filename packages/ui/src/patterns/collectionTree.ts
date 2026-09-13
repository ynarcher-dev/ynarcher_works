/**
 * 폴더 트리(파일받기 문항 묶음)의 **순수 계산부**.
 *
 * 화면에 그리는 일(`CollectionTreeTable`)과 줄을 세우는 일을 가른다 — 줄 세우기는 React 없이
 * 단위 테스트로 확인할 수 있어야 하고, 원장이 망가진 경우(부모 유실·순환 참조)에도 화면이
 * 멈추지 않는다는 것을 그 테스트가 보장해야 한다.
 *
 * 여기서 다루는 값은 DB 원장의 모양(snake_case) 그대로다. 컬럼 이름이 달라지면 화면이 아니라
 * 후속 어댑터가 맞춘다.
 */

/** 마디의 종류 — 폴더는 묶고, 문항은 실제로 받을 자료 한 칸이다. */
export type CollectionNodeKind = 'FOLDER' | 'QUESTION'

export interface CollectionTreeNode {
  id: string
  /** 부모 마디. 최상위는 `null`. */
  parent_id: string | null
  title: string
  node_kind: CollectionNodeKind
  /** 같은 부모 안에서의 순서. */
  sort_order: number
  is_required?: boolean
}

export interface CollectionTreeRow {
  node: CollectionTreeNode
  /** 최상위가 0. */
  depth: number
  /** 뿌리부터 자기까지의 제목 — 들여쓰기를 화면에서 조여도 어디에 속한 줄인지 알 수 있게 한다. */
  path: string[]
  hasChildren: boolean
  childCount: number
  expanded: boolean
  /**
   * 부모를 가리키고 있으나 그 밑에 서지 못한 줄(부모 유실·자기참조·순환).
   *
   * 이런 줄을 감추지 않고 최상위로 끌어올려 보여 준다 — 원장이 망가졌을 때 화면에서 사라지면
   * 고칠 대상이 무엇인지 알 수 없다.
   */
  detached: boolean
  /** 형제 중 1-based 위치와 형제 수 — `aria-posinset`/`aria-setsize`가 쓴다. */
  index: number
  siblingCount: number
}

/** 최상위 묶음의 키. 실제 id(UUID)와 겹치지 않는 모양으로 둔다. */
const ROOT = '__collection_tree_root__'

interface TreeIndex {
  byId: Map<string, CollectionTreeNode>
  children: Map<string, CollectionTreeNode[]>
  detached: Set<string>
}

const compareSiblings = (a: CollectionTreeNode, b: CollectionTreeNode): number => {
  if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order
  const byTitle = a.title.localeCompare(b.title, 'ko')
  if (byTitle !== 0) return byTitle
  return a.id.localeCompare(b.id)
}

/**
 * 원장 배열을 부모-자식 표로 접는다.
 *
 * 순환은 **고리에 놓인 마디 하나만** 끊어 최상위로 올린다. 고리로 들어가는 길목의 줄까지 함께
 * 올리면 멀쩡한 중첩이 통째로 평평해지므로, 끊는 곳은 최소로 둔다.
 */
const buildIndex = (nodes: readonly CollectionTreeNode[]): TreeIndex => {
  const byId = new Map<string, CollectionTreeNode>()
  for (const node of nodes) {
    // 같은 id가 두 번 오면 먼저 온 것을 남긴다 — 둘 다 세우면 한 줄이 두 번 그려진다.
    if (node && typeof node.id === 'string' && !byId.has(node.id)) byId.set(node.id, node)
  }

  const detached = new Set<string>()
  /** id → 실제로 매달릴 부모 키. */
  const parentKey = new Map<string, string>()
  for (const node of byId.values()) {
    const parent = node.parent_id
    const usable = parent != null && parent !== node.id && byId.has(parent)
    if (!usable && parent != null) detached.add(node.id)
    parentKey.set(node.id, usable ? (parent as string) : ROOT)
  }

  // 순환 검출 — 부모 사슬을 타고 올라가며 흰(미방문)/회(현재 경로)/검(확인 완료)으로 칠한다.
  const WHITE = 0
  const GRAY = 1
  const BLACK = 2
  const color = new Map<string, number>()
  for (const id of byId.keys()) {
    if ((color.get(id) ?? WHITE) !== WHITE) continue
    const path: string[] = []
    let cursor: string | undefined = id
    while (cursor !== undefined && cursor !== ROOT) {
      const state = color.get(cursor) ?? WHITE
      if (state === GRAY) {
        // 지금 밟고 있는 경로를 다시 만났다 = 이 마디가 고리 위에 있다. 여기만 끊는다.
        parentKey.set(cursor, ROOT)
        detached.add(cursor)
        break
      }
      if (state === BLACK) break
      color.set(cursor, GRAY)
      path.push(cursor)
      cursor = parentKey.get(cursor)
    }
    for (const visited of path) color.set(visited, BLACK)
  }

  const children = new Map<string, CollectionTreeNode[]>()
  for (const node of byId.values()) {
    const key = parentKey.get(node.id) ?? ROOT
    const bucket = children.get(key)
    if (bucket) bucket.push(node)
    else children.set(key, [node])
  }
  for (const bucket of children.values()) bucket.sort(compareSiblings)

  return { byId, children, detached }
}

/**
 * 펼쳐진 마디를 따라 **보이는 줄만** 위에서 아래 순서로 편다.
 *
 * 재귀 대신 명시적 스택을 쓰고 이미 그린 id를 다시 그리지 않는다 — 원장이 망가져도 무한 루프에
 * 빠지지 않는다는 보장을 구조가 갖는다.
 */
export function flattenCollectionTree(
  nodes: readonly CollectionTreeNode[],
  expandedIds?: Iterable<string> | null,
): CollectionTreeRow[] {
  const { children, detached } = buildIndex(nodes)
  const expanded = expandedIds instanceof Set ? expandedIds : new Set(expandedIds ?? [])

  interface Frame {
    node: CollectionTreeNode
    depth: number
    path: string[]
    index: number
    siblingCount: number
  }

  const roots = children.get(ROOT) ?? []
  const stack: Frame[] = []
  const pushLevel = (list: CollectionTreeNode[], depth: number, path: string[]) => {
    // 스택은 뒤에서 꺼내므로 역순으로 넣어야 화면에서 정순으로 선다.
    for (let i = list.length - 1; i >= 0; i -= 1) {
      const child = list[i]
      if (!child) continue
      stack.push({ node: child, depth, path, index: i + 1, siblingCount: list.length })
    }
  }
  pushLevel(roots, 0, [])

  const rows: CollectionTreeRow[] = []
  const drawn = new Set<string>()
  while (stack.length > 0) {
    const frame = stack.pop() as Frame
    if (drawn.has(frame.node.id)) continue
    drawn.add(frame.node.id)

    const kids = children.get(frame.node.id) ?? []
    const path = [...frame.path, frame.node.title]
    const isExpanded = kids.length > 0 && expanded.has(frame.node.id)
    rows.push({
      node: frame.node,
      depth: frame.depth,
      path,
      hasChildren: kids.length > 0,
      childCount: kids.length,
      expanded: isExpanded,
      detached: detached.has(frame.node.id),
      index: frame.index,
      siblingCount: frame.siblingCount,
    })
    if (isExpanded) pushLevel(kids, frame.depth + 1, path)
  }
  return rows
}

/** 자식이 있는 마디의 id 전부 — '전체 펼치기'와 기본 펼침 상태가 쓴다. */
export function collectExpandableIds(nodes: readonly CollectionTreeNode[]): string[] {
  const { children } = buildIndex(nodes)
  const ids: string[] = []
  for (const [key, bucket] of children) {
    if (key !== ROOT && bucket.length > 0) ids.push(key)
  }
  return ids
}

/** 한 마디 아래 모든 자손 id(자기 자신 제외). 순환에서도 멈춘다. */
export function collectDescendantIds(
  nodes: readonly CollectionTreeNode[],
  rootId: string,
): string[] {
  const { children } = buildIndex(nodes)
  const out: string[] = []
  const seen = new Set<string>([rootId])
  const stack = [...(children.get(rootId) ?? [])]
  while (stack.length > 0) {
    const node = stack.pop() as CollectionTreeNode
    if (seen.has(node.id)) continue
    seen.add(node.id)
    out.push(node.id)
    stack.push(...(children.get(node.id) ?? []))
  }
  return out
}

/** 보이는 줄 중 자식이 있는 마디의 부모 id — 키보드 왼쪽 이동이 쓴다. */
export function findParentRowId(
  rows: readonly CollectionTreeRow[],
  index: number,
): string | undefined {
  const target = rows[index]
  if (!target || target.depth === 0) return undefined
  for (let i = index - 1; i >= 0; i -= 1) {
    const candidate = rows[i]
    if (candidate && candidate.depth < target.depth) return candidate.node.id
  }
  return undefined
}
