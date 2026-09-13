/**
 * 파일받기 구성 초안 — 부모 id 트리를 **가로 계층 격자**가 읽는 깊이순 목록으로 옮기고,
 * 화면의 조작을 서버 계약(`file_collection_save_structure`) 하나로 되돌린다.
 *
 * 왜 초안인가. 격자는 한 화면에서 여러 줄을 동시에 고치는 편집기다. 칸마다 서버를 부르면
 * 한 번의 편집이 수십 번의 쓰기로 갈라지고, 중간에서 끊기면 **반쯤 저장된 트리**가 남는다.
 * 그래서 편집은 이 파일의 순수 값에서 일어나고, 저장은 전체 구성을 한 번에 보내는 RPC가
 * 한 트랜잭션으로 끝낸다.
 *
 * 지키는 것 넷.
 *   · **기존 id는 그대로다.** 이름·자리·종류가 바뀌어도 마디 id는 유지되고, 새 줄만 서버가
 *     새 id를 준다. 응답·파일·배정이 그 id를 가리키기 때문이다.
 *   · **들쭉날쭉한 옛 트리를 강제로 펴지 않는다.** 최상위 문항과 3단 가지가 한 표에 함께
 *     설 수 있고, 짧은 경로의 남는 열은 빈 칸으로 둔다(공용 격자가 그렇게 그린다).
 *   · **단계 수를 줄여 마디를 조용히 잃지 않는다.** 지금 쓰는 깊이보다 얕게 줄이려 하면
 *     막고 이유를 말한다 — 지우는 것은 사람이 줄마다 정할 일이다.
 *   · **종류는 자리가 정한다.** 자식이 있으면 폴더, 잎이면 문항. 다만 원래 폴더였던 빈
 *     폴더는 폴더로 남긴다(옛 데이터를 말없이 문항으로 바꾸지 않는다).
 */
import {
  siblingsOf,
  type FileCollectionNodeDto,
  type FileCollectionNodeType,
} from '@ynarcher/master-data'

/** 격자 한 줄(= 마디 하나). `id`는 화면 안에서만 쓰는 키이고 `nodeId`가 원장의 id다. */
export interface StructureRow {
  /** 공용 격자가 요구하는 고유 키. 기존 마디는 그 id, 새 줄은 `new:*`. */
  id: string
  /** 원장의 마디 id. 아직 저장되지 않은 줄은 null. */
  nodeId: string | null
  /** 0이 맨 위. 부모 다음에 자손이 오도록 정렬돼 있다. */
  depth: number
  title: string
  guide: string
  isRequired: boolean
  /** 원장에 적힌 종류. 새 줄은 null. 빈 폴더를 문항으로 바꾸지 않기 위해 들고 다닌다. */
  serverType: FileCollectionNodeType | null
  /** 낙관적 잠금 기준값. 새 줄은 null. */
  updatedAt: string | null
}

export interface StructureDraft {
  /** 단계(열) 이름. 길이가 곧 열 개수다. */
  levels: string[]
  rows: StructureRow[]
}

/** 서버가 받는 마디 한 칸. 이름은 RPC 인자와 같은 snake_case로 둔다(조회문과 맞춰 읽는다). */
export interface StructurePayloadItem {
  key: string
  parent_key: string | null
  node_id: string | null
  node_type: FileCollectionNodeType
  title: string
  guide: string | null
  is_required: boolean
  expected_updated_at: string | null
}

export interface StructureDeleteItem {
  node_id: string
  expected_updated_at: string | null
}

export interface StructureChanges {
  created: number
  updated: number
  deleted: number
  levelsChanged: boolean
}

const CLASSIFY_NAMES = ['대분류', '중분류', '소분류', '세분류']

/** 단계 기본 이름 — 맨 오른쪽은 언제나 문항(파일을 받는 칸)이다. */
export function defaultLevelNames(count: number): string[] {
  const size = Math.max(1, Math.trunc(count))
  if (size === 1) return ['문항']
  return [
    ...Array.from({ length: size - 1 }, (_, i) => CLASSIFY_NAMES[i] ?? `${i + 1}단계`),
    '문항',
  ]
}

