import { describe, expect, it } from 'vitest'
import {
  approvalBodyCardHeading,
  expenseSectionTitle,
  expenseTableSections,
  expenseTotalsAgree,
  splitExpenseSections,
  usesSectionCards,
} from './expenseSections'
import type { FormField } from './fields'

/** 현재 표준 지출결의서(지결)의 필드 구성 — 시드 + 예산 줄·송금 요청 보강 이후. */
const EXPENSE_FIELDS: FormField[] = [
  { key: 'body', label: '내용', type: 'RICHTEXT' },
  {
    key: 'expense_items',
    label: '지출 내역',
    type: 'TABLE',
    columns: [
      { key: 'budgetLine', label: '예산 줄', type: 'BUDGET_REF' },
      { key: 'item', label: '항목', type: 'TEXT' },
      { key: 'amount', label: '금액', type: 'MONEY', primaryAmount: true },
    ],
  },
  {
    key: 'remittances',
    label: '송금 요청',
    type: 'TABLE',
    columns: [
      { key: 'partner', label: '거래처', type: 'PARTNER_REF' },
      { key: 'amount', label: '송금액', type: 'MONEY' },
      { key: 'requestOn', label: '송금 요청일', type: 'DATE' },
    ],
  },
]

/** 법인카드 지출결의서 — 지출 내역만 있고 송금 요청 표는 없다. */
const CARD_FIELDS: FormField[] = [
  { key: 'body', label: '내용', type: 'RICHTEXT' },
  {
    key: 'expense_items',
    label: '지출 내역',
    type: 'TABLE',
    columns: [
      { key: 'budgetLine', label: '예산 줄', type: 'BUDGET_REF' },
      { key: 'item', label: '항목', type: 'TEXT' },
      { key: 'amount', label: '금액', type: 'MONEY', primaryAmount: true },
    ],
  },
  { key: 'account', label: '계정과목', type: 'TEXT' },
]

/** 다른 양식(휴가신청서) — 표도 없고 지출 키도 없다. */
const LEAVE_FIELDS: FormField[] = [
  { key: 'leave_type', label: '휴가 구분', type: 'SELECT', options: ['연차', '반차'] },
  { key: 'start_date', label: '시작일', type: 'DATE', required: true },
  { key: 'reason', label: '사유', type: 'TEXT' },
]

describe('usesSectionCards', () => {
  it('양식을 가리지 않는다 — 지출결의서도 법인카드도 휴가도 참이다', () => {
    // 카드가 실제로 서는지는 splitExpenseSections가 답한다. 이 판정은 그 앞의 문 하나다.
    expect(usesSectionCards({ security_grade: 'A등급' })).toBe(true)
    expect(usesSectionCards({ security_grade: 'B등급' })).toBe(true)
    expect(usesSectionCards({})).toBe(true)
    expect(usesSectionCards({ security_grade: null })).toBe(true)
  })

  it('하이웍스 복원 양식만 거짓이다', () => {
    // 복원 문서의 본문은 복원 당시 모양 그대로 읽혀야 한다(마이그레이션과 같은 문장).
    expect(usesSectionCards({ security_grade: '하이웍스 원본' })).toBe(false)
  })

  it('양식을 아직 고르지 않았으면 참이다 — 가를 필드가 없어 결과도 비어 있다', () => {
    expect(usesSectionCards(null)).toBe(true)
    expect(usesSectionCards(undefined)).toBe(true)
  })
})

