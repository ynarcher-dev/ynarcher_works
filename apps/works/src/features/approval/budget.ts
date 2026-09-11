/**
 * 품의서 예산표 — 분류 단계를 가로 열로 편 표의 순수 계층.
 *
 * **이 모듈이 있는 이유는 사업마다 예산 항목의 층 이름과 층 수가 다르기 때문이다.**
 * 어떤 사업은 `대분류 › 중분류`로 짜고 어떤 사업은 `세목 › 비목 › 세세목`으로 짠다.
 * 층 이름을 코드가 정하면 그 목록에 없는 사업은 예산을 적을 수 없으므로, 층 이름과 층 수는
 * 문서가 갖고(levels) 코드는 **"몇 번째 층인가"만** 안다. 층 이름은 이름표일 뿐 계산에
 * 끼지 않으므로, 층이 둘이든 다섯이든 차감·합계 방식이 같다.
 *
 * 저장값은 depth/name 부모·자식 트리다. 화면에 세울 때 budgetEntries가 맨 아래 항목마다
 * 전체 경로를 만들고, budgetGridRows가 같은 부모 셀을 자식 수만큼 세로 병합한다. 잠시 쓰인
 * path 기반 값도 읽은 뒤 실제 트리로 되돌리므로 이미 작성 중인 문서를 깨뜨리지 않는다.
 */
import { toNumber } from '@/features/approval/numeric'

/** 예산표 한 줄. `id`는 지출결의가 가리키는 값이라 문서 안에서 바뀌지 않아야 한다. */
export interface BudgetRow {
  /** 줄 id — 지출결의의 예산 줄 참조가 이 값을 가리킨다. 발급 후 불변. */
  id: string
  /** 층. 0이 맨 위이며 이름은 levels[depth]가 답한다. */
  depth: number
  /** 항목 이름. */
  name: string
  /**
   * 가로형 입력을 처음 도입했을 때 저장한 분류 경로. 현재 저장값은 depth/name 트리이며,
   * 이 값은 그 사이 작성된 문서를 실제 트리로 호환 변환하기 위해서만 읽는다.
   */
  path?: string[]
  /** 숫자 열 값(열 key → 값). 열 정의는 양식이 갖는다. */
  values: Record<string, string>
}

/** 예산표 한 칸의 값. 층 이름은 문서가 갖는다(양식은 기본값만 준다). */
export interface BudgetTreeValue {
  /** 층 이름. `['세목','비목','세세목']`처럼 위에서 아래 순서. */
  levels: string[]
  rows: BudgetRow[]
}

export const EMPTY_BUDGET: BudgetTreeValue = { levels: [], rows: [] }

/** 층 이름 기본값 — 양식이 따로 정하지 않았을 때 새 문서가 들고 시작한다. */
export const DEFAULT_BUDGET_LEVELS = ['대분류', '중분류', '소분류']

const str = (v: unknown): string => (typeof v === 'string' ? v : '')

/** 줄 id 발급. 이미 쓰인 id는 피한다 — 두 줄이 같은 id면 지출이 어느 줄에 걸렸는지 갈린다. */
export function newBudgetRowId(taken: Iterable<string> = []): string {
  const used = new Set(taken)
  for (;;) {
    const id = `b${Math.random().toString(36).slice(2, 10)}`
    if (!used.has(id)) return id
  }
}

/**
 * 저장된 값을 읽어들인다. 알 수 없는 모양은 조용히 빈 표로 본다 —
 * 값이 조금 어긋났다고 문서 전체를 못 열게 만들면 과거 문서가 인질이 된다.
 *
 * id가 없는 줄에는 자리 기반 id를 준다. 이 경우는 손으로 고친 값에서만 생기며, 그 줄을
 * 가리키던 지출이 있었다면 어차피 되짚을 근거가 없다.
 */