/**
 * 단계 수를 바꿀 때 이름을 옮긴다. **사람이 고친 이름은 지키고**, 기본 이름을 그대로 쓰던
 * 칸만 새 기본값을 따라간다 — 그러지 않으면 3단계에서 2단계로 줄일 때 '문항' 열이 사라진다.
 */
export function resizeLevelNames(levels: readonly string[], count: number): string[] {
  const size = Math.max(1, Math.trunc(count))
  const before = defaultLevelNames(levels.length || 1)
  const after = defaultLevelNames(size)
  return Array.from({ length: size }, (_, i) => {
    const current = levels[i]
    if (current === undefined || current.trim() === '' || current === before[i]) return after[i]!
    return current
  })
}

/** 이 마디 아래에 딸린 줄들의 자리 — 다음 줄부터 자기보다 얕은 줄을 만나기 전까지. */
export function descendantRange(rows: readonly StructureRow[], index: number): [number, number] {
  const depth = rows[index]?.depth ?? 0
  let end = index + 1
  while (end < rows.length && (rows[end]?.depth ?? 0) > depth) end += 1
  return [index + 1, end]
}

export function hasChildren(rows: readonly StructureRow[], index: number): boolean {
  const next = rows[index + 1]
  return Boolean(next) && next!.depth > (rows[index]?.depth ?? 0)
}

/**
 * 그 줄의 종류. 자식이 있으면 폴더, 잎이면 문항 —
 * 다만 원장에서 폴더였던 빈 폴더는 폴더로 남긴다(옛 데이터를 말없이 문항으로 바꾸지 않는다).
 */
export function rowNodeType(
  rows: readonly StructureRow[],
  index: number,
): FileCollectionNodeType {
  if (hasChildren(rows, index)) return 'FOLDER'
  return rows[index]?.serverType === 'FOLDER' ? 'FOLDER' : 'QUESTION'
}

/** 지금 트리가 실제로 쓰는 깊이(열 개수의 하한). */
export function usedDepth(rows: readonly StructureRow[]): number {
  return rows.reduce((max, row) => Math.max(max, row.depth + 1), 1)
}

/**
 * 부모 id 트리를 깊이순 목록으로 편다(도메인 어댑터).
 *
 * 부모를 찾지 못한 줄도 **버리지 않는다** — 맨 뒤에 최상위로 세우고, 그런 줄이 있으면
 * 저장을 막는다(`orphanNodeIds`). 화면에서 사라지는 것이 가장 나쁜 결말이기 때문이다.
 */
export function toStructureRows(nodes: readonly FileCollectionNodeDto[]): StructureRow[] {
  const rows: StructureRow[] = []
  const seen = new Set<string>()

  const toRow = (node: FileCollectionNodeDto, depth: number): StructureRow => ({
    id: node.id,
    nodeId: node.id,
    depth,
    title: node.title,
    guide: node.guide ?? '',
    isRequired: node.is_required,
    serverType: node.node_type,
    updatedAt: node.updated_at,
  })

  const walk = (parentId: string | null, depth: number) => {
    for (const node of siblingsOf(nodes, parentId)) {
      if (seen.has(node.id)) continue
      seen.add(node.id)
      rows.push(toRow(node, depth))
      walk(node.id, depth + 1)
    }
  }
  walk(null, 0)

  for (const node of nodes) {
    if (seen.has(node.id)) continue
    seen.add(node.id)
    rows.push(toRow(node, 0))
  }
  return rows
}

/** 부모를 찾지 못해 제자리에 세우지 못한 마디들. 비어 있지 않으면 저장하지 않는다. */
export function orphanNodeIds(nodes: readonly FileCollectionNodeDto[]): string[] {
  const alive = new Set(nodes.map((n) => n.id))
  return nodes.filter((n) => n.parent_id !== null && !alive.has(n.parent_id)).map((n) => n.id)
}

/** 원장 조회 결과로 초안을 세운다. 열 개수는 저장된 단계 이름과 실제 깊이 중 큰 쪽이다. */
export function draftFromNodes(
  nodes: readonly FileCollectionNodeDto[],
  levelNames: readonly string[] | null | undefined,
): StructureDraft {
  const rows = toStructureRows(nodes)
  const saved = (levelNames ?? []).filter((name) => typeof name === 'string')
  const size = Math.max(usedDepth(rows), saved.length, 1)
  return { levels: resizeLevelNames(saved, size), rows }
}

