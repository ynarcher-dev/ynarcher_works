/**
 * 반출대장의 값 체계와 규칙 — 화면(JSX)·서버 훅과 떼어 두고 여기서만 판단한다.
 * 기획: docs_planning/3_1_2_office_asset_checkout.md
 *
 * 상태 전이의 최종 판정은 DB 트리거(app.validate_asset_checkout_transition)다. 같은 규칙을
 * 여기 두는 것은 버튼을 무엇으로 보여줄지 정하기 위해서이며, 둘이 어긋나면 DB가 맞다.
 */

export type CheckoutStatus =
  | 'PENDING'
  | 'REJECTED'
  | 'RESERVED'
  | 'OUT'
  | 'RETURNED'
  | 'CANCELLED'

export const CHECKOUT_LABELS: Record<CheckoutStatus, string> = {
  PENDING: '승인 대기',
  REJECTED: '반려',
  RESERVED: '예약',
  OUT: '반출 중',
  RETURNED: '반납 완료',
  CANCELLED: '취소',
}

/**
 * 기간을 점유하는 상태 — 이 셋만 겹침 차단(EXCLUDE)의 대상이다.
 * 승인 대기가 포함되는 이유는, 잡아 두지 않으면 승인이 떨어지는 순간 겹침으로 실패하고
 * 그 실패가 승인권자 앞에서 일어나기 때문이다.
 */
export const OCCUPYING_STATUSES: CheckoutStatus[] = ['PENDING', 'RESERVED', 'OUT']

/** 종결 상태 — 어떤 상태로도 되돌리지 않는다. */
export const CLOSED_STATUSES: CheckoutStatus[] = ['RETURNED', 'REJECTED', 'CANCELLED']

/** 목록 뷰(탭). 대장을 여는 사람이 그때 묻고 있는 질문이 곧 탭이다. */
export type CheckoutView = 'OUT' | 'OVERDUE' | 'PENDING' | 'RESERVED' | 'MINE' | 'ALL'

export const CHECKOUT_VIEWS: { key: CheckoutView; label: string }[] = [
  { key: 'OUT', label: '반출 중' },
  { key: 'OVERDUE', label: '연체' },
  { key: 'PENDING', label: '승인 대기' },
  { key: 'RESERVED', label: '예약' },
  { key: 'MINE', label: '내 반출' },
  { key: 'ALL', label: '전체' },
]

/** 오늘(YYYY-MM-DD). 기준일을 인자로 받는 함수들과 짝이다(테스트에서 날짜를 고정하기 위해). */
export function todayKey(now: Date = new Date()): string {
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/**
 * 연체 경과 일수. 반출 중이 아니거나 예정일이 남았으면 0이다.
 *
 * 연체를 컬럼에 저장하지 않는 이유가 여기 있다 — 날짜가 바뀔 때마다 누군가 갱신해 주어야
 * 하고, 그 갱신이 늦으면 화면이 거짓말을 한다. 조회 시점에 세면 언제나 사실이다.
 */
export function overdueDays(
  row: { status: CheckoutStatus; dueOn: string },
  today: string,
): number {
  if (row.status !== 'OUT') return 0
  const diff = Date.parse(`${today}T00:00:00Z`) - Date.parse(`${row.dueOn}T00:00:00Z`)
  if (Number.isNaN(diff) || diff <= 0) return 0
  return Math.floor(diff / 86_400_000)
}

/** 이 사람이 이 반출 건에 대고 할 수 있는 일. 버튼 노출은 이 결과만 본다. */
export interface CheckoutAbility {
  canApprove: boolean
  canStart: boolean
  canReturn: boolean
  canCancel: boolean
}

/**
 * 권한 판정 — 승인은 자산 담당자(management 쓰기)·관리자만, 나머지는 반출자 본인도 한다.
 * 화면에서 감추는 것은 보안이 아니다(서버 트리거가 같은 규칙을 강제한다). 여기서는
 * 누를 수 없는 버튼을 보여 주지 않기 위해 판단한다.
 */
export function abilityOf(
  row: { status: CheckoutStatus; createdBy: string },
  viewer: { id?: string; isManager: boolean },
): CheckoutAbility {
  const owner = Boolean(viewer.id) && row.createdBy === viewer.id
  const mine = owner || viewer.isManager
  return {
    canApprove: row.status === 'PENDING' && viewer.isManager,
    canStart: row.status === 'RESERVED' && mine,
    canReturn: row.status === 'OUT' && mine,
    canCancel: (row.status === 'PENDING' || row.status === 'RESERVED') && mine,
  }
}

/** 기간이 겹치는지(양끝 포함) — 등록 폼이 저장 전에 미리 알려 주기 위한 판정. */
export function periodsOverlap(
  a: { from: string; to: string },
  b: { from: string; to: string },
): boolean {
  return a.from <= b.to && b.from <= a.to
}