export function parseBudget(raw: unknown): BudgetTreeValue {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return EMPTY_BUDGET
  const obj = raw as Record<string, unknown>
  const levels = Array.isArray(obj.levels) ? obj.levels.map(str).filter(Boolean) : []
  const rawRows = Array.isArray(obj.rows) ? obj.rows : []
  const rows: BudgetRow[] = []
  for (const [i, item] of rawRows.entries()) {
    if (typeof item !== 'object' || item === null) continue
    const r = item as Record<string, unknown>
    const values: Record<string, string> = {}
    if (typeof r.values === 'object' && r.values !== null) {
      for (const [k, v] of Object.entries(r.values as Record<string, unknown>)) values[k] = str(v)
    }
    rows.push({
      id: str(r.id) || `row-${i}`,
      depth: Number.isFinite(r.depth) ? Math.max(0, Math.trunc(r.depth as number)) : 0,
      name: str(r.name),
      path: Array.isArray(r.path) ? r.path.map(str) : undefined,
      values,
    })
  }
  return { levels, rows: normalizeDepths(rows) }
}

/**
 * 깊이를 표가 그릴 수 있는 범위로 맞춘다 — 첫 줄은 0층이고, 어느 줄도 바로 위 줄보다
 * 두 층 넘게 들어가지 않는다. 건너뛴 층이 있으면 그 사이에 부모가 없는 자식이 생겨,
 * 합계를 올려 보낼 자리를 잃는다.
 */
export function normalizeDepths(rows: BudgetRow[]): BudgetRow[] {
  let prev = -1
  return rows.map((r) => {
    const depth = Math.min(r.depth, prev + 1)
    prev = depth
    return depth === r.depth ? r : { ...r, depth }
  })
}

/** 맨 아래 줄인가 — 다음 줄이 없거나 더 깊지 않으면 아래에 아무것도 없다. */
export function isLeaf(rows: BudgetRow[], index: number): boolean {
  const next = rows[index + 1]
  return !next || next.depth <= (rows[index]?.depth ?? 0)
}

/** 그 줄에 딸린 아래 줄들의 자리 — 다음 줄부터 자기보다 얕은 줄을 만나기 전까지. */
export function descendantRange(rows: BudgetRow[], index: number): [number, number] {
  const depth = rows[index]?.depth ?? 0
  let end = index + 1
  while (end < rows.length && (rows[end]?.depth ?? 0) > depth) end += 1
  return [index + 1, end]
}

/** 금액을 적는 줄들(맨 아래 줄). 지출결의가 고를 수 있는 자리이기도 하다. */
export function leafRows(rows: BudgetRow[]): BudgetRow[] {
  return rows.filter((_, i) => isLeaf(rows, i))
}

/**
 * 줄마다의 값 — 맨 아래 줄은 적힌 값, 위층은 자기 아래 맨 아래 줄들의 합.
 * 아무 값도 없는 위층은 0이 아니라 null이다(적히지 않은 것과 0원은 다르다).
 */
export function rollup(rows: BudgetRow[], columnKey: string): Map<string, number | null> {
  const out = new Map<string, number | null>()
  for (const [i, row] of rows.entries()) {
    if (isLeaf(rows, i)) {
      out.set(row.id, toNumber(row.values[columnKey] ?? ''))
      continue
    }
    const [from, to] = descendantRange(rows, i)
    let sum: number | null = null
    for (let j = from; j < to; j += 1) {
      if (!isLeaf(rows, j)) continue
      const n = toNumber(rows[j]!.values[columnKey] ?? '')
      if (n !== null) sum = (sum ?? 0) + n
    }
    out.set(row.id, sum)
  }
  return out
}

/** 표 전체 합계 — 맨 아래 줄들의 합. 값이 하나도 없으면 null. */
export function budgetTotal(rows: BudgetRow[], columnKey: string): number | null {
  let sum: number | null = null
  for (const [i, row] of rows.entries()) {
    if (!isLeaf(rows, i)) continue
    const n = toNumber(row.values[columnKey] ?? '')
    if (n !== null) sum = (sum ?? 0) + n
  }
  return sum
}