let sequence = 0

/** 새 줄의 화면 키. 원장 id(uuid)와 섞이지 않도록 접두어를 붙인다. */
export function newRowId(): string {
  sequence += 1
  return `new:${sequence}:${Math.random().toString(36).slice(2, 8)}`
}

function blankRow(depth: number): StructureRow {
  return {
    id: newRowId(),
    nodeId: null,
    depth,
    title: '',
    guide: '',
    isRequired: false,
    serverType: null,
    updatedAt: null,
  }
}

/** 한 단계부터 맨 아래 단계까지 이어지는 빈 가지. 맨 아래 줄이 문항이 된다. */
function blankBranch(fromDepth: number, levelCount: number): StructureRow[] {
  const last = Math.max(fromDepth, levelCount - 1)
  const rows: StructureRow[] = []
  for (let depth = fromDepth; depth <= last; depth += 1) rows.push(blankRow(depth))
  return rows
}

/** 표 맨 끝에 최상위 가지 하나를 더한다(표가 비었을 때도 쓴다). */
export function appendRootBranch(draft: StructureDraft): StructureDraft {
  return { ...draft, rows: [...draft.rows, ...blankBranch(0, draft.levels.length)] }
}

/** 지정한 칸 **바로 뒤**에 같은 단계의 형제 가지를 세운다(자기 자손 다음 자리다). */
export function addSiblingBranch(draft: StructureDraft, nodeIndex: number): StructureDraft {
  const node = draft.rows[nodeIndex]
  if (!node) return draft
  const [, end] = descendantRange(draft.rows, nodeIndex)
  const rows = [...draft.rows]
  rows.splice(end, 0, ...blankBranch(node.depth, draft.levels.length))
  return { ...draft, rows }
}

/** 대량 등록 한 줄 — 맨 위 단계부터 문항까지의 경로와 문항 칸의 값. */
export interface BulkBranch {
  /** 단계 수와 같은 길이의 이름들. 맨 뒤가 문항 이름이다. */
  titles: string[]
  guide: string
  isRequired: boolean
}

/** `parentIndex`(-1이면 최상위) 바로 아래에서 같은 이름을 가진 줄. 없으면 -1. */
function findChildByTitle(
  rows: readonly StructureRow[],
  parentIndex: number,
  title: string,
): number {
  const depth = parentIndex < 0 ? 0 : (rows[parentIndex]?.depth ?? 0) + 1
  const [from, to] =
    parentIndex < 0 ? [0, rows.length] : descendantRange(rows, parentIndex)
  for (let i = from; i < to; i += 1) {
    const row = rows[i]!
    if (row.depth === depth && row.title === title) return i
  }
  return -1
}

/**
 * 여러 줄을 한 번에 세운다(대량 등록) — **이미 있는 분류에는 붙이고, 없으면 만든다.**
 *
 * 붙일 자리를 이름으로 찾는 이유는 붙여 넣는 표가 화면의 표와 같은 모양이기 때문이다.
 * `대분류A / 문항1`과 `대분류A / 문항2`를 함께 붙여 넣으면 사람이 기대하는 것은 대분류
 * 두 개가 아니라 한 대분류 아래 문항 둘이다. 다만 **맨 아래(문항)는 언제나 새로 만든다** —
 * 이름이 같은 문항을 하나로 합치면 붙여 넣은 줄 수와 생긴 줄 수가 달라진다.
 *
 * 이름이 빈 칸은 찾기에 쓰지 않는다(빈 이름끼리 서로 붙어 트리가 뒤엉킨다). 저장 전에
 * `structureIssues`가 빈 이름을 잡으므로 여기서는 그대로 세워 사람이 보게 둔다.
 */
export function appendBulkBranches(
  draft: StructureDraft,
  branches: readonly BulkBranch[],
): StructureDraft {
  const depth = Math.max(1, draft.levels.length)
  const rows = [...draft.rows]
  for (const branch of branches) {
    let parent = -1
    for (let level = 0; level < depth; level += 1) {
      const title = (branch.titles[level] ?? '').trim()
      const leaf = level === depth - 1
      if (!leaf && title) {
        const found = findChildByTitle(rows, parent, title)
        if (found >= 0) {
          parent = found
          continue
        }
      }
      const at = parent < 0 ? rows.length : descendantRange(rows, parent)[1]
      rows.splice(at, 0, {
        ...blankRow(level),
        title,
        guide: leaf ? branch.guide : '',
        isRequired: leaf ? branch.isRequired : false,
      })
      parent = at
    }
  }
  return { ...draft, rows }
}

