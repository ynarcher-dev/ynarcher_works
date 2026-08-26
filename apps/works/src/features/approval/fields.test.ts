import { describe, expect, it } from 'vitest'
import {
  columnSum,
  emptyValues,
  formatMoney,
  missingRequired,
  parseFields,
  primaryAmount,
  primaryAmountLabel,
  pruneValues,
  toNumber,
  validateSchema,
  type FormField,
} from './fields'

const EXPENSE: FormField[] = [
  { key: 'body', label: '내용', type: 'RICHTEXT' },
  {
    key: 'expense_items',
    label: '지출 내역',
    type: 'TABLE',
    columns: [
      { key: 'item', label: '항목', type: 'TEXT' },
      { key: 'amount', label: '금액', type: 'MONEY', primaryAmount: true },
    ],
  },
  { key: 'purpose', label: '사용목적', type: 'TEXT', required: true },
]

describe('parseFields', () => {
  it('DB 시드와 같은 모양의 jsonb를 읽는다', () => {
    const parsed = parseFields([
      { key: 'amount', label: '품의 금액', type: 'MONEY', primaryAmount: true },
    ])
    expect(parsed).toEqual([
      {
        key: 'amount',
        label: '품의 금액',
        type: 'MONEY',
        required: false,
        options: undefined,
        primaryAmount: true,
        columns: undefined,
        help: undefined,
      },
    ])
  })

  it('알 수 없는 타입·키 없는 원소는 버리고 나머지는 살린다', () => {
    const parsed = parseFields([
      { key: 'a', label: 'A', type: 'NOPE' },
      { label: '키 없음', type: 'TEXT' },
      { key: 'b', label: 'B', type: 'TEXT' },
      'not an object',
    ])
    expect(parsed.map((f) => f.key)).toEqual(['b'])
  })

  it('배열이 아니면 빈 스키마다', () => {
    expect(parseFields(null)).toEqual([])
    expect(parseFields({ key: 'a' })).toEqual([])
  })

  it('표 안의 중첩 표 열은 허용하지 않는다', () => {
    const parsed = parseFields([
      {
        key: 't',
        label: '표',
        type: 'TABLE',
        columns: [
          { key: 'ok', label: '항목', type: 'TEXT' },
          { key: 'nested', label: '중첩', type: 'TABLE' },
        ],
      },
    ])
    expect(parsed[0]?.columns?.map((c) => c.key)).toEqual(['ok'])
  })
})

describe('toNumber / columnSum', () => {
  it('천단위 쉼표와 공백을 걷어낸다', () => {
    expect(toNumber('41,665,525')).toBe(41665525)
    expect(toNumber(' 1 000 ')).toBe(1000)
    expect(toNumber('')).toBe(null)
    expect(toNumber('금액미정')).toBe(null)
  })

  it('숫자로 읽히지 않는 칸은 건너뛰고 더한다', () => {
    const rows = [{ amount: '1,000' }, { amount: '' }, { amount: '미정' }, { amount: '2500' }]
    expect(columnSum(rows, 'amount')).toBe(3500)
  })
})

describe('primaryAmount', () => {
  it('표의 대표 금액 열 합계를 문서 금액으로 삼는다', () => {
    const values = {
      body: '<p>지출</p>',
      expense_items: [{ item: '청년창업', amount: '4,428,000' }, { item: '스포츠', amount: '9,225,800' }],
      purpose: '프로젝트 비용 지출',
    }
    expect(primaryAmount(EXPENSE, values)).toBe(13653800)
  })

  it('스칼라 MONEY 필드에 표시가 붙으면 그 값이 문서 금액이다', () => {
    const fields: FormField[] = [
      { key: 'amount', label: '품의 금액', type: 'MONEY', primaryAmount: true },
    ]
    expect(primaryAmount(fields, { amount: '3,000,000' })).toBe(3000000)
  })

  it('표시가 없으면 대표 금액이 없다', () => {
    const fields: FormField[] = [{ key: 'body', label: '내용', type: 'RICHTEXT' }]
    expect(primaryAmount(fields, { body: '<p>x</p>' })).toBe(null)
  })
})

