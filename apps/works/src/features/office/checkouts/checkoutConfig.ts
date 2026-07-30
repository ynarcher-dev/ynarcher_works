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

// ── 재고 ──────────────────────────────────────────────────────────────
// 판정의 최종 권한은 DB 트리거(app.check_asset_stock)에 있다. 같은 계산을 여기 두는 것은
// 저장을 누르기 전에 몇 개 남았는지 보여 주기 위해서이며, 둘이 어긋나면 DB가 맞다.

/** 재고 계산이 보는 반출 건의 최소 모양. */
export interface StockSpan {
  status: CheckoutStatus
  checkoutAt: string
  dueAt: string
  quantity: number
}

const occupies = (c: StockSpan) => OCCUPYING_STATUSES.includes(c.status)

/**
 * 주어진 구간에서 **동시에** 나가 있는 최대 개수.
 *
 * 단순 합이 아니다 — 오전에 한 개, 오후에 한 개가 나갔다면 그 하루에 동시에 나가 있는 것은
 * 두 개가 아니라 한 개다. 합으로 세면 실제로는 남아 있는 물건을 못 빌리게 된다.
 *
 * 시작(+)과 끝(-)을 시간순으로 훑으며 누적의 최댓값을 취한다. 같은 시각에서는 끝을 먼저
 * 세어 반열림 구간('[)')과 뜻을 맞춘다 — 10시에 반납된 것은 10시에 나가는 것과 겹치지 않는다.
 */
export function peakUsage(spans: StockSpan[], from: string, to: string): number {
  const events: { t: string; d: number }[] = []
  for (const c of spans) {
    if (!occupies(c)) continue
    if (!(c.checkoutAt < to && c.dueAt > from)) continue
    events.push({ t: c.checkoutAt, d: c.quantity })
    events.push({ t: c.dueAt, d: -c.quantity })
  }
  events.sort((a, b) => (a.t === b.t ? a.d - b.d : a.t < b.t ? -1 : 1))

  let running = 0
  let peak = 0
  for (const e of events) {
    running += e.d
    if (running > peak) peak = running
  }
  return peak
}

/** 그 구간에 새로 가져갈 수 있는 개수(0 이상). */
export function remainingForPeriod(
  quantity: number,
  spans: StockSpan[],
  from: string,
  to: string,
): number {
  return Math.max(quantity - peakUsage(spans, from, to), 0)
}

/** 지금 이 순간의 잔여. 표의 `잔여 / 보유` 칸이 읽는 값이다. */
export function remainingNow(quantity: number, spans: StockSpan[], now: string): number {
  const used = spans
    .filter((c) => occupies(c) && c.checkoutAt <= now && c.dueAt > now)
    .reduce((sum, c) => sum + c.quantity, 0)
  return Math.max(quantity - used, 0)
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
 * 물품의 지금 상태 — 연체가 가장 앞서고, 그 다음은 지금 남은 것이 있느냐다.
 *
 * 수량이 생기면서 "나가 있음"과 "빌릴 수 없음"이 갈렸다. 다섯 개 중 두 개가 나가 있어도
 * 세 개는 빌릴 수 있으므로, 남은 것이 있으면 `반출 가능`이다. 잔여가 0일 때에야 무엇 때문에
 * 못 빌리는지(반출 중·승인 대기·예약)를 적는다.
 *
 * 연체만은 잔여와 무관하게 앞세운다 — 남은 게 있든 없든 돌아오지 않은 물건은 알려야 한다.
 */
export function deriveAssetState<T extends StockSpan>(
  checkouts: T[],
  now: string,
  quantity = 1,
): AssetStateResult<T> {
  const covering = (s: CheckoutStatus) =>
    checkouts
      .filter((c) => c.status === s && c.checkoutAt <= now && c.dueAt > now)
      .sort((a, b) => a.dueAt.localeCompare(b.dueAt))[0]
  const soonest = (s: CheckoutStatus) =>
    checkouts
      .filter((c) => c.status === s)
      .sort((a, b) => a.checkoutAt.localeCompare(b.checkoutAt))[0]

  const overdue = checkouts
    .filter((c) => overdueMs(c, now) > 0)
    .sort((a, b) => a.dueAt.localeCompare(b.dueAt))[0]
  if (overdue) return { state: 'OVERDUE', active: overdue }

  if (remainingNow(quantity, checkouts, now) > 0) {
    // 남은 것이 있으면 빌릴 수 있다. 다만 지금 나가 있는 건이 있으면 그 건을 함께 실어
    // 보내, 표의 반출자·반납 예정 칸이 빈 채로 남지 않게 한다.
    return { state: 'AVAILABLE', active: covering('OUT') ?? null }
  }

  const out = covering('OUT')
  if (out) return { state: 'OUT', active: out }
  const pending = covering('PENDING') ?? soonest('PENDING')
  if (pending) return { state: 'PENDING', active: pending }
  const reserved = covering('RESERVED') ?? soonest('RESERVED')
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