function replaceRow(
  draft: StructureDraft,
  index: number,
  patch: Partial<StructureRow>,
): StructureDraft {
  const row = draft.rows[index]
  if (!row) return draft
  return { ...draft, rows: draft.rows.map((r, i) => (i === index ? { ...r, ...patch } : r)) }
}

export function setRowTitle(draft: StructureDraft, index: number, title: string): StructureDraft {
  return replaceRow(draft, index, { title })
}

export function setRowGuide(draft: StructureDraft, index: number, guide: string): StructureDraft {
  return replaceRow(draft, index, { guide })
}

export function setRowRequired(
  draft: StructureDraft,
  index: number,
  isRequired: boolean,
): StructureDraft {
  return replaceRow(draft, index, { isRequired })
}

export function setLevelName(draft: StructureDraft, level: number, name: string): StructureDraft {
  const levels = [...draft.levels]
  while (levels.length <= level) levels.push('')
  levels[level] = name
  return { ...draft, levels }
}

/**
 * 단계를 늘린다 — **문항은 그대로 두고 그 앞에 빈 분류 줄을 끼운다.**
 *
 * 여기서 문항을 새로 만들면 id가 바뀌어 이미 받은 자료·배정이 가리키던 자리가 사라진다.
 * 그래서 이름·안내·필수·id를 진 그 줄이 마지막 단계로 내려가고, 새로 서는 것은 그 위의
 * 빈 분류뿐이다(이름은 사람이 채운다 — 비어 있으면 저장이 서지 않는다).
 *
 * 옛 **빈 폴더**는 건드리지 않는다. 폴더를 문항 자리로 끌어내리는 것은 종류를 바꾸는 일이라
 * 격자의 '가지 완성'(`completeBranch`)으로 사람이 정한다.
 */
function expandRows(rows: readonly StructureRow[], size: number): StructureRow[] {
  const out: StructureRow[] = []
  rows.forEach((row, index) => {
    const leaf = !hasChildren(rows, index)
    if (!leaf || row.depth >= size - 1 || row.serverType === 'FOLDER') {
      out.push(row)
      return
    }
    for (let depth = row.depth; depth <= size - 2; depth += 1) out.push(blankRow(depth))
    out.push({ ...row, depth: size - 1 })
  })
  return out
}

/**
 * 단계를 줄인다 — **되돌릴 수 있는 만큼만.**
 *
 * 걷어낼 수 있는 것은 방금 늘리며 생긴 **빈 통로 분류**(저장 전 · 이름 없음 · 외자식)뿐이다.
 * 그 밖의 줄은 원장에 있는 마디이고, 열에서 사라지면 화면에서 못 읽고 저장도 못 해
 * 조용히 잃는 결말이 된다. 그래서 걷어낼 것이 없으면 아무것도 하지 않고 null을 답한다.
 */
function collapseRows(rows: readonly StructureRow[], size: number): StructureRow[] | null {
  let out = [...rows]
  for (let guard = 0; guard <= rows.length; guard += 1) {
    if (out.every((row) => row.depth <= size - 1)) return out
    const index = out.findIndex((row, i) => {
      if (row.nodeId !== null || row.title.trim() !== '') return false
      const [start, end] = descendantRange(out, i)
      if (end === start) return false
      const children = out.slice(start, end).filter((c) => c.depth === row.depth + 1)
      if (children.length !== 1) return false
      return out.slice(start, end).some((c) => c.depth > size - 1)
    })
    if (index < 0) return null
    const [start, end] = descendantRange(out, index)
    out = [
      ...out.slice(0, index),
      ...out.slice(start, end).map((c) => ({ ...c, depth: c.depth - 1 })),
      ...out.slice(end),
    ]
  }
  return null
}

/**
 * 단계 수를 줄일 수 없는 이유. 줄일 수 있으면 null.
 *
 * 예산표는 분류가 **글자**라 줄이면 글자만 사라지지만, 파일받기의 분류는 **마디**다 —
 * 열을 줄이면 그 아래 문항이 화면에서 사라지고, 사라진 것은 저장할 수도 없다.
 */
