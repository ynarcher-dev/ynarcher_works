import { describe, expect, it } from 'vitest'
import {
  budgetLineOptions,
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
  addChild,
  addSibling,
  canIndent,
  canMove,
  indent,
  moveRow,
  outdent,
  removeRow,
  setCell,
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