describe('splitExpenseSections', () => {
  it('표준 지출결의서를 본문·지출 내역·송금 요청 셋으로 가른다', () => {
    const split = splitExpenseSections(EXPENSE_FIELDS)
    expect(split.body.map((f) => f.key)).toEqual(['body'])
    expect(split.expenseItems?.key).toBe('expense_items')
    expect(split.remittances?.key).toBe('remittances')
  })

  it('본문 필드의 순서는 양식이 정한 그대로 남는다', () => {
    const split = splitExpenseSections([
      { key: 'purpose', label: '사용목적', type: 'TEXT' },
      EXPENSE_FIELDS[1]!,
      { key: 'body', label: '내용', type: 'RICHTEXT' },
      EXPENSE_FIELDS[2]!,
      { key: 'account', label: '계정과목', type: 'TEXT' },
    ])
    expect(split.body.map((f) => f.key)).toEqual(['purpose', 'body', 'account'])
  })

  it('두 표가 없는 양식은 모든 필드가 본문에 남는다(다른 양식 비회귀)', () => {
    const split = splitExpenseSections(LEAVE_FIELDS)
    expect(split.body).toEqual(LEAVE_FIELDS)
    expect(split.expenseItems).toBeNull()
    expect(split.remittances).toBeNull()
  })

  it('송금 요청이 없던 옛 버전 문서는 지출 내역 카드만 선다', () => {
    // 문서는 저장된 form_version_id의 스키마로 렌더된다 — 없는 칸에 빈 카드를 세우지 않는다.
    const split = splitExpenseSections([EXPENSE_FIELDS[0]!, EXPENSE_FIELDS[1]!])
    expect(split.body.map((f) => f.key)).toEqual(['body'])
    expect(split.expenseItems?.key).toBe('expense_items')
    expect(split.remittances).toBeNull()
  })

  it('빈 스키마는 세 자리 모두 비운다', () => {
    const split = splitExpenseSections([])
    expect(split.body).toEqual([])
    expect(split.expenseItems).toBeNull()
    expect(split.remittances).toBeNull()
  })

  it('같은 key가 두 번 있으면 앞의 것만 표로 가르고 뒤의 것은 본문에 남긴다', () => {
    const duplicate: FormField = { key: 'expense_items', label: '지출 내역(구)', type: 'TABLE' }
    const split = splitExpenseSections([...EXPENSE_FIELDS, duplicate])
    expect(split.expenseItems?.label).toBe('지출 내역')
    // 조용히 버리면 적어 둔 값이 화면에서 사라진다.
    expect(split.body.map((f) => f.key)).toEqual(['body', 'expense_items'])
  })
})

describe('splitExpenseSections — 법인카드 지출결의서', () => {
  it('지출 내역만 카드로 갈리고 송금 요청은 서지 않는다', () => {
    const split = splitExpenseSections(CARD_FIELDS)
    expect(split.expenseItems?.key).toBe('expense_items')
    expect(split.remittances).toBeNull()
    // 계정과목처럼 표가 아닌 칸은 본문 카드에 그대로 남는다.
    expect(split.body.map((f) => f.key)).toEqual(['body', 'account'])
  })

  it('표 카드는 지출 내역 하나다', () => {
    expect(expenseTableSections(splitExpenseSections(CARD_FIELDS)).map((f) => f.key)).toEqual([
      'expense_items',
    ])
  })

  it('견줄 송금 요청이 없으니 합계 판정은 서지 않는다', () => {
    expect(expenseTotalsAgree(splitExpenseSections(CARD_FIELDS), {})).toBeNull()
  })
})

describe('expenseTableSections', () => {
  it('지출 내역 → 송금 요청 순서로 돌려준다', () => {
    const tables = expenseTableSections(splitExpenseSections(EXPENSE_FIELDS))
    expect(tables.map((f) => f.key)).toEqual(['expense_items', 'remittances'])
  })

  it('양식에 있는 표만 돌려준다', () => {
    const tables = expenseTableSections(splitExpenseSections([EXPENSE_FIELDS[2]!]))
    expect(tables.map((f) => f.key)).toEqual(['remittances'])
    expect(expenseTableSections(splitExpenseSections(LEAVE_FIELDS))).toEqual([])
  })
})

describe('expenseSectionTitle', () => {
  it('카드 제목은 양식의 라벨이다', () => {
    expect(expenseSectionTitle(EXPENSE_FIELDS[1]!)).toBe('지출 내역')
    expect(expenseSectionTitle(EXPENSE_FIELDS[2]!)).toBe('송금 요청')
  })

  it('ADMIN이 라벨을 고치면 카드 제목도 그 이름을 따른다', () => {
    expect(
      expenseSectionTitle({ key: 'expense_items', label: '집행 내역', type: 'TABLE' }),
    ).toBe('집행 내역')
  })

  it('라벨이 비어 있을 때만 시드가 정한 이름으로 되돌아간다', () => {
    expect(expenseSectionTitle({ key: 'expense_items', label: '   ', type: 'TABLE' })).toBe(
      '지출 내역',
    )
    expect(expenseSectionTitle({ key: 'remittances', label: '', type: 'TABLE' })).toBe('송금 요청')
    // 두 표가 아닌 필드에는 되돌아갈 이름이 없다 — 빈 문자열이 곧 "제목 없음"이다.
    expect(expenseSectionTitle({ key: 'body', label: '', type: 'RICHTEXT' })).toBe('')
  })
})