export function levelCountBlocker(draft: StructureDraft, count: number): string | null {
  const size = Math.max(1, Math.trunc(count))
  if (size >= draft.levels.length) return null
  if (collapseRows(draft.rows, size)) return null
  const deep = draft.rows.filter((row) => row.depth >= size)
  const sample = deep.map((row) => row.title.trim()).find((title) => title !== '')
  return (
    `${size}단계보다 깊은 항목이 ${deep.length}개 있어 단계를 줄일 수 없습니다` +
    `${sample ? ` (예: ${sample})` : ''}. 먼저 그 줄을 지운 뒤 다시 줄여 주세요.`
  )
}

/** 단계 수 바꾸기. 늘리면 기존 문항 앞에 빈 분류가 서고, 줄이면 빈 통로만 걷어낸다. */
export function setLevelCount(draft: StructureDraft, count: number): StructureDraft {
  const size = Math.max(1, Math.trunc(count))
  if (size === draft.levels.length) return draft
  const rows = size > draft.levels.length ? expandRows(draft.rows, size) : collapseRows(draft.rows, size)
  if (!rows) return draft
  return { levels: resizeLevelNames(draft.levels, size), rows }
}

/** 아래에 아무것도 없는 폴더인가 — 격자에서 '가지 완성'을 권할 자리다. */
export function isEmptyFolderRow(draft: StructureDraft, index: number): boolean {
  const row = draft.rows[index]
  if (!row) return false
  return !hasChildren(draft.rows, index) && rowNodeType(draft.rows, index) === 'FOLDER'
}

/**
 * 빈 폴더 아래로 마지막 단계까지 빈 줄을 세운다(가지 완성).
 * 폴더는 폴더로 남고, 새로 서는 맨 아래 줄이 문항이 된다.
 *
 * 폴더가 이미 마지막 열에 있으면 **열을 하나 늘린다** — 그러지 않으면 새로 만든 문항이
 * 표에 그릴 칸이 없어 보이지도 고쳐지지도 않는다.
 */
export function completeBranch(draft: StructureDraft, index: number): StructureDraft {
  const row = draft.rows[index]
  if (!row || hasChildren(draft.rows, index)) return draft
  const last = Math.max(row.depth + 1, draft.levels.length - 1)
  const added: StructureRow[] = []
  for (let depth = row.depth + 1; depth <= last; depth += 1) added.push(blankRow(depth))
  const rows = [...draft.rows]
  rows.splice(index + 1, 0, ...added)
  const levels =
    last + 1 > draft.levels.length ? resizeLevelNames(draft.levels, last + 1) : draft.levels
  return { levels, rows }
}

/** 격자 행(맨 아래 줄 기준)들의 경로. 공용 격자가 세우는 행 순서와 같다. */
function gridPaths(rows: readonly StructureRow[]): number[][] {
  const paths: number[][] = []
  const stack: number[] = []
  for (const [index, row] of rows.entries()) {
    stack[row.depth] = index
    stack.length = row.depth + 1
    if ((rows[index + 1]?.depth ?? -1) <= row.depth) paths.push([...stack])
  }
  return paths
}

/**
 * 격자 한 행을 뺀다 — 맨 아래 줄을 지우고, **마지막 자식을 잃은 부모**만 거슬러 올라가며
 * 함께 뺀다. 다른 자식이 하나라도 남아 있으면 그 위는 그대로다.
 */
export function removeGridRow(draft: StructureDraft, gridIndex: number): StructureDraft {
  const path = gridPaths(draft.rows)[gridIndex]
  if (!path || path.length === 0) return draft
  const ids = path.map((index) => draft.rows[index]!.id)

  let rows = draft.rows.filter((row) => row.id !== ids[ids.length - 1])
  for (let level = ids.length - 2; level >= 0; level -= 1) {
    const parentIndex = rows.findIndex((row) => row.id === ids[level])
    if (parentIndex < 0) continue
    if (hasChildren(rows, parentIndex)) break
    rows = rows.filter((_, i) => i !== parentIndex)
  }
  return { ...draft, rows }
}