/**
 * 그 줄이 어디에 있는지 — 위층 이름들을 이어 붙인 한 줄(`인건비 › 강사료 › 외부 강사`).
 * 지출결의에서 예산 줄을 고를 때 이름만으로는 같은 이름의 줄을 가릴 수 없다.
 */
export function budgetPath(rows: BudgetRow[], index: number): string {
  const direct = rows[index]?.path
  return displayBudgetPath(direct ?? budgetPathParts(rows, index))
}

function displayBudgetPath(parts: string[]): string {
  let last = parts.length - 1
  while (last >= 0 && !parts[last]!.trim()) last -= 1
  if (last < 0) return '(이름 없음)'
  return parts
    .slice(0, last + 1)
    .map((part) => part.trim() || '(이름 없음)')
    .join(' › ')
}

/** 한 줄의 분류 경로. 예전 depth/name 트리도 새 가로형 행과 같은 모양으로 읽는다. */
export function budgetPathParts(rows: BudgetRow[], index: number): string[] {
  const direct = rows[index]?.path
  if (direct) return [...direct]

  const parts: string[] = []
  let want = rows[index]?.depth ?? 0
  for (let i = index; i >= 0; i -= 1) {
    const row = rows[i]!
    if (row.depth === want) {
      parts.unshift(row.name)
      want -= 1
      if (want < 0) break
    }
  }
  return parts
}

/**
 * 화면에 세울 예산 항목. 예전 트리의 중간 합계 줄은 빼고 맨 아래 줄만 한 행으로 펴며,
 * 지출결의가 가리키는 맨 아래 줄 id는 그대로 보존한다.
 */
export function budgetEntries(value: BudgetTreeValue): BudgetRow[] {
  const levelCount = Math.max(1, value.levels.length)
  const out: BudgetRow[] = []
  for (const [i, row] of value.rows.entries()) {
    if (!isLeaf(value.rows, i)) continue
    const path = budgetPathParts(value.rows, i).slice(0, levelCount)
    while (path.length < levelCount) path.push('')
    out.push({
      ...row,
      depth: 0,
      name: [...path].reverse().find((part) => part.trim()) ?? '',
      path,
    })
  }
  return out
}

function groupId(leafId: string, depth: number, used: Set<string>): string {
  const base = `group-${leafId}-${depth}`
  let id = base
  let suffix = 1
  while (used.has(id)) {
    id = `${base}-${suffix}`
    suffix += 1
  }
  used.add(id)
  return id
}

/**
 * 가로 경로 행을 실제 부모·자식 트리로 묶는다. 같은 접두 경로가 연속되면 부모 노드 하나를
 * 공유하며, 마지막 단계의 id는 지출결의가 가리키므로 원래 예산 줄 id를 그대로 쓴다.
 */
export function budgetTreeFromEntries(
  levels: string[],
  entries: BudgetRow[],
): BudgetTreeValue {
  const nextLevels = levels.length > 0 ? [...levels] : ['1단계']
  const levelCount = nextLevels.length
  const rows: BudgetRow[] = []
  const used = new Set(entries.map((entry) => entry.id))
  let previous: string[] | null = null

  for (const entry of entries) {
    const path = [...(entry.path ?? [])].slice(0, levelCount)
    while (path.length < levelCount) path.push('')

    let shared = 0
    if (previous) {
      // 마지막 단계는 이름이 같아도 예산 줄마다 별도 노드다. 금액과 지출 참조가 각각 다르다.
      while (
        shared < levelCount - 1 &&
        previous[shared] === path[shared]
      ) {
        shared += 1
      }
    }

    for (let depth = shared; depth < levelCount; depth += 1) {
      const leaf = depth === levelCount - 1
      rows.push({
        id: leaf ? entry.id : groupId(entry.id, depth, used),
        depth,
        name: path[depth] ?? '',
        values: leaf ? { ...entry.values } : {},
      })
    }
    previous = path
  }

  return { levels: nextLevels, rows }
}