describe('approvalBodyCardHeading', () => {
  it('카드가 갈린 문서는 양식 이름이 제목, 문서 제목이 부제다', () => {
    // 카드들의 머리글이 한 장의 서식으로 읽혀야 한다 — 지출결의서 · 지출 내역 · 송금 요청.
    expect(
      approvalBodyCardHeading({
        sectioned: true,
        formName: '지출결의서',
        documentTitle: '9월 사무용품 구입',
      }),
    ).toEqual({ title: '지출결의서', subtitle: '9월 사무용품 구입' })
  })

  it('지출 내역만 갈린 법인카드 지출결의서도 같은 머리글을 쓴다', () => {
    // 같은 배치의 문서가 첫 카드 제목만 다르면, 두 양식이 다른 서식처럼 읽힌다.
    expect(
      approvalBodyCardHeading({
        sectioned: true,
        formName: '법인카드 지출결의서',
        documentTitle: '8월 법인카드 사용',
      }),
    ).toEqual({ title: '법인카드 지출결의서', subtitle: '8월 법인카드 사용' })
  })

  it('카드가 하나뿐인 문서는 문서 제목이 곧 카드 제목이고 부제가 없다', () => {
    expect(
      approvalBodyCardHeading({
        sectioned: false,
        formName: '휴가신청서',
        documentTitle: '9월 연차',
      }),
    ).toEqual({ title: '9월 연차', subtitle: undefined })
  })

  it('하이웍스 복원 문서도 문서 제목을 그대로 지킨다', () => {
    // 복원 문서는 usesSectionCards가 거짓이라 카드가 갈리지 않고 sectioned=false로 들어온다.
    expect(
      approvalBodyCardHeading({
        sectioned: false,
        formName: '지출결의서',
        documentTitle: '2024년 5월 지출결의',
      }),
    ).toEqual({ title: '2024년 5월 지출결의', subtitle: undefined })
  })

  it('양식 이름이 비어 있으면 제목 없는 카드를 세우지 않고 문서 제목으로 되돌아간다', () => {
    expect(
      approvalBodyCardHeading({ sectioned: true, formName: '   ', documentTitle: '9월 지출' }),
    ).toEqual({ title: '9월 지출' })
    expect(
      approvalBodyCardHeading({ sectioned: true, formName: null, documentTitle: '9월 지출' }),
    ).toEqual({ title: '9월 지출' })
    expect(
      approvalBodyCardHeading({ sectioned: true, documentTitle: '9월 지출' }),
    ).toEqual({ title: '9월 지출' })
  })

  it('문서 제목이 양식 이름과 같거나 비어 있으면 부제를 세우지 않는다', () => {
    // 한 카드에서 같은 말이 두 줄로 서면 그 둘이 다른 것을 가리키는 것처럼 읽힌다.
    expect(
      approvalBodyCardHeading({
        sectioned: true,
        formName: '지출결의서',
        documentTitle: '지출결의서',
      }),
    ).toEqual({ title: '지출결의서', subtitle: undefined })
    expect(
      approvalBodyCardHeading({ sectioned: true, formName: '지출결의서', documentTitle: '  ' }),
    ).toEqual({ title: '지출결의서', subtitle: undefined })
  })
})

