/**
 * 예산표 편집 조작 — 줄 넣기·빼기·층 올리고 내리기·순서 바꾸기.
 *
 * 조작이 언제나 **줄 하나가 아니라 그 아래 딸린 줄까지 한 덩어리로** 움직인다는 것이 요점이다.
 * 부모만 따로 움직이면 자식들이 다른 부모 밑으로 들어가는데, 화면에서는 들여쓰기만 슬쩍
 * 바뀌어 보여 담당자가 알아채지 못한다. 예산 항목이 남의 항목 밑으로 들어간 표는 합계가
 * 맞아도 틀린 표다.
 *
 * 조작 결과는 언제나 normalizeDepths를 통과한다 — 어떤 조작도 부모 없는 자식을 남기지 않는다.
 */
import {
  descendantRange,
  newBudgetRowId,
  normalizeDepths,
  type BudgetRow,
  type BudgetTreeValue,
} from '@/features/approval/budget'

const withRows = (v: BudgetTreeValue, rows: BudgetRow[]): BudgetTreeValue => ({
  ...v,
  rows: normalizeDepths(rows),
})

function blank(taken: string[], depth: number): BudgetRow {
  return { id: newBudgetRowId(taken), depth, name: '', values: {} }
}

/** 빈 예산표 — 맨 위층 한 줄로 시작한다(무엇을 적는 자리인지 보이도록). */
export function emptyBudget(levels: string[]): BudgetTreeValue {
  return { levels: [...levels], rows: [blank([], 0)] }
}

/** 같은 층에 새 줄 — 자기 아래 딸린 줄들 **뒤에** 선다(형제는 자식 다음이다). */
export function addSibling(value: BudgetTreeValue, index: number): BudgetTreeValue {
  const rows = value.rows
  const depth = rows[index]?.depth ?? 0
  const [, end] = descendantRange(rows, index)
  const next = [...rows]
  next.splice(end, 0, blank(rows.map((r) => r.id), depth))
  return withRows(value, next)
}

/** 한 층 아래에 새 줄 — 바로 다음 자리에 선다(첫 자식). */
export function addChild(value: BudgetTreeValue, index: number): BudgetTreeValue {
  const rows = value.rows
  const depth = (rows[index]?.depth ?? 0) + 1
  const next = [...rows]
  next.splice(index + 1, 0, blank(rows.map((r) => r.id), depth))
  return withRows(value, next)
}

/** 표 맨 끝에 맨 위층 줄 하나. 표가 비어 있을 때도 쓴다. */
export function appendRoot(value: BudgetTreeValue): BudgetTreeValue {
  return withRows(value, [...value.rows, blank(value.rows.map((r) => r.id), 0)])
}

/** 줄 빼기 — 그 아래 딸린 줄까지 함께 빠진다. */
export function removeRow(value: BudgetTreeValue, index: number): BudgetTreeValue {
  const [, end] = descendantRange(value.rows, index)
  const next = [...value.rows]
  next.splice(index, end - index)
  return withRows(value, next)
}

/** 그 줄의 층을 한 칸 들일 수 있는가 — 바로 위 줄이 자기보다 얕으면 부모가 될 수 없다. */
export function canIndent(rows: BudgetRow[], index: number): boolean {
  const prev = rows[index - 1]
  return Boolean(prev) && prev!.depth >= (rows[index]?.depth ?? 0)
}

/** 층 들이기 — 딸린 줄도 함께 한 칸씩 들어간다. */
export function indent(value: BudgetTreeValue, index: number): BudgetTreeValue {
  if (!canIndent(value.rows, index)) return value
  const [, end] = descendantRange(value.rows, index)
  return withRows(
    value,
    value.rows.map((r, i) => (i >= index && i < end ? { ...r, depth: r.depth + 1 } : r)),
  )
}

/** 층 내기 — 딸린 줄도 함께 나온다. 맨 위층은 더 나올 곳이 없다. */
export function outdent(value: BudgetTreeValue, index: number): BudgetTreeValue {
  if ((value.rows[index]?.depth ?? 0) === 0) return value
  const [, end] = descendantRange(value.rows, index)
  return withRows(
    value,
    value.rows.map((r, i) =>
      i >= index && i < end ? { ...r, depth: Math.max(0, r.depth - 1) } : r,
    ),
  )
}

/** 바로 위 형제의 자리 — 없으면 -1(맨 위 형제이거나 바로 위가 부모다). */
function prevSiblingStart(rows: BudgetRow[], index: number): number {
  const depth = rows[index]?.depth ?? 0
  for (let i = index - 1; i >= 0; i -= 1) {
    const d = rows[i]!.depth
    if (d === depth) return i
    if (d < depth) return -1
  }
  return -1
}

export function canMove(rows: BudgetRow[], index: number, delta: -1 | 1): boolean {
  if (delta === -1) return prevSiblingStart(rows, index) >= 0
  const [, end] = descendantRange(rows, index)
  const next = rows[end]
  return Boolean(next) && next!.depth === (rows[index]?.depth ?? 0)
}

/**
 * 형제끼리 순서 바꾸기 — 두 덩어리를 통째로 맞바꾼다.
 * 다른 부모 밑으로 건너가지 않는다(그건 순서 바꾸기가 아니라 소속을 옮기는 일이다).
 */
export function moveRow(
  value: BudgetTreeValue,
  index: number,
  delta: -1 | 1,
): BudgetTreeValue {
  const rows = value.rows
  if (!canMove(rows, index, delta)) return value
  const [, end] = descendantRange(rows, index)

  if (delta === -1) {
    const start = prevSiblingStart(rows, index)
    const next = [
      ...rows.slice(0, start),
      ...rows.slice(index, end),
      ...rows.slice(start, index),
      ...rows.slice(end),
    ]
    return withRows(value, next)
  }

  const [, nextEnd] = descendantRange(rows, end)
  const next = [
    ...rows.slice(0, index),
    ...rows.slice(end, nextEnd),
    ...rows.slice(index, end),
    ...rows.slice(nextEnd),
  ]
  return withRows(value, next)
}

/** 항목 이름 고치기. */
export function setName(value: BudgetTreeValue, index: number, name: string): BudgetTreeValue {
  return withRows(
    value,
    value.rows.map((r, i) => (i === index ? { ...r, name } : r)),
  )
}

/** 숫자 칸 고치기. 맨 아래 줄에만 쓰이며 위층 값은 합으로 파생한다. */
export function setCell(
  value: BudgetTreeValue,
  index: number,
  columnKey: string,
  cell: string,
): BudgetTreeValue {
  return withRows(
    value,
    value.rows.map((r, i) =>
      i === index ? { ...r, values: { ...r.values, [columnKey]: cell } } : r,
    ),
  )
}

/** 층 이름 고치기 — 문서마다 다르므로 값에 저장한다(양식은 기본값만 준다). */
export function setLevel(value: BudgetTreeValue, depth: number, label: string): BudgetTreeValue {
  const levels = [...value.levels]
  while (levels.length <= depth) levels.push('')
  levels[depth] = label
  return { ...value, levels }
}

/** 지금 표가 실제로 쓰고 있는 층 수(이름 칸을 몇 개 세울지 정한다). */
export function usedDepth(rows: BudgetRow[]): number {
  return rows.reduce((max, r) => Math.max(max, r.depth), 0) + 1
}
