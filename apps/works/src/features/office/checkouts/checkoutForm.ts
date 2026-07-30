/**
 * 반출 등록 폼의 값 모델과 검증 — 화면과 떼어 두고 여기서만 판단한다.
 * 규칙은 DB 제약(20260730180000_asset_checkouts.sql)을 비춘 것이며, 어긋나면 DB가 맞다.
 */
import { periodsOverlap, todayKey } from '@/features/office/checkouts/checkoutConfig'
import type { Checkout, CheckoutInput } from '@/features/office/checkouts/checkoutsApi'

export interface CheckoutDraft {
  /** 빈 문자열이면 미선택. */
  assetId: string
  checkoutOn: string
  dueOn: string
  purpose: string
  destination: string
  note: string
}

export interface CheckoutFormError {
  field: keyof CheckoutDraft
  message: string
}

/** 반출일은 오늘이 기본이다 — "지금 가져감"과 "미리 잡아 둠"을 화면에서 가르지 않는다. */
export function emptyCheckoutDraft(today: string = todayKey()): CheckoutDraft {
  return {
    assetId: '',
    checkoutOn: today,
    dueOn: '',
    purpose: '',
    destination: '',
    note: '',
  }
}

/** 저장 전 검증. 첫 번째로 어긋난 규칙 하나만 돌려준다. */
export function validateCheckoutDraft(draft: CheckoutDraft): CheckoutFormError | null {
  if (!draft.assetId) return { field: 'assetId', message: '반출할 물품을 고르세요.' }
  if (!draft.checkoutOn) return { field: 'checkoutOn', message: '반출일을 입력하세요.' }
  // 끝이 없으면 겹침을 판정할 수 없어 예약 자체가 성립하지 않는다.
  if (!draft.dueOn) return { field: 'dueOn', message: '반납 예정일을 입력하세요.' }
  if (draft.dueOn < draft.checkoutOn) {
    return { field: 'dueOn', message: '반납 예정일은 반출일보다 앞설 수 없습니다.' }
  }
  if (!draft.purpose.trim()) return { field: 'purpose', message: '반출 목적을 입력하세요.' }
  return null
}

export function toCheckoutInput(draft: CheckoutDraft): CheckoutInput {
  return {
    assetId: draft.assetId,
    checkoutOn: draft.checkoutOn,
    dueOn: draft.dueOn,
    purpose: draft.purpose.trim(),
    destination: draft.destination.trim() || null,
    note: draft.note.trim() || null,
  }
}

/**
 * 고른 기간과 부딪히는 기존 점유 건. 최종 판정은 DB의 EXCLUDE 제약이지만, 저장을 누른 뒤에야
 * 알게 되면 날짜를 다시 고르는 일이 두 번 걸린다.
 */
export function conflictingCheckouts(
  draft: CheckoutDraft,
  occupancy: Checkout[],
): Checkout[] {
  if (!draft.checkoutOn || !draft.dueOn) return []
  return occupancy.filter((c) =>
    periodsOverlap(
      { from: draft.checkoutOn, to: draft.dueOn },
      { from: c.checkoutOn, to: c.dueOn },
    ),
  )
}

/**
 * 아직 돌아오지 않은 반출 건(연체 포함). 기간이 겹치지 않아도 알려야 한다 —
 * 점유는 예정 기간으로만 잡히므로, 반납이 늦어지면 다음 사람이 빈손으로 오게 된다.
 */
export function unreturnedCheckouts(occupancy: Checkout[]): Checkout[] {
  return occupancy.filter((c) => c.status === 'OUT')
}
