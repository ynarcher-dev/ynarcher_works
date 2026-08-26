import { describe, expect, it } from 'vitest'
import { aggregate, docAmount, inPeriod, primaryTable, totalOf, type AggregateDoc } from './aggregate'
import type { FormField } from './fields'

const EXPENSE_FIELDS: FormField[] = [
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
]

function doc(partial: Partial<AggregateDoc> = {}): AggregateDoc {
  return {
    id: 'd1',
    title: '지출의 건',
    docNo: '지결-260826-0001',
    createdAt: '2026-08-26T09:00:00Z',
    departmentId: 'dept-1',
    amount: null,
    fields: EXPENSE_FIELDS,
    values: { body: '', expense_items: [] },
    ...partial,
  }
}

describe('primaryTable', () => {
  it('대표 금액이 걸린 표와 그 금액 열을 찾는다', () => {
    expect(primaryTable(EXPENSE_FIELDS)).toEqual({
      field: EXPENSE_FIELDS[1],
      amountKey: 'amount',
    })
  })

  it('표가 없으면 null이다', () => {
    expect(primaryTable([{ key: 'a', label: 'A', type: 'MONEY', primaryAmount: true }])).toBe(null)
  })
})

describe('docAmount', () => {
  it('DB가 파생해 둔 amount를 우선한다', () => {
    expect(docAmount(doc({ amount: 4_000_000 }))).toBe(4_000_000)
  })

  it('amount가 없으면 표의 금액 열을 더한다', () => {
    const d = doc({
      values: {
        body: '',
        expense_items: [{ item: 'A', amount: '1,000' }, { item: 'B', amount: '2,500' }],
      },
    })
    expect(docAmount(d)).toBe(3500)
  })

  it('스칼라 대표 금액도 읽는다', () => {
    const d = doc({
      fields: [{ key: 'amt', label: '품의 금액', type: 'MONEY', primaryAmount: true }],
      values: { amt: '900,000' },
    })
    expect(docAmount(d)).toBe(900000)
  })
})

describe('aggregate — 항목별', () => {
  it('문서 경계를 넘어 같은 이름의 항목을 더한다', () => {
    const docs = [
      doc({
        id: 'd1',
        values: {
          body: '',
          expense_items: [
            { item: '2026 청년창업', amount: '4,428,000' },
            { item: '2026 스포츠', amount: '9,225,800' },
          ],
        },
      }),
      doc({
        id: 'd2',
        values: {
          body: '',
          expense_items: [{ item: '2026 청년창업', amount: '1,000,000' }],
        },
      }),
    ]
    const rows = aggregate(docs, 'item')
    expect(rows).toEqual([
      { key: '2026 스포츠', label: '2026 스포츠', total: 9225800, count: 1 },
      { key: '2026 청년창업', label: '2026 청년창업', total: 5428000, count: 2 },
    ])
    expect(totalOf(rows)).toBe(14653800)
  })

  it('이름 없는 행도 한 항목으로 모은다', () => {
    const rows = aggregate(
      [doc({ values: { body: '', expense_items: [{ item: '  ', amount: '500' }] } })],
      'item',
    )
    expect(rows).toEqual([{ key: '(이름 없음)', label: '(이름 없음)', total: 500, count: 1 }])
  })

  it('금액으로 읽히지 않는 행은 집계에서 빠진다', () => {
    const rows = aggregate(
      [doc({ values: { body: '', expense_items: [{ item: 'A', amount: '미정' }] } })],
      'item',
    )
    expect(rows).toEqual([])
  })

  it('표가 없는 양식은 문서 자체가 한 항목이다', () => {
    const rows = aggregate(
      [
        doc({
          fields: [{ key: 'amt', label: '금액', type: 'MONEY', primaryAmount: true }],
          values: { amt: '700' },
        }),
      ],
      'item',
    )
    expect(rows).toEqual([{ key: '(항목 없음)', label: '(항목 없음)', total: 700, count: 1 }])
  })
})

describe('aggregate — 문서별·월별', () => {
  it('문서별은 금액 큰 순으로 세운다', () => {
    const rows = aggregate(
      [doc({ id: 'a', amount: 100 }), doc({ id: 'b', docNo: null, title: '무번호', amount: 300 })],
      'document',
    )
    expect(rows.map((r) => r.key)).toEqual(['b', 'a'])
    expect(rows[0]!.label).toBe('무번호')
    expect(rows[1]!.label).toBe('지결-260826-0001 지출의 건')
  })

  it('월별은 시간순으로 세운다', () => {
    const rows = aggregate(
      [
        doc({ id: 'a', createdAt: '2026-08-01T00:00:00Z', amount: 10 }),
        doc({ id: 'b', createdAt: '2026-07-15T00:00:00Z', amount: 20 }),
        doc({ id: 'c', createdAt: '2026-08-20T00:00:00Z', amount: 30 }),
      ],
      'month',
    )
    expect(rows).toEqual([
      { key: '2026-07', label: '2026-07', total: 20, count: 1 },
      { key: '2026-08', label: '2026-08', total: 40, count: 2 },
    ])
  })
})

describe('inPeriod', () => {
  it('경계일을 포함하고 빈 값은 무제한이다', () => {
    const at = '2026-08-26T09:00:00Z'
    expect(inPeriod(at, '2026-08-26', '2026-08-26')).toBe(true)
    expect(inPeriod(at, '2026-08-27', '')).toBe(false)
    expect(inPeriod(at, '', '2026-08-25')).toBe(false)
    expect(inPeriod(at, '', '')).toBe(true)
  })
})
