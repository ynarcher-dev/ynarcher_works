import { describe, expect, it } from 'vitest'
import {
  budgetLineOptions,
  budgetEntries,
  budgetGridGroups,
  budgetGridRows,
  budgetPath,
  budgetTotal,
  descendantRange,
  isLeaf,
  leafRows,
  normalizeDepths,
  parseBudget,
  rollup,
  type BudgetRow,
  type BudgetTreeValue,
} from '@/features/approval/budget'
import {
  addBudgetSiblingBranch,
  addChild,
  appendBudgetEntry,
  addSibling,
  canIndent,
  canMoveBudgetEntry,
  canMove,
  emptyBudget,
  indent,
  moveRow,
  moveBudgetEntry,
  outdent,
  removeRow,
  removeBudgetEntry,
  setBudgetPathCell,
  setLevelCount,
  setCell,
  setName,
  usedDepth,
} from '@/features/approval/budgetEdit'

/** `세목 › 비목 › 세세목` 3층 표. 금액은 맨 아래 줄에만 있다. */
function sample(): BudgetTreeValue {
  const row = (id: string, depth: number, name: string, amount?: string): BudgetRow => ({
    id,
    depth,
    name,
    values: amount === undefined ? {} : { amount },
  })
  return {
    levels: ['세목', '비목', '세세목'],
    rows: [
      row('a', 0, '인건비'),
      row('a1', 1, '강사료'),
      row('a1x', 2, '외부 강사', '2000000'),
      row('a1y', 2, '내부 강사', '600000'),
      row('a2', 1, '진행 인력', '600000'),
      row('b', 0, '운영비'),
      row('b1', 1, '장소 대관', '1500000'),
    ],
  }
}

describe('예산표 — 맨 아래 줄과 위층', () => {
  it('다음 줄이 더 깊지 않으면 맨 아래 줄이다', () => {
    const { rows } = sample()
    expect(rows.map((_, i) => isLeaf(rows, i))).toEqual([
      false, // 인건비
      false, // 강사료
      true, // 외부 강사
      true, // 내부 강사
      true, // 진행 인력
      false, // 운영비
      true, // 장소 대관
    ])
  })

  it('마지막 줄은 언제나 맨 아래 줄이다', () => {
    const rows = sample().rows
    expect(isLeaf(rows, rows.length - 1)).toBe(true)
  })

  it('딸린 줄의 범위는 자기보다 얕은 줄을 만나기 전까지다', () => {
    const { rows } = sample()
    expect(descendantRange(rows, 0)).toEqual([1, 5]) // 인건비 아래 4줄
    expect(descendantRange(rows, 1)).toEqual([2, 4]) // 강사료 아래 2줄
    expect(descendantRange(rows, 6)).toEqual([7, 7]) // 맨 아래 줄은 비어 있다
  })

  it('금액을 적는 자리는 맨 아래 줄뿐이다', () => {
    expect(leafRows(sample().rows).map((r) => r.id)).toEqual(['a1x', 'a1y', 'a2', 'b1'])
  })
})

describe('예산표 — 합계는 아래에서 올라온다', () => {
  it('위층 값은 자기 아래 맨 아래 줄들의 합이다', () => {
    const { rows } = sample()
    const sums = rollup(rows, 'amount')
    expect(sums.get('a1')).toBe(2600000) // 외부 + 내부 강사
    expect(sums.get('a')).toBe(3200000) // 강사료 + 진행 인력
    expect(sums.get('b')).toBe(1500000)
  })

  it('맨 아래 줄은 적힌 값을 그대로 쓴다', () => {
    expect(rollup(sample().rows, 'amount').get('a1x')).toBe(2000000)
  })

  it('아무 값도 없는 위층은 0이 아니라 null이다 — 안 적은 것과 0원은 다르다', () => {
    const value: BudgetTreeValue = {
      levels: [],
      rows: [
        { id: 'p', depth: 0, name: '미정', values: {} },
        { id: 'c', depth: 1, name: '미정', values: {} },
      ],
    }
    expect(rollup(value.rows, 'amount').get('p')).toBeNull()
  })

  it('표 전체 합계는 맨 아래 줄들의 합이다 — 위층을 두 번 세지 않는다', () => {
    expect(budgetTotal(sample().rows, 'amount')).toBe(4700000)
  })

  it('쉼표가 섞인 값도 같은 수로 읽는다', () => {
    const rows: BudgetRow[] = [{ id: 'x', depth: 0, name: '', values: { amount: '1,200,000' } }]
    expect(budgetTotal(rows, 'amount')).toBe(1200000)
  })
})

