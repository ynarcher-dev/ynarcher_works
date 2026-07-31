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
import type { BadgeTone } from '@ynarcher/ui'
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
 * 상태 배지의 색 — 이력 목록에서 상태를 가르는 일은 행 배경이 아니라 이 색 하나가 맡는다.
 * 행마다 배경을 갈면 같은 목록 안에서 상자의 무게가 달라져, 정작 상태는 회색 글자에 묻힌다.
 *
 * 색이 나누는 축은 "끝났는가"가 아니라 "제대로 끝났는가"다. 무산된 건(반려·취소)은 물건이
 * 오간 적 없이 접힌 기록이므로 붉게 세워 정상 흐름과 갈라 놓고, 회색은 제 할 일을 마친
 * `반납 완료` 하나에만 준다 — 취소를 회색에 섞으면 목록이 온통 '무사히 끝난 것'으로 읽힌다.
 */
export const CHECKOUT_TONES: Record<CheckoutStatus, BadgeTone> = {
  PENDING: 'warning',
  RESERVED: 'info',
  OUT: 'info',
  RETURNED: 'neutral',
  REJECTED: 'danger',
  CANCELLED: 'danger',
}

/** 반출 건에 대고 하는 처리. 한 마디를 더 받아야 하는 둘(반려·반납)은 화면이 모달을 연다. */
export type CheckoutAction = 'APPROVE' | 'REJECT' | 'START' | 'RETURN' | 'CANCEL'