/** 바로 위 형제의 자리 — 없으면 -1. */
function prevSiblingStart(rows: readonly StructureRow[], index: number): number {
  const depth = rows[index]?.depth ?? 0
  for (let i = index - 1; i >= 0; i -= 1) {
    const d = rows[i]!.depth
    if (d === depth) return i
    if (d < depth) return -1
  }
  return -1
}

function canMoveNode(rows: readonly StructureRow[], index: number, delta: -1 | 1): boolean {
  if (delta === -1) return prevSiblingStart(rows, index) >= 0
  const [, end] = descendantRange(rows, index)
  const next = rows[end]
  return Boolean(next) && next!.depth === (rows[index]?.depth ?? 0)
}

function moveNode(rows: readonly StructureRow[], index: number, delta: -1 | 1): StructureRow[] {
  const [, end] = descendantRange(rows, index)
  if (delta === -1) {
    const start = prevSiblingStart(rows, index)
    return [
      ...rows.slice(0, start),
      ...rows.slice(index, end),
      ...rows.slice(start, index),
      ...rows.slice(end),
    ]
  }
  const [, nextEnd] = descendantRange(rows, end)
  return [
    ...rows.slice(0, index),
    ...rows.slice(end, nextEnd),
    ...rows.slice(index, end),
    ...rows.slice(nextEnd),
  ]
}

/**
 * 격자 한 행을 위·아래로 옮긴다. 가장 가까운 형제부터 찾고, 경계에서는 **움직일 수 있는
 * 상위 가지 전체**를 옮긴다 — 부모만 따로 움직이면 자식이 남의 폴더 밑으로 들어간다.
 */
export function moveGridRow(
  draft: StructureDraft,
  gridIndex: number,
  delta: -1 | 1,
): StructureDraft {
  const path = gridPaths(draft.rows)[gridIndex] ?? []
  for (let level = path.length - 1; level >= 0; level -= 1) {
    const index = path[level]!
    if (canMoveNode(draft.rows, index, delta)) {
      return { ...draft, rows: moveNode(draft.rows, index, delta) }
    }
  }
  return draft
}

export function canMoveGridRow(
  draft: StructureDraft,
  gridIndex: number,
  delta: -1 | 1,
): boolean {
  const path = gridPaths(draft.rows)[gridIndex] ?? []
  return path.some((index) => canMoveNode(draft.rows, index, delta))
}

/** 저장 전에 사람이 고쳐야 하는 것들. 비어 있어야 저장 버튼이 산다. */
export function structureIssues(draft: StructureDraft): string[] {
  const issues: string[] = []
  if (draft.rows.some((row) => row.title.trim() === '')) {
    issues.push('이름이 비어 있는 칸이 있습니다.')
  }
  if (draft.rows.some((row) => row.title.trim().length > 200)) {
    issues.push('이름은 200자까지 적을 수 있습니다.')
  }
  if (draft.rows.some((row) => row.guide.trim().length > 2000)) {
    issues.push('안내는 2000자까지 적을 수 있습니다.')
  }
  if (draft.levels.some((name) => name.trim().length > 40)) {
    issues.push('단계 이름은 40자까지 적을 수 있습니다.')
  }
  return issues
}

/** 초안 전체를 서버 계약의 모양으로 편다. 부모는 언제나 자기보다 앞에 선다. */
export function structurePayload(draft: StructureDraft): StructurePayloadItem[] {
  const parents: string[] = []
  return draft.rows.map((row, index) => {
    parents[row.depth] = row.id
    parents.length = row.depth + 1
    return {
      key: row.id,
      parent_key: row.depth === 0 ? null : (parents[row.depth - 1] ?? null),
      node_id: row.nodeId,
      node_type: rowNodeType(draft.rows, index),
      title: row.title.trim(),
      guide: row.guide.trim() ? row.guide.trim() : null,
      is_required: rowNodeType(draft.rows, index) === 'QUESTION' ? row.isRequired : false,
      expected_updated_at: row.updatedAt,
    }
  })
}

/** 초안에서 사라진 원장 마디들 — 서버는 **여기 적힌 것만** 지운다. */
export function structureDeletes(
  baseline: readonly FileCollectionNodeDto[],
  draft: StructureDraft,
): StructureDeleteItem[] {
  const kept = new Set(draft.rows.map((row) => row.nodeId).filter((id): id is string => Boolean(id)))
  return baseline
    .filter((node) => !kept.has(node.id))
    .map((node) => ({ node_id: node.id, expected_updated_at: node.updated_at }))
}

