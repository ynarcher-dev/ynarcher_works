import { describe, expect, it } from 'vitest'
import {
  budgetSeedDirty,
  isBlankBudget,
  remapBudgetColumns,
  vatIncompatible,
} from './budgetRemap'
import type { BudgetTreeValue } from './budget'
import type { FormField } from './fields'

/** 예산 변경 품의가 원 품의의 예산을 실을 때 열 key가 갈리는 경우만 여기서 본다. */

/** 옛 품의 — 금액 열 하나, 역할 없음. */
const legacy: FormField = {
  key: 'budget',
  label: '예산',
  type: 'BUDGET_TREE',
  columns: [
    { key: 'qty', label: '수량', type: 'NUMBER' },
    { key: 'amount', label: '금액', type: 'MONEY', primaryAmount: true },
    { key: 'note', label: '비고', type: 'TEXT' },
  ],
}

/** 부가세 양식 — 같은 뜻의 칸이 전부 다른 key로 선다. */
const vatForm: FormField = {
  key: 'budget',
  label: '예산',
  type: 'BUDGET_TREE',
  columns: [
    { key: 'qty', label: '수량', type: 'NUMBER' },
    { key: 'col1', label: '과세 유형', type: 'VAT_KIND' },
    { key: 'col2', label: '공급가액', type: 'MONEY', role: 'NET' },
    { key: 'col3', label: '부가세', type: 'MONEY', role: 'VAT' },
    { key: 'col4', label: '합계액', type: 'MONEY', role: 'GROSS', primaryAmount: true },
  ],
}

const value = (values: Record<string, string>): BudgetTreeValue => ({
  levels: ['대분류', '소분류'],
  rows: [
    { id: 'b1', depth: 0, name: '인건비', values: {} },
    { id: 'b2', depth: 1, name: '급여', values },
  ],
})

describe('예산표 열 옮기기', () => {
  it('금액 열 key가 달라도 합계액이 새 양식의 합계액 칸에 선다', () => {
    const out = remapBudgetColumns(value({ amount: '1000000', qty: '2' }), legacy, vatForm)
    expect(out.rows[1]!.values).toEqual({ qty: '2', col4: '1000000' })
    // 줄 id와 층 이름은 그대로여야 이미 나간 지출이 가리킬 자리가 남는다.
    expect(out.rows.map((r) => r.id)).toEqual(['b1', 'b2'])
    expect(out.levels).toEqual(['대분류', '소분류'])
  })

  it('옛 문서의 공급가액·부가세를 추정해 채우지 않는다', () => {
    const out = remapBudgetColumns(value({ amount: '1000000' }), legacy, vatForm)
    expect(out.rows[1]!.values.col2).toBeUndefined()
    expect(out.rows[1]!.values.col3).toBeUndefined()
  })

  it('부가세 양식끼리는 세 칸과 과세 유형이 역할끼리 옮겨진다', () => {
    const out = remapBudgetColumns(
      value({ col1: 'TAXABLE', col2: '1000000', col3: '100000', col4: '1100000' }),
      vatForm,
      legacy,
    )
    // 대상에 공급가액·부가세 칸이 없으면 합계액만 남는다(없는 칸을 만들지 않는다).
    expect(out.rows[1]!.values).toEqual({ amount: '1100000' })
  })

  it('같은 key가 대상에도 있지만 역할이 다르면 역할을 따른다', () => {
    const swapped: FormField = {
      key: 'budget',
      label: '예산',
      type: 'BUDGET_TREE',
      columns: [
        { key: 'amount', label: '단가', type: 'MONEY' },
        { key: 'total', label: '합계액', type: 'MONEY', role: 'GROSS' },
      ],
    }
    const out = remapBudgetColumns(value({ amount: '1000000' }), legacy, swapped)
    // 옛 양식의 'amount'는 합계액이었다 — 이름이 같다고 단가 칸에 넣으면 예산이 0이 된다.
    expect(out.rows[1]!.values).toEqual({ total: '1000000' })
  })
})

describe('빈 예산표 판정', () => {
  it('이름·숫자가 하나라도 적혀 있으면 빈 표가 아니다', () => {
    expect(isBlankBudget({ levels: [], rows: [] })).toBe(true)
    expect(isBlankBudget({ levels: [], rows: [{ id: 'b1', depth: 0, name: '', values: {} }] })).toBe(
      true,
    )
    expect(isBlankBudget(value({ amount: '1000000' }))).toBe(false)
  })
})

describe('부가세 칸 호환', () => {
  it('대상이 쓰는 공급가액·부가세 칸이 변경 양식에 없으면 호환되지 않는다', () => {
    expect(vatIncompatible(vatForm, legacy)).toBe(true)
  })

  it('대상이 합계액만 쓰면 변경 양식에 부가세 칸이 더 있어도 호환된다', () => {
    expect(vatIncompatible(legacy, vatForm)).toBe(false)
    expect(vatIncompatible(vatForm, vatForm)).toBe(false)
  })
})

describe('실어 둔 씨앗 이후 수정 판정', () => {
  const seeded = value({ amount: '1000000' })
  const seededJson = JSON.stringify(seeded)

  it('재조회로 같은 값이 다시 와도 손댄 것이 아니다(편집 내용을 덮지 않는다)', () => {
    expect(budgetSeedDirty(value({ amount: '1000000' }), seededJson)).toBe(false)
  })

  it('금액을 고쳤으면 손댄 표다 — 대상을 바꾸기 전에 물어야 한다', () => {
    expect(budgetSeedDirty(value({ amount: '900000' }), seededJson)).toBe(true)
  })

  it('빈 표는 씨앗이 없어도 손댄 것이 아니다', () => {
    expect(budgetSeedDirty({ levels: [], rows: [] }, null)).toBe(false)
  })
})