describe('예산표 — 어느 줄인지 말하기', () => {
  it('위층 이름을 이어 붙여 자리를 밝힌다', () => {
    const { rows } = sample()
    expect(budgetPath(rows, 2)).toBe('인건비 › 강사료 › 외부 강사')
    expect(budgetPath(rows, 4)).toBe('인건비 › 진행 인력')
    expect(budgetPath(rows, 0)).toBe('인건비')
  })

  it('지출결의가 고를 수 있는 것은 맨 아래 줄뿐이다', () => {
    const options = budgetLineOptions(sample(), 'amount')
    expect(options.map((o) => o.id)).toEqual(['a1x', 'a1y', 'a2', 'b1'])
    expect(options[0]).toEqual({
      id: 'a1x',
      path: '인건비 › 강사료 › 외부 강사',
      budget: 2000000,
    })
  })
})

describe('예산표 — 분류 단계를 가로 열로 편다', () => {
  it('예전 트리는 맨 아래 줄마다 전체 분류 경로를 가진 행으로 읽는다', () => {
    const rows = budgetEntries(sample())
    expect(rows.map((row) => row.id)).toEqual(['a1x', 'a1y', 'a2', 'b1'])
    expect(rows[0]!.path).toEqual(['인건비', '강사료', '외부 강사'])
    expect(rows[2]!.path).toEqual(['인건비', '진행 인력', ''])
    expect(budgetTotal(rows, 'amount')).toBe(4700000)
  })

  it('단계 수를 줄이면 분류 칸만 줄고 예산 줄 id와 금액은 유지된다', () => {
    const next = setLevelCount(sample(), 2)
    const entries = budgetEntries(next)
    expect(next.levels).toEqual(['세목', '비목'])
    expect(entries.map((row) => row.id)).toEqual(['a1x', 'a1y', 'a2', 'b1'])
    expect(entries[0]!.path).toEqual(['인건비', '강사료'])
    expect(budgetTotal(next.rows, 'amount')).toBe(4700000)
  })

  it('비어 있는 마지막 분류 칸은 지출결의의 예산 경로에 붙이지 않는다', () => {
    const tree = setLevelCount(sample(), 3)
    expect(budgetLineOptions(tree, 'amount').find((line) => line.id === 'a2')?.path).toBe(
      '인건비 › 진행 인력',
    )
  })

  it('단계 이름과 행의 분류값은 서로 독립적이다', () => {
    const tree = setLevelCount(sample(), 3)
    const next = setBudgetPathCell(tree, 0, 2, '온라인 강사')
    const entries = budgetEntries(next)
    expect(next.levels).toEqual(['세목', '비목', '세세목'])
    expect(entries[0]!.path).toEqual(['인건비', '강사료', '온라인 강사'])
    expect(entries[0]!.name).toBe('온라인 강사')
  })

  it('리모컨은 행 하나의 순서를 바꾸거나 삭제할 뿐 분류 구조를 바꾸지 않는다', () => {
    const tree = setLevelCount(sample(), 3)
    const moved = moveBudgetEntry(tree, 1, -1)
    expect(budgetEntries(moved).slice(0, 2).map((row) => row.id)).toEqual(['a1y', 'a1x'])
    const removed = removeBudgetEntry(moved, 0)
    expect(budgetEntries(removed).some((row) => row.id === 'a1y')).toBe(false)
    const appended = appendBudgetEntry(removed)
    const entries = budgetEntries(appended)
    expect(entries).toHaveLength(4)
    expect(entries[3]!.path).toEqual(['', '', ''])
  })

  it('같은 상위 분류는 자식 수만큼 세로로 병합된다', () => {
    const tree = setLevelCount(sample(), 3)
    const grid = budgetGridRows(tree)
    expect(grid[0]!.cells[0]?.rowSpan).toBe(3)
    expect(grid[1]!.cells[0]).toBeNull()
    expect(grid[2]!.cells[0]).toBeNull()
    expect(grid[0]!.cells[1]?.rowSpan).toBe(2)
    expect(grid[2]!.cells[1]?.rowSpan).toBe(1)
  })

  it('표 아래 추가는 이름이 비어 있어도 별도의 새 대분류를 만든다', () => {
    const next = appendBudgetEntry(emptyBudget(['대분류', '중분류', '소분류']))
    const grid = budgetGridRows(next)

    expect(grid).toHaveLength(2)
    expect(grid[0]!.cells[0]?.rowSpan).toBe(1)
    expect(grid[1]!.cells[0]?.rowSpan).toBe(1)
    expect(grid[0]!.nodePath[0]).not.toBe(grid[1]!.nodePath[0])
  })

  it('가로 행은 대분류마다 소계를 붙일 수 있는 묶음으로 나뉜다', () => {
    const groups = budgetGridGroups(setLevelCount(sample(), 3))

    expect(groups).toHaveLength(2)
    expect(groups.map((group) => group.rows.length)).toEqual([3, 1])
    expect(groups.map((group) => group.startIndex)).toEqual([0, 3])
    expect(
      groups.map((group) => budgetTotal(group.rows.map((row) => row.row), 'amount')),
    ).toEqual([3200000, 1500000])
  })

  it('대분류 입력칸의 추가는 바로 뒤에 새 대분류를 만든다', () => {
    const tree = setLevelCount(sample(), 3)
    const firstRoot = budgetGridGroups(tree)[0]!.rootIndex
    const next = addBudgetSiblingBranch(tree, firstRoot)
    const groups = budgetGridGroups(next)

    expect(groups).toHaveLength(3)
    expect(next.rows[groups[0]!.rootIndex]!.name).toBe('인건비')
    expect(next.rows[groups[1]!.rootIndex]!.name).toBe('')
    expect(next.rows[groups[2]!.rootIndex]!.name).toBe('운영비')
  })

  it('각 입력칸의 추가는 같은 단계의 형제 가지를 만든다', () => {
    const initial = emptyBudget(['대분류', '중분류', '소분류'])
    const middleIndex = budgetGridRows(initial)[0]!.cells[1]!.nodeIndex
    const withMiddleBranch = addBudgetSiblingBranch(initial, middleIndex)
    const middleGrid = budgetGridRows(withMiddleBranch)

    expect(middleGrid).toHaveLength(2)
    expect(middleGrid[0]!.cells[0]?.rowSpan).toBe(2)
    expect(middleGrid[0]!.cells[1]?.rowSpan).toBe(1)
    expect(middleGrid[1]!.cells[1]?.rowSpan).toBe(1)

    const leafIndex = middleGrid[0]!.cells[2]!.nodeIndex
    const withLeafBranch = addBudgetSiblingBranch(withMiddleBranch, leafIndex)
    const leafGrid = budgetGridRows(withLeafBranch)

    expect(leafGrid).toHaveLength(3)
    expect(leafGrid[0]!.cells[0]?.rowSpan).toBe(3)
    expect(leafGrid[0]!.cells[1]?.rowSpan).toBe(2)
  })

  it('세부항목은 선택한 중분류 아래에서만 늘어난다', () => {
    const initial = emptyBudget(['대분류', '중분류', '세부항목'])
    const middleIndex = budgetGridRows(initial)[0]!.cells[1]!.nodeIndex
    const secondMiddle = addBudgetSiblingBranch(initial, middleIndex)
    const secondMiddleIndex = budgetGridRows(secondMiddle)[1]!.cells[1]!.nodeIndex
    const withThreeMiddleRows = addBudgetSiblingBranch(secondMiddle, secondMiddleIndex)
    const before = budgetGridRows(withThreeMiddleRows)
    const firstLeafIndex = before[0]!.cells[2]!.nodeIndex
    const next = addBudgetSiblingBranch(withThreeMiddleRows, firstLeafIndex)
    const grid = budgetGridRows(next)

    expect(grid).toHaveLength(4)
    expect(grid[0]!.cells[1]?.rowSpan).toBe(2)
    expect(grid[2]!.cells[1]?.rowSpan).toBe(1)
    expect(grid[3]!.cells[1]?.rowSpan).toBe(1)
  })

  it('마지막 자식을 지우면 비게 된 상위 가지도 함께 정리한다', () => {
    const twoRoots = appendBudgetEntry(emptyBudget(['대분류', '중분류', '소분류']))
    const removed = removeBudgetEntry(twoRoots, 0)
    const grid = budgetGridRows(removed)

    expect(grid).toHaveLength(1)
    expect(removed.rows).toHaveLength(3)
    expect(grid[0]!.nodePath).toHaveLength(3)
  })

  it('병합된 상위 노드의 이름은 한 번 고치면 모든 하위 경로에 반영된다', () => {
    const tree = setLevelCount(sample(), 3)
    const nodeIndex = budgetGridRows(tree)[0]!.cells[0]!.nodeIndex
    const next = setName(tree, nodeIndex, '인력비')
    expect(
      budgetLineOptions(next, 'amount')
        .slice(0, 3)
        .map((line) => line.path),
    ).toEqual([
      '인력비 › 강사료 › 외부 강사',
      '인력비 › 강사료 › 내부 강사',
      '인력비 › 진행 인력',
    ])
  })

  it('분류 경계의 순서 버튼은 상위 가지 전체를 옮긴다', () => {
    const tree = setLevelCount(sample(), 3)
    expect(canMoveBudgetEntry(tree, 3, -1)).toBe(true)
    const next = moveBudgetEntry(tree, 3, -1)
    expect(budgetEntries(next).map((row) => row.id)).toEqual(['b1', 'a1x', 'a1y', 'a2'])
    expect(budgetGridRows(next)[0]!.cells[0]?.rowSpan).toBe(1)
    expect(budgetGridRows(next)[1]!.cells[0]?.rowSpan).toBe(3)
  })
})