interface RowSnapshot {
  /** 부모 마디의 원장 id. 최상위는 빈 문자열, 아직 저장되지 않은 부모는 초안 키. */
  parent: string
  /** 같은 부모 안에서 몇 번째인가 — 순서가 바뀌어도 저장할 것이 있다. */
  order: number
  title: string
  guide: string
  type: FileCollectionNodeType
  required: boolean
}

/** 원장 id를 가진 줄들의 지금 모습. 새 줄은 여기 없다(그건 '추가'로 센다). */
function rowSnapshots(draft: StructureDraft): Map<string, RowSnapshot> {
  const parents: StructureRow[] = []
  const counters = new Map<string, number>()
  const out = new Map<string, RowSnapshot>()
  draft.rows.forEach((row, index) => {
    parents[row.depth] = row
    parents.length = row.depth + 1
    const parentRow = row.depth === 0 ? null : parents[row.depth - 1]
    const parent = parentRow ? (parentRow.nodeId ?? `draft:${parentRow.id}`) : ''
    const order = counters.get(parent) ?? 0
    counters.set(parent, order + 1)
    if (!row.nodeId) return
    const type = rowNodeType(draft.rows, index)
    out.set(row.nodeId, {
      parent,
      order,
      title: row.title.trim(),
      guide: row.guide.trim(),
      type,
      required: type === 'QUESTION' ? row.isRequired : false,
    })
  })
  return out
}

function sameSnapshot(a: RowSnapshot, b: RowSnapshot): boolean {
  return (
    a.parent === b.parent &&
    a.order === b.order &&
    a.title === b.title &&
    a.guide === b.guide &&
    a.type === b.type &&
    a.required === b.required
  )
}

/** 저장하면 무엇이 달라지는가. 0건이면 저장 버튼을 세우지 않는다. */
export function structureChanges(
  baseline: readonly FileCollectionNodeDto[],
  baselineLevels: readonly string[] | null | undefined,
  draft: StructureDraft,
): StructureChanges {
  const baseDraft = draftFromNodes(baseline, baselineLevels)
  const before = rowSnapshots(baseDraft)
  const after = rowSnapshots(draft)

  let updated = 0
  for (const [nodeId, snapshot] of after) {
    const old = before.get(nodeId)
    if (!old || !sameSnapshot(old, snapshot)) updated += 1
  }

  return {
    created: draft.rows.filter((row) => !row.nodeId).length,
    updated,
    deleted: structureDeletes(baseline, draft).length,
    // 견주는 대상은 **화면이 정규화한 뒤의** 단계 이름이다. 저장된 이름이 없는 옛 파일받기를
    // 열었다는 이유만으로 "고칠 것이 있다"고 말하면, 사람이 아무것도 하지 않았는데 저장
    // 버튼이 켜지고 서버 값을 따라가지도 못한다. 기본 이름은 다른 변경과 함께 실려 저장된다.
    levelsChanged: levelsKey(baseDraft.levels) !== levelsKey(draft.levels),
  }
}

export function isStructureDirty(changes: StructureChanges): boolean {
  return changes.created > 0 || changes.updated > 0 || changes.deleted > 0 || changes.levelsChanged
}

function levelsKey(levels: readonly string[]): string {
  return levels.join('\u001f')
}

/**
 * 서버에서 다시 읽어야 할지 가르는 지문 — 마디의 값과 자리를 모두 담는다.
 * 정렬해서 잇는다(조회 순서가 흔들려도 같은 트리는 같은 지문이다).
 */
export function structureSignature(
  nodes: readonly FileCollectionNodeDto[],
  levelNames: readonly string[] | null | undefined,
): string {
  const rows = nodes
    .map((n) =>
      [
        n.id,
        n.parent_id ?? '',
        n.node_type,
        n.title,
        n.guide ?? '',
        String(n.is_required),
        String(n.sort_order),
        n.updated_at,
      ].join('\u001f'),
    )
    .sort()
  return [levelsKey(levelNames ?? []), ...rows].join('\u001e')
}