describe('splitExpenseSections — 양식 빌더가 새로 세운 블록', () => {
  /**
   * ADMIN이 양식 빌더에서 같은 블록을 새로 세우면 key가 새로 난다(`field3`). key만 보면 그
   * 표가 본문 카드 안에 끼어 서고 송금 요청만 카드가 되는 어긋난 화면이 된다.
   */
  const REBUILT: FormField[] = [
    { key: 'body', label: '내용', type: 'RICHTEXT' },
    {
      key: 'field3',
      label: '지출 내역',
      type: 'TABLE',
      columns: [
        { key: 'budgetLine', label: '예산 줄', type: 'BUDGET_REF' },
        { key: 'amount', label: '금액', type: 'MONEY' },
      ],
    },
    {
      key: 'field4',
      label: '송금 요청',
      type: 'TABLE',
      columns: [
        { key: 'partner', label: '거래처명', type: 'PARTNER_REF' },
        { key: 'amount', label: '송금액', type: 'MONEY' },
      ],
    },
  ]

  it('key가 달라도 열로 가른다', () => {
    const split = splitExpenseSections(REBUILT)
    expect(split.expenseItems?.key).toBe('field3')
    expect(split.remittances?.key).toBe('field4')
    expect(split.body.map((f) => f.key)).toEqual(['body'])
  })

  it('거래처와 예산 줄을 함께 가진 표는 송금 요청이다 — 돈이 나가는 상대가 성격을 정한다', () => {
    const both: FormField[] = [
      {
        key: 'field9',
        label: '송금',
        type: 'TABLE',
        columns: [
          { key: 'budgetLine', label: '예산 줄', type: 'BUDGET_REF' },
          { key: 'partner', label: '거래처', type: 'PARTNER_REF' },
        ],
      },
    ]
    const split = splitExpenseSections(both)
    expect(split.remittances?.key).toBe('field9')
    expect(split.expenseItems).toBeNull()
  })

  it('예산 줄도 거래처도 없는 표는 본문에 남는다', () => {
    const plain: FormField[] = [
      {
        key: 'field5',
        label: '내역',
        type: 'TABLE',
        columns: [{ key: 'c1', label: '항목', type: 'TEXT' }],
      },
    ]
    const split = splitExpenseSections(plain)
    expect(split.expenseItems).toBeNull()
    expect(split.remittances).toBeNull()
    expect(split.body.map((f) => f.key)).toEqual(['field5'])
  })

  it('표가 아닌 필드는 열을 보지 않는다', () => {
    const split = splitExpenseSections([
      { key: 'field6', label: '금액', type: 'MONEY' },
    ])
    expect(split.body.map((f) => f.key)).toEqual(['field6'])
  })
})

describe('expenseTotalsAgree', () => {
  const split = splitExpenseSections(EXPENSE_FIELDS)
  /** 지출 내역 합계 / 송금 요청 합계를 주는 값 묶음. */
  const values = (items: string[], remittances: string[]) => ({
    expense_items: items.map((amount) => ({ budgetLine: '', item: '', amount })),
    remittances: remittances.map((amount) => ({ partner: '', amount, requestOn: '' })),
  })

  it('두 표의 합계액이 같으면 맞음이다', () => {
    expect(expenseTotalsAgree(split, values(['100,000', '50,000'], ['150,000']))).toBe(true)
  })

  it('합계액이 다르면 틀림이다 — 막지 않고 사실만 답한다', () => {
    expect(expenseTotalsAgree(split, values(['100,000'], ['90,000']))).toBe(false)
  })

  it('한쪽만 적힌 문서는 틀림이다(빈 쪽을 0으로 보지 않는 것이 아니라, 0과 다르다)', () => {
    expect(expenseTotalsAgree(split, values(['100,000'], []))).toBe(false)
    expect(expenseTotalsAgree(split, values([], ['100,000']))).toBe(false)
  })

  it('양쪽 다 한 칸도 적히지 않았으면 견주지 않는다', () => {
    // 빈 문서를 열자마자 '맞음'이 서면 그 색은 맞았다는 뜻을 잃는다.
    expect(expenseTotalsAgree(split, values([], []))).toBeNull()
    expect(expenseTotalsAgree(split, values([''], ['']))).toBeNull()
  })

  it('둘 다 0원이라고 **적은** 문서는 맞음이다', () => {
    expect(expenseTotalsAgree(split, values(['0'], ['0']))).toBe(true)
  })

  it('짝이 되는 표가 없는 양식은 견주지 않는다', () => {
    expect(expenseTotalsAgree(splitExpenseSections(LEAVE_FIELDS), {})).toBeNull()
  })
})
