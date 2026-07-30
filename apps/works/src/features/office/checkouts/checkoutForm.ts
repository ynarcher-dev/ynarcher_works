/**
 * 반출 등록 폼의 값 모델과 검증 — 화면과 떼어 두고 여기서만 판단한다.
 * 규칙은 DB 제약(20260730180000·20260730190000)을 비춘 것이며, 어긋나면 DB가 맞다.
 *
 * 폼이 들고 있는 일시는 로컬 입력 표기('YYYY-MM-DDTHH:mm')다 — 문자열끼리 비교해도
 * 시간 순서가 그대로 나오므로, 검증에서 Date로 되돌릴 필요가 없다.
 */
import {
  localToIso,
  nowLocalInput,
  periodsOverlap,
  remainingForPeriod,
} from '@/features/office/checkouts/checkoutConfig'
import type { Checkout, CheckoutInput } from '@/features/office/checkouts/checkoutsApi'
import dayjs from 'dayjs'

export interface CheckoutDraft {
  /** 빈 문자열이면 미선택. */
  assetId: string
  /** 로컬 표기 'YYYY-MM-DDTHH:mm'. */
  checkoutAt: string
  dueAt: string
  /** 가져갈 개수(1 이상 정수 문자열). */
  quantity: string
  purpose: string
  destination: string
  note: string
}

export interface CheckoutFormError {
  field: keyof CheckoutDraft
  message: string
}

/** 기본 반납 예정은 반출 시각의 하루 뒤 — 가장 흔한 대여가 '내일까지'라서다(고칠 수 있다). */
export function defaultDueAt(checkoutAt: string): string {
  return checkoutAt ? dayjs(checkoutAt).add(1, 'day').format('YYYY-MM-DDTHH:mm') : ''
}

/**
 * 빈 초안. 반출 시각은 지금이 기본이다 — "지금 가져감"과 "미리 잡아 둠"을 화면에서 가르지
 * 않고, 그 차이는 사용자가 고친 시각이 말한다.
 */
export function emptyCheckoutDraft(assetId = '', now: string = nowLocalInput()): CheckoutDraft {
  return {
    assetId,
    checkoutAt: now,
    dueAt: defaultDueAt(now),
    quantity: '1',
    purpose: '',
    destination: '',
    note: '',
  }
}

/** 저장 전 검증. 첫 번째로 어긋난 규칙 하나만 돌려준다. */
export function validateCheckoutDraft(draft: CheckoutDraft): CheckoutFormError | null {
  if (!draft.assetId) return { field: 'assetId', message: '반출할 물품을 고르세요.' }
  if (!draft.checkoutAt) return { field: 'checkoutAt', message: '반출 일시를 입력하세요.' }
  // 끝이 없으면 겹침을 판정할 수 없어 예약 자체가 성립하지 않는다.
  if (!draft.dueAt) return { field: 'dueAt', message: '반납 예정 일시를 입력하세요.' }
  if (draft.dueAt <= draft.checkoutAt) {
    return { field: 'dueAt', message: '반납 예정은 반출 일시보다 뒤여야 합니다.' }
  }
  if (!/^\d+$/.test(draft.quantity) || Number(draft.quantity) < 1) {
    return { field: 'quantity', message: '반출 수량은 1 이상의 숫자로 입력하세요.' }
  }
  if (!draft.purpose.trim()) return { field: 'purpose', message: '반출 목적을 입력하세요.' }
  return null
}

export function toCheckoutInput(draft: CheckoutDraft): CheckoutInput {
  return {
    assetId: draft.assetId,
    checkoutAt: localToIso(draft.checkoutAt),
    dueAt: localToIso(draft.dueAt),
    quantity: Number(draft.quantity || '1'),
    purpose: draft.purpose.trim(),
    destination: draft.destination.trim() || null,
    note: draft.note.trim() || null,
  }
}

/**
 * 고른 기간의 잔여 수량. 최종 판정은 DB 트리거지만, 저장을 누른 뒤에야 알게 되면 시각과
 * 개수를 다시 고르는 일이 두 번 걸린다.
 *
 * 기간이 아직 비어 있으면 판정하지 않는다(`null`) — 폼을 열자마자 "잔여 0"이라고 적으면
 * 아직 아무것도 고르지 않은 사람에게 없는 문제를 알리는 셈이다.
 */
export function remainingForDraft(
  quantity: number,
  occupancy: Checkout[],
  draft: CheckoutDraft,
): number | null {
  if (!draft.checkoutAt || !draft.dueAt || draft.dueAt <= draft.checkoutAt) return null
  return remainingForPeriod(
    quantity,
    occupancy,
    localToIso(draft.checkoutAt),
    localToIso(draft.dueAt),
  )
}

/** 고른 기간과 부딪히는 기존 점유 건(누가 잡고 있는지 이름을 대기 위해 쓴다). */
export function conflictingCheckouts(draft: CheckoutDraft, occupancy: Checkout[]): Checkout[] {
  if (!draft.checkoutAt || !draft.dueAt) return []
  const from = localToIso(draft.checkoutAt)
  const to = localToIso(draft.dueAt)
  return occupancy.filter((c) => periodsOverlap({ from, to }, { from: c.checkoutAt, to: c.dueAt }))
}

/**
 * 아직 돌아오지 않은 반출 건. 기간이 겹치지 않아도 알려야 한다 — 점유는 예정 기간으로만
 * 잡히므로, 반납이 늦어지면 다음 사람이 빈손으로 오게 된다.
 */
export function unreturnedCheckouts(occupancy: Checkout[]): Checkout[] {
  return occupancy.filter((c) => c.status === 'OUT')
}
