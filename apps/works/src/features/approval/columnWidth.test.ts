import { describe, expect, it } from 'vitest'
import { ACTION_COLUMN_REM, columnWidthRem } from '@/features/approval/columnWidth'
import type { FormColumn } from '@/features/approval/fields'

const col = (c: Partial<FormColumn> & Pick<FormColumn, 'type'>): FormColumn => ({
  key: 'c',
  label: '칸',
  ...c,
})

describe('표 입력 열 폭', () => {
  it('자릿수 상한이 있는 칸은 폭을 갖는다', () => {
    expect(columnWidthRem(col({ type: 'MONEY' }))).toBe(8)
    expect(columnWidthRem(col({ type: 'NUMBER' }))).toBe(8)
    expect(columnWidthRem(col({ type: 'DATE' }))).toBe(9)
    expect(columnWidthRem(col({ type: 'SELECT' }))).toBe(7.5)
    expect(columnWidthRem(col({ type: 'VAT_KIND' }))).toBe(7.5)
  })

  it('상한이 없거나 고르는 칸은 남는 폭을 갖는다', () => {
    expect(columnWidthRem(col({ type: 'TEXT' }))).toBeNull()
    expect(columnWidthRem(col({ type: 'BUDGET_REF' }))).toBeNull()
    expect(columnWidthRem(col({ type: 'PARTNER_REF' }))).toBeNull()
  })

  it('값의 주인이 다른 칸은 종류보다 출처가 먼저다 — 상자가 아니라 글자로 선다', () => {
    expect(columnWidthRem(col({ type: 'TEXT', source: { from: 'partner', field: 'BANK' } }))).toBe(7)
  })

  it('행 삭제 열은 아이콘 하나만큼이다', () => {
    expect(ACTION_COLUMN_REM).toBe(3)
  })
})
