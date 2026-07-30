import { describe, expect, it } from 'vitest'
import {
  abilityOf,
  deriveAssetState,
  elapsedLabel,
  isoToLocalInput,
  localToIso,
  nowLocalInput,
  overdueMs,
  periodsOverlap,
} from '@/features/office/checkouts/checkoutConfig'
import {
  conflictingCheckouts,
  defaultDueAt,
  emptyCheckoutDraft,
  toCheckoutInput,
  unreturnedCheckouts,
  validateCheckoutDraft,
} from '@/features/office/checkouts/checkoutForm'
import type { Checkout } from '@/features/office/checkouts/checkoutsApi'

/** 검사용 반출 건 — 필요한 축만 바꿔 쓴다. 일시는 로컬 오프셋에 기대지 않도록 Z로 적는다. */
function row(over: Partial<Checkout> = {}): Checkout {
  return {
    id: 'c1',
    assetId: 'a1',
    assetName: '빔프로젝터',
    assetItemType: '영상장비',
    assetSerialNo: 'PJ-001',
    branchId: 'b1',
    status: 'OUT',
    checkoutAt: '2026-07-20T01:00:00.000Z',
    dueAt: '2026-07-25T01:00:00.000Z',
    returnedAt: null,
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

describe('일시 표기 왕복', () => {
  it('로컬 입력 → ISO → 로컬 입력이 같은 시각으로 되돌아온다', () => {
    const local = '2026-07-30T14:30'
    expect(isoToLocalInput(localToIso(local))).toBe(local)
  })

  it('빈 값은 빈 값으로 둔다(검증이 먼저 막는다)', () => {
    expect(localToIso('')).toBe('')
    expect(isoToLocalInput(null)).toBe('')
  })

  it('지금은 분까지만 적는다', () => {
    expect(nowLocalInput(new Date(2026, 6, 30, 9, 5))).toBe('2026-07-30T09:05')
  })
})

describe('elapsedLabel', () => {
  it('큰 단위 하나만 적는다', () => {
    expect(elapsedLabel(25 * 60_000)).toBe('25분 경과')
    expect(elapsedLabel(3 * 3_600_000)).toBe('3시간 경과')
    expect(elapsedLabel(50 * 3_600_000)).toBe('2일 경과')
  })

  it('늦지 않았으면 아무 말도 하지 않는다', () => {
    expect(elapsedLabel(0)).toBe('')
    expect(elapsedLabel(-1000)).toBe('')
  })
})

describe('overdueMs', () => {
  it('반출 중이고 예정 시각이 지났으면 경과를 센다', () => {
    expect(overdueMs(row(), '2026-07-25T04:00:00.000Z')).toBe(3 * 3_600_000)
  })

  it('예정 시각 이전이면 연체가 아니다', () => {
    expect(overdueMs(row(), '2026-07-24T23:00:00.000Z')).toBe(0)
  })

  it('반출 중이 아니면 예정이 지나도 연체가 아니다', () => {
    expect(overdueMs(row({ status: 'RESERVED' }), '2026-08-01T00:00:00.000Z')).toBe(0)
    expect(overdueMs(row({ status: 'RETURNED' }), '2026-08-01T00:00:00.000Z')).toBe(0)
  })
})

describe('deriveAssetState', () => {
  const now = '2026-07-22T00:00:00.000Z'

  it('걸린 것이 없으면 반출 가능이다', () => {
    expect(deriveAssetState([], now)).toEqual({ state: 'AVAILABLE', active: null })
  })

  it('나가 있는 건이 예약보다 앞선다 — 표 한 줄이 답할 것은 "지금 없다"이다', () => {
    const out = row({ id: 'o' })
    const reserved = row({
      id: 'r',
      status: 'RESERVED',
      checkoutAt: '2026-08-01T00:00:00.000Z',
      dueAt: '2026-08-02T00:00:00.000Z',
    })
    const result = deriveAssetState([reserved, out], now)
    expect(result.state).toBe('OUT')
    expect(result.active?.id).toBe('o')
  })

  it('예정 시각이 지난 반출 중은 연체로 적는다', () => {
    expect(deriveAssetState([row()], '2026-07-28T00:00:00.000Z').state).toBe('OVERDUE')
  })

  it('승인 대기는 예약보다 앞선다(먼저 처리해야 할 일이다)', () => {
    const pending = row({ id: 'p', status: 'PENDING' })
    const reserved = row({ id: 'r', status: 'RESERVED' })
    expect(deriveAssetState([reserved, pending], now).active?.id).toBe('p')
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
  it('반열림이라 앞 건의 끝과 뒤 건의 시작이 같으면 겹치지 않는다', () => {
    expect(
      periodsOverlap(
        { from: '2026-07-20T01:00:00Z', to: '2026-07-20T05:00:00Z' },
        { from: '2026-07-20T05:00:00Z', to: '2026-07-20T09:00:00Z' },
      ),
    ).toBe(false)
  })

  it('1분이라도 물리면 겹친다', () => {
    expect(
      periodsOverlap(
        { from: '2026-07-20T01:00:00Z', to: '2026-07-20T05:00:00Z' },
        { from: '2026-07-20T04:59:00Z', to: '2026-07-20T09:00:00Z' },
      ),
    ).toBe(true)
  })
})

describe('validateCheckoutDraft', () => {
  const base = {
    ...emptyCheckoutDraft('a1', '2026-07-30T09:00'),
    purpose: '촬영',
  }

  it('통과하는 값에는 오류가 없다', () => {
    expect(validateCheckoutDraft(base)).toBeNull()
  })

  it('빈 초안의 반납 예정은 하루 뒤다', () => {
    expect(emptyCheckoutDraft('a1', '2026-07-30T09:00').dueAt).toBe('2026-07-31T09:00')
    expect(defaultDueAt('')).toBe('')
  })

  it('물품·반납 예정·목적은 필수다', () => {
    expect(validateCheckoutDraft({ ...base, assetId: '' })?.field).toBe('assetId')
    expect(validateCheckoutDraft({ ...base, dueAt: '' })?.field).toBe('dueAt')
    expect(validateCheckoutDraft({ ...base, purpose: '  ' })?.field).toBe('purpose')
  })

  it('반납 예정이 반출 시각과 같거나 앞서면 막는다(길이가 0인 반출은 기록이 아니다)', () => {
    expect(validateCheckoutDraft({ ...base, dueAt: '2026-07-30T09:00' })?.field).toBe('dueAt')
    expect(validateCheckoutDraft({ ...base, dueAt: '2026-07-30T08:00' })?.field).toBe('dueAt')
  })

  it('같은 날 오전에 나갔다 오후에 돌아오는 반출은 허용한다', () => {
    expect(validateCheckoutDraft({ ...base, dueAt: '2026-07-30T18:00' })).toBeNull()
  })
})

describe('toCheckoutInput', () => {
  it('빈 문자열은 null로 접고 앞뒤 공백을 다듬으며 일시는 ISO로 바꾼다', () => {
    const v = toCheckoutInput({
      ...emptyCheckoutDraft('a1', '2026-07-30T09:00'),
      purpose: '  촬영  ',
      destination: '   ',
      note: '',
    })
    expect(v.purpose).toBe('촬영')
    expect(v.destination).toBeNull()
    expect(v.note).toBeNull()
    expect(isoToLocalInput(v.checkoutAt)).toBe('2026-07-30T09:00')
  })
})

describe('conflictingCheckouts / unreturnedCheckouts', () => {
  const occupancy = [
    row({
      id: 'x',
      status: 'RESERVED',
      checkoutAt: '2026-08-01T01:00:00.000Z',
      dueAt: '2026-08-03T01:00:00.000Z',
    }),
    row({ id: 'y', status: 'OUT' }),
  ]

  it('기간이 부딪히는 건만 골라낸다', () => {
    const draft = {
      ...emptyCheckoutDraft('a1', isoToLocalInput('2026-08-02T01:00:00.000Z')),
      dueAt: isoToLocalInput('2026-08-05T01:00:00.000Z'),
      purpose: '촬영',
    }
    expect(conflictingCheckouts(draft, occupancy).map((c) => c.id)).toEqual(['x'])
  })

  it('일시가 아직 비어 있으면 판정하지 않는다(열자마자 붉은 글씨를 띄우지 않는다)', () => {
    const draft = { ...emptyCheckoutDraft('a1', '2026-08-02T10:00'), dueAt: '' }
    expect(conflictingCheckouts(draft, occupancy)).toEqual([])
  })

  it('아직 안 돌아온 건은 기간이 겹치지 않아도 따로 알린다', () => {
    expect(unreturnedCheckouts(occupancy).map((c) => c.id)).toEqual(['y'])
  })
})
