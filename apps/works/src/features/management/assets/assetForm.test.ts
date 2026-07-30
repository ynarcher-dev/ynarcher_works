import { describe, expect, it } from 'vitest'
import {
  emptyDraft,
  endsOnLabel,
  formatAmount,
  normalizeAmountInput,
  toAssetInput,
  validateDraft,
  withStatus,
  type AssetDraft,
} from '@/features/management/assets/assetForm'

/**
 * 자산 폼 규칙은 DB check 제약을 비춘 것이다 — 여기 사례가 곧 "저장이 거부되는 조합"의 목록이며,
 * 기획서 3_7_2 §11(검증 규칙)·§13(테스트 기준)과 같은 것을 본다.
 */
const BRANCH = 'b1'

function draft(over: Partial<AssetDraft> = {}): AssetDraft {
  return { ...emptyDraft(BRANCH), name: 'MacBook Pro 16', ...over }
}

describe('validateDraft', () => {
  it('필수값이 채워진 기본 초안은 통과한다', () => {
    expect(validateDraft(draft())).toBeNull()
  })

  it('자산명이 비면 막는다', () => {
    expect(validateDraft(draft({ name: '   ' }))?.field).toBe('name')
  })

  it('지사를 고르지 않으면 막는다 — 귀속 없는 자산은 어느 탭에도 뜨지 않는다', () => {
    expect(validateDraft(draft({ branchId: '' }))?.field).toBe('branchId')
  })

  it('할당됨 상태인데 대상이 없으면 막는다', () => {
    const err = validateDraft(draft({ status: 'ASSIGNED' }))
    expect(err?.field).toBe('assignedTo')
    expect(validateDraft(draft({ status: 'ASSIGNED', assignedTo: 'u1' }))).toBeNull()
  })

  it('끝나는 날이 취득일자보다 앞서면 막는다(폐기·만료 둘 다)', () => {
    const retired = validateDraft(
      draft({ status: 'RETIRED', acquiredOn: '2026-03-01', endsOn: '2026-02-28' }),
    )
    expect(retired?.field).toBe('endsOn')
    expect(retired?.message).toContain('폐기일자')

    const live = validateDraft(
      draft({ status: 'AVAILABLE', acquiredOn: '2026-03-01', endsOn: '2026-02-28' }),
    )
    expect(live?.field).toBe('endsOn')
    expect(live?.message).toContain('만료일')
  })

  it('같은 날 취득·폐기는 허용한다(경계값)', () => {
    expect(
      validateDraft(draft({ status: 'RETIRED', acquiredOn: '2026-03-01', endsOn: '2026-03-01' })),
    ).toBeNull()
  })

  it('취득일자 없는 폐기는 허용한다 — 날짜를 모르는 과거 자산도 등록해야 한다', () => {
    expect(validateDraft(draft({ status: 'RETIRED', endsOn: '2020-01-01' }))).toBeNull()
  })

  it('금액은 숫자만 받는다(빈 값은 미입력이라 통과)', () => {
    expect(validateDraft(draft({ amount: '2500000' }))).toBeNull()
    expect(validateDraft(draft({ amount: '' }))).toBeNull()
    expect(validateDraft(draft({ amount: '-1' }))?.field).toBe('amount')
  })
})

describe('전이 규칙', () => {
  it('폐기 상태로 바꾸면 할당이 비워진다', () => {
    expect(withStatus(draft({ assignedTo: 'u1' }), 'RETIRED').assignedTo).toBe('')
  })

  it('상태를 바꿔도 끝나는 날은 그대로다 — 지운 적 없는 값이 사라지면 안 된다', () => {
    const retired = withStatus(draft({ endsOn: '2027-12-31' }), 'RETIRED')
    expect(retired.endsOn).toBe('2027-12-31')
    // 되돌려도 마찬가지다. 바뀌는 것은 그 날짜가 저장될 컬럼뿐이다.
    expect(withStatus(retired, 'AVAILABLE').endsOn).toBe('2027-12-31')
  })

  it('전이 결과는 곧 저장 가능해야 한다(제약과 어긋난 중간 상태를 남기지 않는다)', () => {
    const next = withStatus(draft({ status: 'RETIRED', endsOn: '2026-03-01' }), 'AVAILABLE')
    expect(validateDraft(next)).toBeNull()
  })

  it('보수는 할당을 유지한다 — 정비 중에도 소유자는 그대로다', () => {
    expect(withStatus(draft({ assignedTo: 'u1' }), 'MAINTENANCE').assignedTo).toBe('u1')
  })

  it('끝나는 날의 이름은 상태가 정한다', () => {
    expect(endsOnLabel('RETIRED')).toBe('폐기일자')
    expect(endsOnLabel('AVAILABLE')).toBe('만료일')
    expect(endsOnLabel('ASSIGNED')).toBe('만료일')
  })
})

describe('금액 입출력', () => {
  it('숫자 아닌 문자는 걸러 낸다(붙여 넣은 구분 기호 포함)', () => {
    expect(normalizeAmountInput('2,500,000원')).toBe('2500000')
    expect(normalizeAmountInput('-1')).toBe('1')
  })

  it('표시할 때 천 단위로 끊고, 미입력은 0원과 구분한다', () => {
    expect(formatAmount(2500000)).toBe('2,500,000')
    expect(formatAmount(0)).toBe('0')
    expect(formatAmount(null)).toBe('—')
  })
})

describe('toAssetInput', () => {
  it('빈 문자열은 null로 접고 공백은 다듬는다', () => {
    const input = toAssetInput(draft({ name: '  법인차량 EV6 ', itemType: ' 차량 ', note: '  ' }))
    expect(input.name).toBe('법인차량 EV6')
    expect(input.itemType).toBe('차량')
    expect(input.note).toBeNull()
    expect(input.assignedTo).toBeNull()
    expect(input.amount).toBeNull()
  })

  it('금액 0은 값으로 보낸다 — 무상 취득과 미입력은 다른 사실이다', () => {
    expect(toAssetInput(draft({ amount: '0' })).amount).toBe(0)
  })

  it('끝나는 날은 상태에 따라 두 컬럼으로 갈린다', () => {
    const live = toAssetInput(draft({ status: 'AVAILABLE', endsOn: '2027-12-31' }))
    expect(live.returnDue).toBe('2027-12-31')
    expect(live.disposedOn).toBeNull()

    const retired = toAssetInput(draft({ status: 'RETIRED', endsOn: '2027-12-31' }))
    expect(retired.disposedOn).toBe('2027-12-31')
    expect(retired.returnDue).toBeNull()
  })

  it('끝나는 날이 비면 양쪽 다 null이다', () => {
    const input = toAssetInput(draft({ status: 'RETIRED', endsOn: '' }))
    expect(input.disposedOn).toBeNull()
    expect(input.returnDue).toBeNull()
  })
})