/** 저장 모양이 구 트리든 잠시 쓰인 path 행이든 현재의 실제 트리로 정규화한다. */
export function asBudgetTree(value: BudgetTreeValue): BudgetTreeValue {
  const levels = value.levels.length > 0 ? value.levels : ['1단계']
  // path 값은 가로형 1차 구현에서 잠시 저장된 모양이라 실제 트리로 바꾼다.
  if (value.rows.some((row) => row.path !== undefined)) {
    return budgetTreeFromEntries(levels, budgetEntries(value))
  }

  const rows = normalizeDepths(value.rows)
  // 현재 트리는 모든 예산 줄이 마지막 단계에 선다. 이미 그 모양이면 이름이 같거나 비어 있어도
  // 다시 묶지 않는다 — 서로 다른 두 대분류는 이름이 같아도 노드 id가 다르면 다른 가지다.
  const complete = rows.every(
    (_, index) => !isLeaf(rows, index) || rows[index]!.depth === levels.length - 1,
  )
  return complete ? { levels, rows } : budgetTreeFromEntries(levels, budgetEntries({ levels, rows }))
}

export interface BudgetGridCell {
  /** 실제 트리 rows에서 이 분류 노드의 자리. */
  nodeIndex: number
  /** 이 상위 분류가 차지하는 예산 항목 행 수. */
  rowSpan: number
}

export interface BudgetGridRow {
  /** 실제 트리 rows에서 금액을 가진 맨 아래 노드의 자리. */
  leafIndex: number
  row: BudgetRow
  /** 1단계부터 이 행의 맨 아래 항목까지 실제 트리 노드 자리. */
  nodePath: number[]
  /** 이미 위 행에서 세로 병합된 단계는 null이다. */
  cells: Array<BudgetGridCell | null>
}

/** 실제 트리를 가로 표의 행과 세로 병합 셀 정보로 편다. */
export function budgetGridRows(value: BudgetTreeValue): BudgetGridRow[] {
  const tree = asBudgetTree(value)
  const nodePaths: number[][] = []
  const stack: number[] = []

  for (const [index, row] of tree.rows.entries()) {
    stack[row.depth] = index
    stack.length = row.depth + 1
    if (isLeaf(tree.rows, index)) nodePaths.push([...stack])
  }

  return nodePaths.map((path, rowIndex) => ({
    leafIndex: path[path.length - 1]!,
    row: tree.rows[path[path.length - 1]!]!,
    nodePath: path,
    cells: path.map((nodeIndex, level) => {
      if (rowIndex > 0 && nodePaths[rowIndex - 1]?.[level] === nodeIndex) return null
      let rowSpan = 1
      while (nodePaths[rowIndex + rowSpan]?.[level] === nodeIndex) rowSpan += 1
      return { nodeIndex, rowSpan }
    }),
  }))
}

/** 지출결의가 고를 수 있는 예산 줄 한 개. */
export interface BudgetLineOption {
  id: string
  path: string
  /** 그 줄에 적힌 예산. */
  budget: number | null
}

/** 맨 아래 줄만 선택지로 편다 — 위층은 합이라 그 자리에서 돈을 쓸 수 없다. */
export function budgetLineOptions(
  value: BudgetTreeValue,
  columnKey: string,
): BudgetLineOption[] {
  const out: BudgetLineOption[] = []
  for (const [i, row] of value.rows.entries()) {
    if (!isLeaf(value.rows, i)) continue
    out.push({
      id: row.id,
      path: budgetPath(value.rows, i),
      budget: toNumber(row.values[columnKey] ?? ''),
    })
  }
  return out
}

/** 층 이름 — 정의된 것이 없으면 층 번호로 대신한다(이름이 없다고 줄을 못 세우지는 않는다). */
export function levelLabel(levels: string[], depth: number): string {
  return levels[depth] || `${depth + 1}단계`
}
