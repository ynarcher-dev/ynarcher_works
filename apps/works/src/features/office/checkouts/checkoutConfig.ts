/**
 * 반출대장의 값 체계와 규칙 — 화면(JSX)·서버 훅과 떼어 두고 여기서만 판단한다.
 * 기획: docs_planning/3_1_2_office_asset_checkout.md
 *
 * 화면의 주인공은 반출 기록이 아니라 물품이다. 목록에 반출 가능한 물건이 늘어서고, 그 물건을
 * 열면 사진·설명과 함께 지금 누가 갖고 있는지가 나온다 — 회의실 예약이 회의실을 늘어놓고
 * 그 방의 예약을 모달에서 다루는 것과 같은 구조다. 그래서 "이 물건이 지금 어떤 상태인가"를
 * 반출 건들에서 파생하는 함수(deriveAssetState)가 이 파일의 중심이다.
 *
 * 상태 전이의 최종 판정은 DB 트리거(app.validate_asset_checkout_transition)다. 같은 규칙을
 * 여기 두는 것은 버튼을 무엇으로 보여줄지 정하기 위해서이며, 둘이 어긋나면 DB가 맞다.
 */
import dayjs from 'dayjs'

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

// ── 일시 다루기 ───────────────────────────────────────────────────────
// 원장은 timestamptz(ISO 문자열)로 오가고, 화면 입력은 datetime-local('YYYY-MM-DDTHH:mm')이다.
// 두 표기를 오가는 자리를 여기 하나로 모은다 — 컴포넌트마다 new Date()를 부르면 시간대 보정이
// 제각각이 되어 저장한 시각과 다시 연 시각이 어긋난다.

/** 지금(입력 칸에 넣을 수 있는 로컬 표기). */
export function nowLocalInput(now: Date = new Date()): string {
  return dayjs(now).format('YYYY-MM-DDTHH:mm')
}

/** 로컬 입력 표기 → 저장용 ISO. 빈 값은 그대로 빈 값이다(검증이 먼저 막는다). */
export function localToIso(local: string): string {
  return local ? dayjs(local).toISOString() : ''
}

/** 저장값 → 로컬 입력 표기(수정 폼이 다시 열릴 때). */
export function isoToLocalInput(iso: string | null): string {
  return iso ? dayjs(iso).format('YYYY-MM-DDTHH:mm') : ''
}

/** 표시용 일시. 분까지만 적는다 — 초는 이 대장에서 아무 것도 가르지 않는다. */
export function formatDateTime(iso: string | null): string {
  return iso ? dayjs(iso).format('YYYY-MM-DD HH:mm') : ''
}

/**
 * 경과 시간 표기 — 큰 단위 하나만 적는다('3일 경과'). '3일 4시간 12분'은 정확하지만,
 * 표에서 읽는 사람이 알고 싶은 것은 얼마나 늦었나의 크기뿐이다.
 */
export function elapsedLabel(ms: number): string {
  if (ms <= 0) return ''
  const min = Math.floor(ms / 60_000)
  if (min < 60) return `${min}분 경과`
  const hour = Math.floor(min / 60)
  if (hour < 24) return `${hour}시간 경과`
  return `${Math.floor(hour / 24)}일 경과`
}

/**
 * 연체 경과(밀리초). 반출 중이 아니거나 예정 시각이 남았으면 0이다.
 *
 * 연체를 컬럼에 저장하지 않는 이유가 여기 있다 — 시각이 지날 때마다 누군가 갱신해 주어야
 * 하고, 그 갱신이 늦으면 화면이 거짓말을 한다. 조회 시점에 세면 언제나 사실이다.
 */
export function overdueMs(
  row: { status: CheckoutStatus; dueAt: string },
  now: string,
): number {
  if (row.status !== 'OUT') return 0
  const diff = Date.parse(now) - Date.parse(row.dueAt)
  return Number.isNaN(diff) || diff <= 0 ? 0 : diff
}

// ── 물품의 지금 상태 ──────────────────────────────────────────────────

/** 표에 적는 물품 상태. 반출 건들에서 파생하며 자산 원장에는 저장하지 않는다. */
export type AssetState = 'AVAILABLE' | 'PENDING' | 'RESERVED' | 'OUT' | 'OVERDUE'

export const ASSET_STATE_LABELS: Record<AssetState, string> = {
  AVAILABLE: '반출 가능',
  PENDING: '승인 대기',
  RESERVED: '예약',
  OUT: '반출 중',
  OVERDUE: '연체',
}

/** 필터·정렬에서 쓰는 표기 순서(급한 것부터). */
export const ASSET_STATE_ORDER: AssetState[] = [
  'OVERDUE',
  'OUT',
  'PENDING',
  'RESERVED',
  'AVAILABLE',
]

export interface AssetStateResult<T> {
  state: AssetState
  /** 그 상태를 만든 반출 건(반출 가능이면 없음). 표의 반출자·반납 예정 칸이 이것을 읽는다. */
  active: T | null
}

/**
 * 물품의 지금 상태 — 나가 있는 것이 먼저고, 그 다음이 승인 대기, 그 다음이 예약이다.
 *
 * 한 물건에 여러 건이 걸려 있을 수 있다(오늘 나가 있고 다음 주에 예약이 잡힌 상태). 표는 한 줄에
 * 한 상태만 적을 수 있으므로, 지금 이 물건을 찾는 사람에게 가장 중요한 사실 하나를 고른다 —
 * "지금 없다"가 "다음 주에 없을 것이다"보다 앞선다.
 */
export function deriveAssetState<T extends { status: CheckoutStatus; dueAt: string }>(
  checkouts: T[],
  now: string,
): AssetStateResult<T> {
  const pick = (s: CheckoutStatus) =>
    checkouts
      .filter((c) => c.status === s)
      .sort((a, b) => a.dueAt.localeCompare(b.dueAt))[0]

  const out = pick('OUT')
  if (out) return { state: overdueMs(out, now) > 0 ? 'OVERDUE' : 'OUT', active: out }
  const pending = pick('PENDING')
  if (pending) return { state: 'PENDING', active: pending }
  const reserved = pick('RESERVED')
  if (reserved) return { state: 'RESERVED', active: reserved }
  return { state: 'AVAILABLE', active: null }
}

// ── 처리 권한 ─────────────────────────────────────────────────────────

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

/** 기간이 겹치는지(반열림 '[)') — 등록 폼이 저장 전에 미리 알려 주기 위한 판정. */
export function periodsOverlap(
  a: { from: string; to: string },
  b: { from: string; to: string },
): boolean {
  return a.from < b.to && b.from < a.to
}