describe('missingRequired', () => {
  it('빈 리치텍스트는 태그를 걷어내고 판정한다', () => {
    const fields: FormField[] = [{ key: 'body', label: '내용', type: 'RICHTEXT', required: true }]
    expect(missingRequired(fields, { body: '<p></p>' })).toEqual(['내용'])
    expect(missingRequired(fields, { body: '<p>내용 있음</p>' })).toEqual([])
  })

  it('표는 모든 행이 비어 있으면 미입력이다', () => {
    const fields: FormField[] = [{ ...EXPENSE[1]!, required: true }]
    expect(missingRequired(fields, { expense_items: [{ item: '', amount: '' }] })).toEqual([
      '지출 내역',
    ])
    expect(missingRequired(fields, { expense_items: [{ item: '교통비', amount: '' }] })).toEqual([])
  })

  it('필수가 아닌 필드는 비어도 통과한다', () => {
    expect(missingRequired(EXPENSE, emptyValues(EXPENSE))).toEqual(['사용목적'])
  })
})

describe('pruneValues', () => {
  it('완전히 빈 표 행은 저장 전에 떨어낸다', () => {
    const pruned = pruneValues(EXPENSE, {
      body: '<p>x</p>',
      expense_items: [{ item: '교통비', amount: '1000' }, { item: '', amount: '' }],
      purpose: '출장',
    })
    expect(pruned.expense_items).toEqual([{ item: '교통비', amount: '1000' }])
  })

  it('스키마에 없는 값은 남기지 않는다', () => {
    const pruned = pruneValues([{ key: 'a', label: 'A', type: 'TEXT' }], { a: '1', ghost: '2' })
    expect(Object.keys(pruned)).toEqual(['a'])
  })
})

describe('validateSchema', () => {
  it('올바른 스키마는 오류가 없다', () => {
    expect(validateSchema(EXPENSE)).toEqual([])
  })

  it('키 중복·빈 선택지·빈 표를 잡아낸다', () => {
    const errors = validateSchema([
      { key: 'a', label: 'A', type: 'TEXT' },
      { key: 'a', label: 'B', type: 'SELECT', options: [] },
      { key: 't', label: '표', type: 'TABLE', columns: [] },
    ])
    expect(errors).toEqual([
      '필드 키가 중복됩니다: a',
      '선택 필드에 선택지가 없습니다: B',
      '표에 열이 없습니다: 표',
    ])
  })

  it('대표 금액이 둘 이상이면 막는다', () => {
    const errors = validateSchema([
      { key: 'a', label: 'A', type: 'MONEY', primaryAmount: true },
      { key: 'b', label: 'B', type: 'MONEY', primaryAmount: true },
    ])
    expect(errors).toContain('대표 금액은 한 곳만 지정할 수 있습니다.')
  })

  it('빈 스키마는 저장할 수 없다', () => {
    expect(validateSchema([])).toContain('필드를 하나 이상 추가하세요.')
  })
})

describe('primaryAmountLabel / formatMoney', () => {
  it('대표 금액이 걸린 자리를 사람이 읽는 이름으로 돌려준다', () => {
    expect(primaryAmountLabel(EXPENSE)).toBe('지출 내역 > 금액')
    expect(primaryAmountLabel([{ key: 'a', label: '품의 금액', type: 'MONEY', primaryAmount: true }])).toBe(
      '품의 금액',
    )
    expect(primaryAmountLabel([{ key: 'b', label: '내용', type: 'TEXT' }])).toBe(null)
  })

  it('금액은 천단위 쉼표와 원을 붙인다', () => {
    expect(formatMoney(41665525)).toBe('41,665,525원')
    expect(formatMoney(null)).toBe('-')
  })
})