/** 처리를 보는 사람 — 본인 여부와 승인권을 함께 판정하므로 한 덩이로 넘긴다. */
export interface CheckoutViewer {
  id?: string
  isManager: boolean
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
 * 시작이 밀렸다고 말하기까지 두는 여유(5분).
 *
 * 자동 반출 시작은 대장을 열 때 서버가 한다. 그 왕복이 끝나기 전의 첫 렌더에서는 방금 시각이
 * 된 예약이 아직 '예약'인데, 여유가 없으면 그 짧은 순간에 '시작 지연'이 떴다가 '반출 중'으로
 * 바뀐다 — 아무 일도 없었는데 경고가 스쳐 지나가는 화면이 된다. 5분은 그 왕복보다 넉넉히
 * 길고, 사람이 "밀렸다"고 부르기 시작하는 길이보다는 짧다.
 */
export const START_DELAY_GRACE_MS = 5 * 60_000

/**
 * 시작이 밀린 예약 — 약속한 시각은 지났는데 아직 물건을 받지 못한 자리.
 *
 * 앞사람이 반납을 기록하지 않으면 자동 반출 시작(`start_due_checkouts`)이 재고 판정에 걸려
 * 이 건을 예약으로 남긴다. 예약을 반출 중으로 밀어 올리면 나가 있지도 않은 물건이 나간 것이
 * 되므로, 대신 밀렸다는 사실 자체를 상태로 읽는다.
 */
export function isStartDelayed(
  row: { status: CheckoutStatus; checkoutAt: string },
  now: string,
): boolean {
  if (row.status !== 'RESERVED') return false
  const past = Date.parse(now) - Date.parse(row.checkoutAt)
  return !Number.isNaN(past) && past > START_DELAY_GRACE_MS
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
 * 반납되지 않은 채 예정 시각이 지난 건 — 이 물건은 지금 이 순간에도 나가 있다.
 *
 * 선언한 기간이 끝났다고 물건이 돌아온 것은 아니다. 기간으로만 재고를 세면 예정 시각이
 * 지나는 순간 나가 있는 물건이 장부에서 사라지고, 그 자리를 다음 사람이 가져가 한 개짜리
 * 물건을 두 사람이 들고 있게 된다.
 */
const isOverdue = (c: StockSpan, now: string) => c.status === 'OUT' && c.dueAt <= now

/** 연체로 붙잡혀 있는 개수의 합. */
export function overdueQuantity(spans: StockSpan[], now: string): number {
  return spans.filter((c) => isOverdue(c, now)).reduce((sum, c) => sum + c.quantity, 0)
}

/**
 * 주어진 구간에서 **동시에** 나가 있는 최대 개수.
 *
 * 단순 합이 아니다 — 오전에 한 개, 오후에 한 개가 나갔다면 그 하루에 동시에 나가 있는 것은
 * 두 개가 아니라 한 개다. 합으로 세면 실제로는 남아 있는 물건을 못 빌리게 된다.
 *
 * 시작(+)과 끝(-)을 시간순으로 훑으며 누적의 최댓값을 취한다. 같은 시각에서는 끝을 먼저
 * 세어 반열림 구간('[)')과 뜻을 맞춘다 — 10시에 반납된 것은 10시에 나가는 것과 겹치지 않는다.
 *
 * `now`를 주면 연체 건을 이 계산에서 뺀다(`remainingForPeriod`가 따로 센다) — 선언한 기간과
 * 지금 붙잡고 있다는 사실을 둘 다 세면 같은 물건을 두 번 빼게 된다. DB는 이 규칙을
 * `app.check_asset_stock()`에 갖고 있으며, 둘이 어긋나면 DB가 맞다.
 */
export function peakUsage(
  spans: StockSpan[],
  from: string,
  to: string,
  now?: string,
): number {
  const events: { t: string; d: number }[] = []
  for (const c of spans) {
    if (!occupies(c)) continue
    if (now !== undefined && isOverdue(c, now)) continue
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

/**
 * 그 구간에 새로 가져갈 수 있는 개수(0 이상).
 *
 * `now`를 주면 연체를 함께 본다 — 다만 **지금을 덮는 구간에서만** 뺀다. 미래 구간은 물건이
 * 돌아온다고 보고 열어 둔다: 언제 돌아올지 모른다는 이유로 모든 줄서기를 막으면 대장이
 * 순서를 관리하는 일을 그만두게 된다.
 */
export function remainingForPeriod(
  quantity: number,
  spans: StockSpan[],
  from: string,
  to: string,
  now?: string,
): number {
  const held =
    now !== undefined && from <= now && to > now ? overdueQuantity(spans, now) : 0
  return Math.max(quantity - peakUsage(spans, from, to, now) - held, 0)
}

/** 지금 이 순간의 잔여. 표의 `잔여 / 보유` 칸이 읽는 값이다. 연체분은 나가 있는 것으로 센다. */
export function remainingNow(quantity: number, spans: StockSpan[], now: string): number {
  const used = spans
    .filter((c) => occupies(c) && c.checkoutAt <= now && c.dueAt > now)
    .reduce((sum, c) => sum + c.quantity, 0)
  return Math.max(quantity - used - overdueQuantity(spans, now), 0)
}

/**
 * 처음으로 한 개가 비는 시각(ISO) — 예약 폼이 고를 수 있는 가장 이른 시각.
 *
 * 잔여가 0이라고 해서 이 물건을 아예 잡을 수 없는 것은 아니다. 지금 나가 있는 것이 돌아오는
 * 시각부터는 비어 있으므로, 그때부터를 고르게 해야 한다 — 잔여 0을 "예약 불가"로 읽으면
 * 한 개짜리 물건은 영원히 한 사람만 쓰게 된다.
 *
 * 잡혀 있는 것들이 풀리는 시각을 이른 순으로 훑어 처음으로 한 개가 뜨는 순간을 고른다.
 * 앞 건이 끝나는 자리에 다음 예약이 붙어 있으면 그 자리는 여전히 0이므로 더 뒤로 간다.
 */
export function nextAvailableAt(
  quantity: number,
  spans: StockSpan[],
  now: string,
): string | null {
  // 연체분은 지금 기준으로 한 번만 세어 미래 시점에도 그대로 들고 간다 — 언제 돌아올지
  // 모르므로 "그때는 비어 있을 것"이라고 가정하지 않는다.
  const held = overdueQuantity(spans, now)
  const free = (at: string) => {
    const used = spans
      .filter((c) => occupies(c) && !isOverdue(c, now) && c.checkoutAt <= at && c.dueAt > at)
      .reduce((sum, c) => sum + c.quantity, 0)
    return quantity - used - held > 0
  }

  if (free(now)) return now
  const ends = [
    ...new Set(
      spans.filter((c) => occupies(c) && !isOverdue(c, now) && c.dueAt > now).map((c) => c.dueAt),
    ),
  ].sort()
  for (const t of ends) {
    if (free(t)) return t
  }
  // 걸려 있는 것이 모두 풀려도 자리가 나지 않는다 — 연체가 원인이면 언제 돌아올지 아무도
  // 모르므로 시각을 지어내지 않고 모른다고 답한다(화면은 미반납 경고로 이를 말한다).
  return null
}

// ── 물품의 지금 상태 ──────────────────────────────────────────────────

/** 표에 적는 물품 상태. 반출 건들에서 파생하며 자산 원장에는 저장하지 않는다. */
export type AssetState = 'AVAILABLE' | 'PENDING' | 'RESERVED' | 'DELAYED' | 'OUT' | 'OVERDUE'

/**
 * 반납 예정이 지났는데 돌아오지 않은 상태의 이름.
 *
 * '연체'가 아니라 '반납 지연'이라 부른다. 짝이 되는 '시작 지연'(나갔어야 할 물건이 안 나감)과
 * 같은 말투를 쓰면 둘이 한 축의 두 끝으로 읽힌다 — 약속한 시각이 지났는데 물건이 움직이지
 * 않은 자리. '연체'는 돈을 늦게 낸 것처럼 들려 벌칙을 연상시키지만, 여기서 필요한 것은
 * 벌이 아니라 "지금 어긋나 있다"는 사실이다.
 */
export const OVERDUE_LABEL = '반납 지연'

export const ASSET_STATE_LABELS: Record<AssetState, string> = {
  AVAILABLE: '반출 가능',
  PENDING: '승인 대기',
  RESERVED: '예약',
  DELAYED: '시작 지연',
  OUT: '반출 중',
  OVERDUE: OVERDUE_LABEL,
}

/** 필터·정렬에서 쓰는 표기 순서(급한 것부터). */
export const ASSET_STATE_ORDER: AssetState[] = [
  'OVERDUE',
  'DELAYED',
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

  // 시작이 밀린 예약 — 약속한 시각이 지났는데 아직 물건을 받지 못한 자리(기간이 통째로
  // 지난 예약은 제외한다. 자동 반출 시작도 같은 조건으로 건드리지 않는다).
  //
  // 자리가 정하는 것은 두 가지다. 연체 **뒤**에 두는 이유는, 앞사람이 반납하지 않아 밀린
  // 경우 이 물건의 상태가 이미 '반납 지연'이고 그쪽이 손대야 할 사실이기 때문이다 — 시작 지연은
  // 결과이지 원인이 아니다. '반출 가능' **뒤**에 두는 이유는, 남은 것이 있으면 다른 사람은
  // 그대로 빌릴 수 있어서다. 잔여가 있는데도 시작이 밀렸다면 다음 진입의 자동 보정이
  // 곧 반출 중으로 옮긴다. 그래서 지연이 오래 남는 자리는 언제나 잔여 0이다.
  const delayed = checkouts
    .filter((c) => isStartDelayed(c, now) && c.dueAt > now)
    .sort((a, b) => a.checkoutAt.localeCompare(b.checkoutAt))[0]
  if (delayed) return { state: 'DELAYED', active: delayed }

  const out = covering('OUT')
  if (out) return { state: 'OUT', active: out }
  const pending = covering('PENDING') ?? soonest('PENDING')
  if (pending) return { state: 'PENDING', active: pending }
  const reserved = covering('RESERVED') ?? soonest('RESERVED')
  if (reserved) return { state: 'RESERVED', active: reserved }
  return { state: 'AVAILABLE', active: null }
}

/**
 * 이 물건에 걸린 승인 대기 건(오래 기다린 순). 표의 승인 열이 읽는다.
 *
 * 상태(`deriveAssetState`)로 판정하지 않는 이유가 있다 — 다섯 개 중 하나에 승인 대기가
 * 걸려도 남은 것이 있으면 물품 상태는 '반출 가능'이라, 상태만 보면 기다리는 요청이
 * 보이지 않는다. 승인해야 할 일이 있는가는 걸린 건들에서 직접 세어야 한다.
 */
export function pendingCheckouts<T extends { status: CheckoutStatus; checkoutAt: string }>(
  checkouts: T[],
): T[] {
  return checkouts
    .filter((c) => c.status === 'PENDING')
    .sort((a, b) => a.checkoutAt.localeCompare(b.checkoutAt))
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
  viewer: CheckoutViewer,
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
