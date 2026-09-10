/**
 * 품의서 예산표 — 층(트리)이 있는 표의 순수 계층.
 *
 * **이 모듈이 있는 이유는 사업마다 예산 항목의 층 이름과 층 수가 다르기 때문이다.**
 * 어떤 사업은 `대분류 › 중분류`로 짜고 어떤 사업은 `세목 › 비목 › 세세목`으로 짠다.
 * 층 이름을 코드가 정하면 그 목록에 없는 사업은 예산을 적을 수 없으므로, 층 이름과 층 수는
 * 문서가 갖고(levels) 코드는 **"몇 번째 층인가"만** 안다. 층 이름은 이름표일 뿐 계산에
 * 끼지 않으므로, 층이 둘이든 다섯이든 차감·합계 방식이 같다.
 *
 * **금액은 맨 아래 줄에만 적는다.** 위층 금액은 아래 줄의 합으로 파생한다 — 사람이 위층에도
 * 적을 수 있게 두면 위와 아래가 어긋나는 날이 오고, 그때 어느 쪽이 진짜 예산인지 판정할
 * 근거가 없다. 지출결의가 가리키는 자리도 맨 아래 줄뿐이라, 두 규칙이 같은 사실을 말한다.
 *
 * 저장 형태는 평평한 배열 + 깊이(depth)다. 부모 id로 잇지 않는 이유는 표가 **줄의 순서**로
 * 읽히는 물건이기 때문이다 — 부모 포인터로 저장하면 화면에 세울 때마다 순서를 다시 만들어야
 * 하고, 같은 트리가 두 가지 순서로 그려질 수 있다.
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
export const DEFAULT_BUDGET_LEVELS = ['대분류', '중분류', '세부항목']

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
  const parts: string[] = []
  let want = rows[index]?.depth ?? 0
  for (let i = index; i >= 0; i -= 1) {
    const row = rows[i]!
    if (row.depth === want) {
      parts.unshift(row.name || '(이름 없음)')
      want -= 1
      if (want < 0) break
    }
  }
  return parts.join(' › ')
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
