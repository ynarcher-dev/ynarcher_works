import { describe, expect, it } from 'vitest'
import {
  abilityOf,
  overdueDays,
  periodsOverlap,
  todayKey,
} from '@/features/office/checkouts/checkoutConfig'
import {
  conflictingCheckouts,
  emptyCheckoutDraft,
  toCheckoutInput,
  unreturnedCheckouts,
  validateCheckoutDraft,
} from '@/features/office/checkouts/checkoutForm'
import type { Checkout } from '@/features/office/checkouts/checkoutsApi'

/** 검사용 반출 건 — 필요한 축만 바꿔 쓴다. */
function row(over: Partial<Checkout> = {}): Checkout {
  return {
    id: 'c1',
    assetId: 'a1',
    assetName: '빔프로젝터',
    assetItemType: '영상장비',
    assetSerialNo: 'PJ-001',
    branchId: 'b1',
    status: 'OUT',
    checkoutOn: '2026-07-20',
    dueOn: '2026-07-25',
    returnedOn: null,
    purpose: '데모데이',
    destination: null,
    note: null,
    createdBy: 'u1',
    createdByName: '홍길동',
    decidedBy: null,
    decidedAt: null,
    decisionNote: null,
    returnedByName: null,
    returnNote: null,
    ...over,
  }
}

describe('todayKey', () => {
  it('로컬 날짜를 YYYY-MM-DD로 적는다(UTC 변환으로 하루가 밀리지 않는다)', () => {
    expect(todayKey(new Date(2026, 6, 30, 23, 30))).toBe('2026-07-30')
    expect(todayKey(new Date(2026, 0, 1, 0, 5))).toBe('2026-01-01')
  })
})

describe('overdueDays', () => {
  it('반출 중이고 예정일이 지났으면 경과 일수를 센다', () => {
    expect(overdueDays(row({ dueOn: '2026-07-25' }), '2026-07-30')).toBe(5)
  })

  it('예정일 당일은 연체가 아니다(그날까지는 손에 있어도 된다)', () => {
    expect(overdueDays(row({ dueOn: '2026-07-30' }), '2026-07-30')).toBe(0)
  })

  it('반출 중이 아니면 예정일이 지나도 연체가 아니다', () => {
    expect(overdueDays(row({ status: 'RETURNED', dueOn: '2026-07-01' }), '2026-07-30')).toBe(0)
    expect(overdueDays(row({ status: 'RESERVED', dueOn: '2026-07-01' }), '2026-07-30')).toBe(0)
  })
})

describe('abilityOf', () => {
  const owner = { id: 'u1', isManager: false }
  const other = { id: 'u2', isManager: false }
  const manager = { id: 'u2', isManager: true }

  it('승인·반려는 자산 담당자만 한다 — 본인이라도 스스로 승인하지 못한다', () => {
    expect(abilityOf(row({ status: 'PENDING' }), owner).canApprove).toBe(false)
    expect(abilityOf(row({ status: 'PENDING' }), manager).canApprove).toBe(true)
  })

  it('반출 시작·반납은 본인과 관리자가 한다(대리 반납)', () => {
    expect(abilityOf(row({ status: 'RESERVED' }), owner).canStart).toBe(true)
    expect(abilityOf(row({ status: 'OUT' }), manager).canReturn).toBe(true)
    expect(abilityOf(row({ status: 'OUT' }), other).canReturn).toBe(false)
  })

  it('종결된 건에는 아무 처리도 남지 않는다', () => {
    for (const status of ['RETURNED', 'REJECTED', 'CANCELLED'] as const) {
      const can = abilityOf(row({ status }), manager)
      expect([can.canApprove, can.canStart, can.canReturn, can.canCancel]).toEqual([
        false,
        false,
        false,
        false,
      ])
    }
  })
})

describe('periodsOverlap', () => {
  it('양끝을 포함해 판정한다 — 반납 예정일과 다음 반출일이 같으면 겹친다', () => {
    expect(
      periodsOverlap({ from: '2026-07-20', to: '2026-07-25' }, { from: '2026-07-25', to: '2026-07-28' }),
    ).toBe(true)
  })

  it('하루라도 떨어져 있으면 겹치지 않는다', () => {
    expect(
      periodsOverlap({ from: '2026-07-20', to: '2026-07-25' }, { from: '2026-07-26', to: '2026-07-28' }),
    ).toBe(false)
  })
})

describe('validateCheckoutDraft', () => {
  const base = { ...emptyCheckoutDraft('2026-07-30'), assetId: 'a1', dueOn: '2026-08-02', purpose: '촬영' }

  it('통과하는 값에는 오류가 없다', () => {
    expect(validateCheckoutDraft(base)).toBeNull()
  })

  it('물품·반납 예정일·목적은 필수다', () => {
    expect(validateCheckoutDraft({ ...base, assetId: '' })?.field).toBe('assetId')
    expect(validateCheckoutDraft({ ...base, dueOn: '' })?.field).toBe('dueOn')
    expect(validateCheckoutDraft({ ...base, purpose: '  ' })?.field).toBe('purpose')
  })

  it('반납 예정일이 반출일보다 앞서면 막는다', () => {
    expect(validateCheckoutDraft({ ...base, dueOn: '2026-07-29' })?.field).toBe('dueOn')
  })

  it('반출일 당일 반납(하루짜리)은 허용한다', () => {
    expect(validateCheckoutDraft({ ...base, dueOn: '2026-07-30' })).toBeNull()
  })
})

describe('toCheckoutInput', () => {
  it('빈 문자열은 null로 접고 앞뒤 공백을 다듬는다', () => {
    const v = toCheckoutInput({
      ...emptyCheckoutDraft('2026-07-30'),
      assetId: 'a1',
      dueOn: '2026-08-02',
      purpose: '  촬영  ',
      destination: '   ',
      note: '',
    })
    expect(v.purpose).toBe('촬영')
    expect(v.destination).toBeNull()
    expect(v.note).toBeNull()
  })
})

describe('conflictingCheckouts / unreturnedCheckouts', () => {
  const occupancy = [
    row({ id: 'x', status: 'RESERVED', checkoutOn: '2026-08-01', dueOn: '2026-08-03' }),
    row({ id: 'y', status: 'OUT', checkoutOn: '2026-07-20', dueOn: '2026-07-25' }),
  ]

  it('기간이 부딪히는 건만 골라낸다', () => {
    const draft = { ...emptyCheckoutDraft('2026-08-02'), assetId: 'a1', dueOn: '2026-08-05' }
    expect(conflictingCheckouts(draft, occupancy).map((c) => c.id)).toEqual(['x'])
  })

  it('날짜가 아직 비어 있으면 판정하지 않는다(열자마자 붉은 글씨를 띄우지 않는다)', () => {
    const draft = { ...emptyCheckoutDraft('2026-08-02'), assetId: 'a1', dueOn: '' }
    expect(conflictingCheckouts(draft, occupancy)).toEqual([])
  })

  it('아직 안 돌아온 건은 기간이 겹치지 않아도 따로 알린다', () => {
    expect(unreturnedCheckouts(occupancy).map((c) => c.id)).toEqual(['y'])
  })
})
