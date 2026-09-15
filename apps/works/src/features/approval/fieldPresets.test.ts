import { describe, expect, it } from 'vitest'
import {
  FIELD_CHOICE_LABEL,
  OTHER_FIELD_CHOICES,
  PRIMARY_FIELD_CHOICES,
  fieldChoiceOf,
  withFieldChoice,
} from '@/features/approval/fieldPresets'
import { FIELD_TYPES, type FormField } from '@/features/approval/fields'

const plain: FormField = { key: 'field1', label: '', type: 'TEXT' }

describe('양식 빌더 선택지 — 목록', () => {
  it('세 블록이 먼저 서고, 나머지 종류는 하나도 사라지지 않는다', () => {
    expect(PRIMARY_FIELD_CHOICES).toEqual(['BUDGET_TREE', 'EXPENSE_ITEMS', 'REMITTANCE'])
    const shown = [...PRIMARY_FIELD_CHOICES, ...OTHER_FIELD_CHOICES]
    for (const type of FIELD_TYPES) expect(shown).toContain(type)
  })

  it('같은 값이 두 묶음에 겹쳐 서지 않는다', () => {
    for (const choice of PRIMARY_FIELD_CHOICES) {
      expect(OTHER_FIELD_CHOICES).not.toContain(choice)
    }
  })

  it('모든 선택지에 이름표가 있다', () => {
    for (const choice of [...PRIMARY_FIELD_CHOICES, ...OTHER_FIELD_CHOICES]) {
      expect(FIELD_CHOICE_LABEL[choice]?.length ?? 0).toBeGreaterThan(0)
    }
  })
})

describe('선택지 판정 — 열이 답한다', () => {
  it('예산 줄을 가진 표는 지출 내역이다', () => {
    const field: FormField = {
      key: 'expense_items',
      label: '지출 내역',
      type: 'TABLE',
      columns: [
        { key: 'budgetLine', label: '예산 줄', type: 'BUDGET_REF' },
        { key: 'amount', label: '금액', type: 'MONEY' },
      ],
    }
    expect(fieldChoiceOf(field)).toBe('EXPENSE_ITEMS')
  })

  it('거래처를 가진 표는 송금 요청이다 — 예산 줄이 함께 있어도 그렇다', () => {
    const field: FormField = {
      key: 'remittances',
      label: '송금 요청',
      type: 'TABLE',
      columns: [
        { key: 'budgetLine', label: '예산 줄', type: 'BUDGET_REF' },
        { key: 'partner', label: '거래처명', type: 'PARTNER_REF' },
      ],
    }
    expect(fieldChoiceOf(field)).toBe('REMITTANCE')
  })

  it('그 둘이 없는 표는 그냥 표이고, 표가 아닌 필드는 자기 종류 그대로다', () => {
    expect(
      fieldChoiceOf({
        key: 'f',
        label: '',
        type: 'TABLE',
        columns: [{ key: 'c', label: '항목', type: 'TEXT' }],
      }),
    ).toBe('TABLE')
    expect(fieldChoiceOf({ key: 'f', label: '', type: 'BUDGET_TREE' })).toBe('BUDGET_TREE')
    expect(fieldChoiceOf(plain)).toBe('TEXT')
  })
})

describe('선택지 적용 — 고른 대로 서고, 짜 둔 열은 남는다', () => {
  it('빈 필드에서 지출 내역을 고르면 예산 줄이 맨 앞에 선다', () => {
    const next = withFieldChoice(plain, 'EXPENSE_ITEMS')
    expect(next.type).toBe('TABLE')
    expect(next.columns?.[0]?.type).toBe('BUDGET_REF')
    expect(fieldChoiceOf(next)).toBe('EXPENSE_ITEMS')
  })

  it('빈 필드에서 송금 요청을 고르면 거래처와 계좌 사본이 함께 선다', () => {
    const next = withFieldChoice(plain, 'REMITTANCE')
    expect(next.columns?.some((c) => c.type === 'PARTNER_REF')).toBe(true)
    expect(next.columns?.find((c) => c.key === 'accountNo')?.source).toEqual({
      from: 'partner',
      field: 'ACCOUNT_NO',
    })
    expect(fieldChoiceOf(next)).toBe('REMITTANCE')
  })

  it('이름이 비어 있을 때만 블록 이름을 채운다', () => {
    expect(withFieldChoice(plain, 'EXPENSE_ITEMS').label).toBe('지출 내역')
    expect(withFieldChoice({ ...plain, label: '집행 내역' }, 'EXPENSE_ITEMS').label).toBe('집행 내역')
  })

  it('이미 짜 둔 표에 블록을 고르면 표시 열만 앞에 붙고 기존 열은 그대로 남는다', () => {
    const table: FormField = {
      key: 'field1',
      label: '내역',
      type: 'TABLE',
      columns: [
        { key: 'col1', label: '항목', type: 'TEXT' },
        { key: 'col2', label: '금액', type: 'MONEY', primaryAmount: true },
      ],
    }
    const next = withFieldChoice(table, 'EXPENSE_ITEMS')
    expect(next.columns?.map((c) => c.key)).toContain('col1')
    expect(next.columns?.map((c) => c.key)).toContain('col2')
    expect(next.columns?.[0]?.type).toBe('BUDGET_REF')
  })

  it('이미 그 블록이면 열을 다시 세우지 않는다', () => {
    const field: FormField = {
      key: 'expense_items',
      label: '지출 내역',
      type: 'TABLE',
      columns: [
        { key: 'budgetLine', label: '예산 항목', type: 'BUDGET_REF' },
        { key: 'net', label: '공급가액', type: 'MONEY', role: 'NET' },
      ],
    }
    expect(withFieldChoice(field, 'EXPENSE_ITEMS').columns).toEqual(field.columns)
  })

  it('블록에서 다른 종류로 되돌려도 열은 지워지지 않는다', () => {
    const block = withFieldChoice(plain, 'EXPENSE_ITEMS')
    const back = withFieldChoice(block, 'TABLE')
    expect(back.type).toBe('TABLE')
    expect(back.columns).toEqual(block.columns)
    const again = withFieldChoice(back, 'EXPENSE_ITEMS')
    expect(again.columns).toEqual(block.columns)
  })
})