describe('예산표 — 저장된 값 읽기', () => {
  it('모양이 아닌 값은 빈 표로 본다(문서를 못 열게 하지 않는다)', () => {
    expect(parseBudget(null).rows).toEqual([])
    expect(parseBudget('x').rows).toEqual([])
    expect(parseBudget([]).rows).toEqual([])
  })

  it('층을 건너뛴 값은 그릴 수 있는 깊이로 당긴다', () => {
    const parsed = parseBudget({ levels: [], rows: [{ id: 'a', depth: 3, name: '첫 줄' }] })
    expect(parsed.rows[0]!.depth).toBe(0)
  })

  it('첫 줄이 0층이 아니면 0층으로 당긴다 — 부모 없는 자식을 만들지 않는다', () => {
    const rows = normalizeDepths([
      { id: 'a', depth: 2, name: '', values: {} },
      { id: 'b', depth: 5, name: '', values: {} },
    ])
    expect(rows.map((r) => r.depth)).toEqual([0, 1])
  })

  it('id가 없는 줄에도 자리를 준다', () => {
    expect(parseBudget({ rows: [{ name: '이름만' }] }).rows[0]!.id).toBe('row-0')
  })
})

describe('예산표 편집 — 딸린 줄까지 한 덩어리로 움직인다', () => {
  it('같은 층 새 줄은 자기 자식들 뒤에 선다', () => {
    const next = addSibling(sample(), 1) // 강사료 옆
    expect(next.rows.map((r) => r.id)).toEqual([
      'a', 'a1', 'a1x', 'a1y', next.rows[4]!.id, 'a2', 'b', 'b1',
    ])
    expect(next.rows[4]!.depth).toBe(1)
  })

  it('아래층 새 줄은 바로 다음 자리에 선다', () => {
    const next = addChild(sample(), 4) // 진행 인력 아래
    expect(next.rows[5]!.depth).toBe(2)
  })

  it('줄을 빼면 그 아래 딸린 줄도 함께 빠진다', () => {
    const next = removeRow(sample(), 1) // 강사료
    expect(next.rows.map((r) => r.id)).toEqual(['a', 'a2', 'b', 'b1'])
  })

  it('층을 들이면 딸린 줄도 함께 들어간다', () => {
    const next = indent(sample(), 1) // 강사료를 한 칸 더
    expect(next.rows.slice(1, 4).map((r) => r.depth)).toEqual([1, 2, 2])
  })

  it('바로 위 줄이 더 얕으면 들일 수 없다 — 부모가 될 수 없는 자리다', () => {
    expect(canIndent(sample().rows, 1)).toBe(false) // 강사료(1층) 위는 인건비(0층)
    expect(canIndent(sample().rows, 3)).toBe(true) // 내부 강사 위는 외부 강사(같은 층)
  })

  it('맨 위층은 더 나올 곳이 없다', () => {
    expect(outdent(sample(), 0)).toEqual(sample())
  })

  it('층을 내면 딸린 줄도 함께 나온다', () => {
    const next = outdent(sample(), 1)
    expect(next.rows.slice(1, 4).map((r) => r.depth)).toEqual([0, 1, 1])
  })

  it('순서 바꾸기는 형제끼리만 — 다른 부모 밑으로 건너가지 않는다', () => {
    const rows = sample().rows
    expect(canMove(rows, 2, -1)).toBe(false) // 외부 강사는 첫 형제
    expect(canMove(rows, 3, -1)).toBe(true) // 내부 강사 ↔ 외부 강사
    expect(canMove(rows, 4, 1)).toBe(false) // 진행 인력 다음은 다른 부모(운영비)
  })

  it('순서를 바꾸면 두 덩어리가 통째로 자리를 맞바꾼다', () => {
    const next = moveRow(sample(), 4, -1) // 진행 인력을 강사료 앞으로
    expect(next.rows.map((r) => r.id)).toEqual(['a', 'a2', 'a1', 'a1x', 'a1y', 'b', 'b1'])
  })

  it('맨 위층 덩어리를 옮겨도 자식이 따라간다', () => {
    const next = moveRow(sample(), 5, -1) // 운영비를 인건비 앞으로
    expect(next.rows.map((r) => r.id)).toEqual(['b', 'b1', 'a', 'a1', 'a1x', 'a1y', 'a2'])
  })

  it('값을 고쳐도 줄 id는 그대로다 — 지출이 가리키던 자리가 살아 있어야 한다', () => {
    const next = setCell(sample(), 2, 'amount', '3000000')
    expect(next.rows[2]!.id).toBe('a1x')
    expect(budgetTotal(next.rows, 'amount')).toBe(5700000)
  })

  it('쓰고 있는 층 수를 센다(층 이름 칸을 몇 개 세울지)', () => {
    expect(usedDepth(sample().rows)).toBe(3)
  })
})
