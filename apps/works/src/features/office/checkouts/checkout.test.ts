import { describe, expect, it } from 'vitest'
import {
  abilityOf,
  deriveAssetState,
  elapsedLabel,
  isStartDelayed,
  isoToLocalInput,
  localToIso,
  nextAvailableAt,
  nowLocalInput,
  overdueMs,
  overdueQuantity,
  peakUsage,
  pendingCheckouts,
  periodsOverlap,
  remainingForPeriod,
  remainingNow,
} from '@/features/office/checkouts/checkoutConfig'
import {
  conflictingCheckouts,
  defaultDueAt,
  emptyCheckoutDraft,
  joinLocal,
  remainingForDraft,
  splitLocal,
  timeOptions,
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
    quantity: 1,
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

describe('재고 계산', () => {
  const morning = row({
    id: 'am',
    quantity: 1,
    checkoutAt: '2026-08-01T00:00:00.000Z',
    dueAt: '2026-08-01T04:00:00.000Z',
  })
  const afternoon = row({
    id: 'pm',
    quantity: 1,
    checkoutAt: '2026-08-01T05:00:00.000Z',
    dueAt: '2026-08-01T09:00:00.000Z',
  })

  it('동시에 나가 있는 최대치를 센다 — 오전 한 개와 오후 한 개는 두 개가 아니다', () => {
    expect(
      peakUsage([morning, afternoon], '2026-08-01T00:00:00.000Z', '2026-08-01T09:00:00.000Z'),
    ).toBe(1)
  })

  it('겹치는 것끼리는 더한다', () => {
    const same = row({ id: 'x', quantity: 2, ...{} })
    expect(
      peakUsage(
        [morning, { ...same, checkoutAt: morning.checkoutAt, dueAt: morning.dueAt }],
        morning.checkoutAt,
        morning.dueAt,
      ),
    ).toBe(3)
  })

  it('점유하지 않는 상태(반납·반려·취소)는 재고를 잡지 않는다', () => {
    const done = row({ id: 'd', status: 'RETURNED', quantity: 5 })
    expect(peakUsage([done], done.checkoutAt, done.dueAt)).toBe(0)
  })

  it('반열림이라 앞 건이 끝나는 시각에 시작하면 겹치지 않는다', () => {
    const next = row({ id: 'n', quantity: 1, checkoutAt: morning.dueAt, dueAt: afternoon.dueAt })
    expect(peakUsage([morning], next.checkoutAt, next.dueAt)).toBe(0)
  })

  it('잔여는 0 아래로 내려가지 않는다(보유보다 많이 나간 과거 데이터가 있어도)', () => {
    const big = row({ id: 'b', quantity: 5 })
    expect(remainingForPeriod(3, [big], big.checkoutAt, big.dueAt)).toBe(0)
  })

  it('지금의 잔여는 지금을 덮고 있는 건만 뺀다', () => {
    const at = '2026-08-01T02:00:00.000Z'
    expect(remainingNow(3, [morning, afternoon], at)).toBe(2)
  })
})

describe('deriveAssetState', () => {
  const now = '2026-07-22T00:00:00.000Z'

  it('걸린 것이 없으면 반출 가능이다', () => {
    expect(deriveAssetState([], now)).toEqual({ state: 'AVAILABLE', active: null })
  })

  it('한 개짜리가 나가 있으면 반출 중이다', () => {
    const result = deriveAssetState([row({ id: 'o' })], now, 1)
    expect(result.state).toBe('OUT')
    expect(result.active?.id).toBe('o')
  })

  it('다섯 개 중 두 개가 나가 있으면 여전히 반출 가능이다 — 남은 것이 있으므로', () => {
    const result = deriveAssetState([row({ id: 'o', quantity: 2 })], now, 5)
    expect(result.state).toBe('AVAILABLE')
    // 그래도 나가 있는 건은 함께 실어 표의 반출자·반납 예정 칸이 비지 않게 한다.
    expect(result.active?.id).toBe('o')
  })

  it('예정 시각이 지난 반출 중은 잔여가 있어도 연체로 앞세운다', () => {
    expect(deriveAssetState([row()], '2026-07-28T00:00:00.000Z', 5).state).toBe('OVERDUE')
  })

  it('예약 시각이 지났는데 못 받은 건은 시작 지연이다', () => {
    const stuck = row({
      id: 's',
      status: 'RESERVED',
      checkoutAt: '2026-07-21T00:00:00.000Z',
      dueAt: '2026-07-23T00:00:00.000Z',
    })
    const result = deriveAssetState([stuck], now, 1)
    expect(result.state).toBe('DELAYED')
    expect(result.active?.id).toBe('s')
  })

  it('연체가 지연보다 앞선다 — 손을 대야 할 사실은 앞사람의 미반납이다', () => {
    const stuck = row({
      id: 's',
      status: 'RESERVED',
      checkoutAt: '2026-07-21T00:00:00.000Z',
      dueAt: '2026-07-30T00:00:00.000Z',
    })
    // row()는 07-25 01:00까지인 반출 중 — 07-28에는 연체다.
    expect(deriveAssetState([stuck, row()], '2026-07-28T00:00:00.000Z', 1).state).toBe('OVERDUE')
  })

  it('기간이 통째로 지난 예약은 지연이 아니다(자동 시작도 건드리지 않는다)', () => {
    const dead = row({
      id: 'd',
      status: 'RESERVED',
      checkoutAt: '2026-07-19T00:00:00.000Z',
      dueAt: '2026-07-21T00:00:00.000Z',
    })
    expect(deriveAssetState([dead], now, 1).state).toBe('AVAILABLE')
  })

  it('잔여가 0일 때에만 무엇 때문에 못 빌리는지 적는다', () => {
    const pending = row({ id: 'p', status: 'PENDING' })
    const reserved = row({ id: 'r', status: 'RESERVED' })
    // 두 건(각 1개)이 지금을 덮고 있으므로 보유 3개면 하나가 남는다.
    expect(deriveAssetState([reserved, pending], now, 3).state).toBe('AVAILABLE')
    // 보유가 2개면 잔여 0 — 이때 무엇 때문에 못 빌리는지 적는다. 지금을 덮고 있는 예약은
    // 시각이 이미 지났다는 뜻이므로 '시작 지연'이고, 승인 대기보다 앞선다: 승인 대기는 아직
    // 아무도 약속받지 않은 요청이지만 지연은 이미 한 약속이 지켜지지 않고 있는 자리다.
    expect(deriveAssetState([reserved, pending], now, 2).state).toBe('DELAYED')
    expect(deriveAssetState([reserved, pending], now, 2).active?.id).toBe('r')
  })
})

describe('pendingCheckouts', () => {
  const now = '2026-07-22T00:00:00.000Z'

  it('승인 대기만 골라 오래 기다린 순으로 준다', () => {
    const late = row({ id: 'late', status: 'PENDING', checkoutAt: '2026-07-24T01:00:00.000Z' })
    const early = row({ id: 'early', status: 'PENDING', checkoutAt: '2026-07-21T01:00:00.000Z' })
    expect(pendingCheckouts([late, row({ status: 'RESERVED' }), early]).map((c) => c.id)).toEqual([
      'early',
      'late',
    ])
  })

  it('잔여가 있어 상태가 반출 가능이어도 기다리는 요청은 남아 있다', () => {
    // 표의 상태 열만 보면 승인할 일이 없어 보이는 자리 — 승인 열이 걸린 건을 직접 세는 이유다.
    const checkouts = [row({ id: 'p', status: 'PENDING', quantity: 1 })]
    expect(deriveAssetState(checkouts, now, 5).state).toBe('AVAILABLE')
    expect(pendingCheckouts(checkouts)).toHaveLength(1)
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

  it('비는 시각보다 앞서면 막고, 그 시각부터는 통과한다', () => {
    expect(validateCheckoutDraft(base, '2026-07-30T12:00')?.field).toBe('checkoutAt')
    expect(validateCheckoutDraft(base, '2026-07-30T09:00')).toBeNull()
    // 기준을 주지 않으면 판정하지 않는다(다른 화면에서 그대로 쓸 수 있게).
    expect(validateCheckoutDraft(base)).toBeNull()
  })
})

describe('nextAvailableAt', () => {
  const now = '2026-07-22T00:00:00.000Z'

  it('잔여가 있으면 지금부터다', () => {
    expect(nextAvailableAt(3, [row({ quantity: 1 })], now)).toBe(now)
  })

  it('한 개짜리가 나가 있으면 돌아오는 시각부터다', () => {
    // row()는 07-20 01:00 ~ 07-25 01:00 반출 중.
    expect(nextAvailableAt(1, [row()], now)).toBe('2026-07-25T01:00:00.000Z')
  })

  it('돌아오는 자리에 다음 예약이 붙어 있으면 그 뒤로 넘어간다', () => {
    const next = row({
      id: 'n',
      status: 'RESERVED',
      checkoutAt: '2026-07-25T01:00:00.000Z',
      dueAt: '2026-07-27T01:00:00.000Z',
    })
    expect(nextAvailableAt(1, [row(), next], now)).toBe('2026-07-27T01:00:00.000Z')
  })

  it('점유가 하나도 없으면 지금부터다', () => {
    expect(nextAvailableAt(1, [], now)).toBe(now)
  })

  it('연체가 원인이면 언제 비는지 모른다고 답한다(시각을 지어내지 않는다)', () => {
    // 07-25 01:00까지 빌린 것이 07-28에도 돌아오지 않았다.
    expect(nextAvailableAt(1, [row()], '2026-07-28T00:00:00.000Z')).toBeNull()
  })

  it('연체가 있어도 여유분이 있으면 지금부터다', () => {
    expect(nextAvailableAt(2, [row()], '2026-07-28T00:00:00.000Z')).toBe(
      '2026-07-28T00:00:00.000Z',
    )
  })
})

describe('연체 점유 — 반납되지 않은 물건은 지금도 나가 있다', () => {
  // row()는 07-20 01:00 ~ 07-25 01:00 반출 중(1개). 아래에서는 이미 예정이 지난 시점을 본다.
  const late = '2026-07-28T00:00:00.000Z'

  it('예정 시각이 지나도 잔여로 돌아오지 않는다', () => {
    expect(overdueQuantity([row()], late)).toBe(1)
    expect(remainingNow(1, [row()], late)).toBe(0)
  })

  it('반납된 건은 연체가 아니다', () => {
    expect(overdueQuantity([row({ status: 'RETURNED' })], late)).toBe(0)
    expect(remainingNow(1, [row({ status: 'RETURNED' })], late)).toBe(1)
  })

  it('지금을 덮는 구간에서는 막고, 미래 구간은 열어 둔다', () => {
    // 지금(07-28)을 포함하는 요청 — 아직 돌아오지 않았으므로 자리가 없다.
    expect(
      remainingForPeriod(1, [row()], '2026-07-28T00:00:00.000Z', '2026-07-29T00:00:00.000Z', late),
    ).toBe(0)
    // 내일 이후 — 돌아온다고 보고 통과시킨다(한 사람의 지각이 모두의 줄서기를 막지 않는다).
    expect(
      remainingForPeriod(1, [row()], '2026-07-30T00:00:00.000Z', '2026-07-31T00:00:00.000Z', late),
    ).toBe(1)
  })

  it('기준 시각을 주지 않으면 종전처럼 선언한 기간만 본다', () => {
    expect(
      remainingForPeriod(1, [row()], '2026-07-28T00:00:00.000Z', '2026-07-29T00:00:00.000Z'),
    ).toBe(1)
  })
})

describe('isStartDelayed', () => {
  it('예약 시각이 지났는데 아직 못 받은 건이다', () => {
    const reserved = row({ status: 'RESERVED', checkoutAt: '2026-07-25T01:00:00.000Z' })
    expect(isStartDelayed(reserved, '2026-07-26T00:00:00.000Z')).toBe(true)
    expect(isStartDelayed(reserved, '2026-07-24T00:00:00.000Z')).toBe(false)
  })

  it('이미 받아 간 건과 종결된 건은 지연이 아니다', () => {
    const at = '2026-07-26T00:00:00.000Z'
    expect(isStartDelayed(row({ status: 'OUT' }), at)).toBe(false)
    expect(isStartDelayed(row({ status: 'CANCELLED' }), at)).toBe(false)
  })

  it('막 시각이 된 예약은 아직 지연이 아니다(서버 보정이 따라잡을 여유)', () => {
    const justNow = row({ status: 'RESERVED', checkoutAt: '2026-07-25T01:00:00.000Z' })
    expect(isStartDelayed(justNow, '2026-07-25T01:02:00.000Z')).toBe(false)
    expect(isStartDelayed(justNow, '2026-07-25T01:06:00.000Z')).toBe(true)
  })
})

describe('시각 후보(timeOptions)', () => {
  const floor = '2026-07-30T10:31'

  it('바닥과 같은 날에는 바닥 이후만 남기고, 바닥 시각 자체를 첫 후보로 둔다', () => {
    const opts = timeOptions('2026-07-30', floor)
    expect(opts.slice(0, 4)).toEqual(['10:31', '11:00', '11:30', '12:00'])
    expect(opts.at(-1)).toBe('23:30')
  })

  it('바닥보다 이른 날짜에는 고를 수 있는 시각이 없다', () => {
    expect(timeOptions('2026-07-29', floor)).toEqual([])
  })

  it('다음 날부터는 하루가 통째로 열린다(30분 간격 48칸)', () => {
    const opts = timeOptions('2026-07-31', floor)
    expect(opts).toHaveLength(48)
    expect(opts[0]).toBe('00:00')
  })

  it('exclusive는 바닥과 같은 시각을 뺀다(길이 0인 반출을 만들지 않는다)', () => {
    expect(timeOptions('2026-07-30', floor, true)[0]).toBe('11:00')
  })

  it('날짜와 시각을 오갈 때 값이 그대로 돌아온다', () => {
    expect(splitLocal(floor)).toEqual({ date: '2026-07-30', time: '10:31' })
    expect(joinLocal('2026-07-30', '10:31')).toBe(floor)
    expect(joinLocal('', '10:31')).toBe('')
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

describe('remainingForDraft', () => {
  const occupancy = [row({ id: 'o', quantity: 2 })] // 2026-07-20 01:00 ~ 07-25 01:00

  it('그 기간에 겹치는 만큼만 뺀다', () => {
    const draft = {
      ...emptyCheckoutDraft('a1', isoToLocalInput('2026-07-21T01:00:00.000Z')),
      dueAt: isoToLocalInput('2026-07-22T01:00:00.000Z'),
    }
    expect(remainingForDraft(5, occupancy, draft)).toBe(3)
  })

  it('겹치지 않는 기간에는 전부 남아 있다', () => {
    const draft = {
      ...emptyCheckoutDraft('a1', isoToLocalInput('2026-07-26T01:00:00.000Z')),
      dueAt: isoToLocalInput('2026-07-27T01:00:00.000Z'),
    }
    expect(remainingForDraft(5, occupancy, draft)).toBe(5)
  })

  it('기간이 아직 성립하지 않으면 판정하지 않는다(열자마자 잔여 0을 적지 않는다)', () => {
    const draft = { ...emptyCheckoutDraft('a1', '2026-07-30T10:00'), dueAt: '' }
    expect(remainingForDraft(5, occupancy, draft)).toBeNull()
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
