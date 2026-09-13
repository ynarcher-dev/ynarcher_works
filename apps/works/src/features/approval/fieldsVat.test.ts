import { describe, expect, it } from 'vitest'
import {
  amountColumns,
  amountIssues,
  budgetAmountFormula,
  hasVatColumns,
  parseFields,
  validateSchema,
  type FormColumn,
  type FormField,
} from './fields'

/** 부가세 열(역할·과세 유형)이 스키마 계층에 더해지면서 생긴 규칙만 여기서 본다. */

const vatTable = (columns: FormColumn[]): FormField => ({
  key: 'expense_items',
  label: '지출 내역',
  type: 'TABLE',
  columns,
})

const VAT_COLUMNS: FormColumn[] = [
  { key: 'budgetLine', label: '예산 줄', type: 'BUDGET_REF' },
  { key: 'kind', label: '과세 유형', type: 'VAT_KIND' },
  { key: 'net', label: '공급가액', type: 'MONEY', role: 'NET' },
  { key: 'vat', label: '부가세', type: 'MONEY', role: 'VAT' },
  { key: 'gross', label: '합계액', type: 'MONEY', role: 'GROSS', primaryAmount: true },
]

describe('금액 칸 가리기', () => {
  it('역할이 대표 금액보다 먼저 합계액을 정한다', () => {
    const field = vatTable([
      { key: 'net', label: '공급가액', type: 'MONEY', primaryAmount: true },
      { key: 'gross', label: '합계액', type: 'MONEY', role: 'GROSS' },
    ])
    expect(amountColumns(field).gross?.key).toBe('gross')
  })

  it('역할이 없는 옛 양식은 종전 규칙 그대로다', () => {
    const field = vatTable([
      { key: 'item', label: '항목', type: 'TEXT' },
      { key: 'amount', label: '금액', type: 'MONEY', primaryAmount: true },
    ])
    expect(amountColumns(field).gross?.key).toBe('amount')
    expect(hasVatColumns(field)).toBe(false)
  })

  it('예산 줄과 과세 유형 칸을 함께 집어낸다', () => {
    const cols = amountColumns(vatTable(VAT_COLUMNS))
    expect([cols.net?.key, cols.vat?.key, cols.gross?.key, cols.kind?.key, cols.ref?.key]).toEqual([
      'net',
      'vat',
      'gross',
      'kind',
      'budgetLine',
    ])
    expect(hasVatColumns(vatTable(VAT_COLUMNS))).toBe(true)
  })

  it('숫자가 아닌 열에 붙은 역할은 저장값에서 버린다', () => {
    const parsed = parseFields([
      {
        key: 't',
        label: '표',
        type: 'TABLE',
        columns: [
          { key: 'a', label: '메모', type: 'TEXT', role: 'GROSS' },
          { key: 'b', label: '합계액', type: 'MONEY', role: 'gross' },
        ],
      },
    ])
    expect(parsed[0]?.columns?.[0]?.role).toBeUndefined()
    expect(parsed[0]?.columns?.[1]?.role).toBe('GROSS')
  })

  it('부가세 열이 있어도 수량 × 단가 산식은 살아 있다', () => {
    expect(
      budgetAmountFormula({
        key: 'budget',
        label: '예산',
        type: 'BUDGET_TREE',
        levels: ['대분류'],
        columns: [
          { key: 'qty', label: '수량', type: 'NUMBER' },
          { key: 'unitPrice', label: '단가', type: 'MONEY' },
          { key: 'net', label: '공급가액', type: 'MONEY', role: 'NET' },
          { key: 'vat', label: '부가세', type: 'MONEY', role: 'VAT' },
          { key: 'gross', label: '합계액', type: 'MONEY', role: 'GROSS', primaryAmount: true },
        ],
      }),
    ).toEqual({ qtyKey: 'qty', unitPriceKey: 'unitPrice', amountKey: 'gross', money: true })
  })
})

describe('양식 검사', () => {
  it('세 역할 중 일부만 두면 막는다', () => {
    expect(
      validateSchema([
        vatTable([
          { key: 'net', label: '공급가액', type: 'MONEY', role: 'NET' },
          { key: 'gross', label: '합계액', type: 'MONEY', role: 'GROSS', primaryAmount: true },
        ]),
      ]),
    ).toContainEqual(expect.stringContaining('모두 필요합니다'))
  })

  it('같은 역할을 두 열에 붙이면 막는다', () => {
    expect(
      validateSchema([
        vatTable([...VAT_COLUMNS, { key: 'gross2', label: '합계액2', type: 'MONEY', role: 'GROSS' }]),
      ]),
    ).toContainEqual(expect.stringContaining('합계액 열은 하나만'))
  })

  it('과세 유형만 두고 금액 역할이 없으면 막는다', () => {
    expect(
      validateSchema([
        vatTable([
          { key: 'kind', label: '과세 유형', type: 'VAT_KIND' },
          { key: 'amount', label: '금액', type: 'MONEY', primaryAmount: true },
        ]),
      ]),
    ).toContainEqual(expect.stringContaining('금액 역할을 지정하지 않았습니다'))
  })

  it('짝이 맞는 부가세 표는 통과한다', () => {
    expect(validateSchema([vatTable(VAT_COLUMNS)])).toEqual([])
  })
})

describe('해석할 수 없는 금액', () => {
  const legacyTable = vatTable([
    { key: 'budgetLine', label: '예산 줄', type: 'BUDGET_REF' },
    { key: 'amount', label: '금액', type: 'MONEY', primaryAmount: true },
  ])

  it('부가세 표의 오타는 빈 행으로 통과하지 않는다', () => {
    expect(
      amountIssues([vatTable(VAT_COLUMNS)], { expense_items: [{ gross: '1oo', net: '', vat: '' }] }),
    ).toContainEqual(expect.stringContaining('숫자로 읽을 수 없는'))
  })

  it('합계액 한 칸뿐인 옛 지출 표도 오타는 막는다', () => {
    expect(amountIssues([legacyTable], { expense_items: [{ amount: 'Infinity' }] })).toContainEqual(
      expect.stringContaining('숫자로 읽을 수 없는'),
    )
  })

  it('옛 문서의 쉼표 금액과 진짜 빈 행은 그대로 통과한다', () => {
    expect(amountIssues([legacyTable], { expense_items: [{ amount: '1,100,000' }] })).toEqual([])
    expect(amountIssues([legacyTable], { expense_items: [{ amount: '' }] })).toEqual([])
  })
})
