import { Banner, Button, Field, Input, Select, TextArea } from '@ynarcher/ui'
import { useMemo, useState } from 'react'
import {
  CHECKOUT_LABELS,
  elapsedLabel,
  formatDateTime,
  isoToLocalInput,
  nextAvailableAt,
  nowLocalInput,
  overdueMs,
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
  type CheckoutDraft,
  type CheckoutFormError,
} from '@/features/office/checkouts/checkoutForm'
import type { Checkout, CheckoutInput, PortableAsset } from '@/features/office/checkouts/checkoutsApi'

interface CheckoutFormViewProps {
  asset: PortableAsset
  /** 이 물건에 이미 걸려 있는 점유 건(겹침·미반납 경고의 근거). */
  occupancy: Checkout[]
  busy: boolean
  onCancel: () => void
  onSubmit: (v: CheckoutInput) => void
}

/**
 * 반출 등록 폼(물품 모달 안의 두 번째 화면). 회의실 예약 모달의 목록 → 폼 전환과 같은 흐름이다.
 *
 * 물건은 이미 정해져 있다 — 물건을 눌러 들어온 자리이므로 여기서 다시 고르게 하지 않는다.
 * 대신 이 물건의 사정(승인이 필요한가, 아직 안 돌아온 건이 있는가, 그 시간대에 이미 예약이
 * 있는가)을 시각을 고치는 자리 바로 옆에서 알린다.
 */
export function CheckoutFormView({
  asset,
  occupancy,
  busy,
  onCancel,
  onSubmit,
}: CheckoutFormViewProps) {
  // 폼이 열려 있는 동안 기준이 흔들리면 입력 중에 min이 뒤로 밀린다 — 열린 순간을 고정한다.
  const [nowIso] = useState(() => new Date().toISOString())
  const now = isoToLocalInput(nowIso)
  /**
   * 고를 수 있는 가장 이른 시각 — 지금과 "재고가 돌아오는 시각" 중 늦은 쪽.
   *
   * 잔여가 0이어도 예약 자체는 막지 않는다. 대신 지금 나가 있는 것이 돌아오는 시각으로 폼을
   * 열어, 비어 있지 않은 구간을 고르느라 저장을 눌러 보고서야 거절당하는 일을 없앤다.
   *
   * 언제 비는지 알 수 없는 경우(연체 — 돌아올 시각을 아무도 모른다)에는 지금을 바닥으로 둔다.
   * 시각을 지어내 막는 대신 아래 미반납 경고가 사정을 말하고, 최종 판정은 DB에 맡긴다.
   */
  const [earliest] = useState(() => {
    const at = nextAvailableAt(asset.quantity, occupancy, nowIso)
    return at ? isoToLocalInput(at) : nowLocalInput()
  })
  const [draft, setDraft] = useState<CheckoutDraft>(() => emptyCheckoutDraft(asset.id, earliest))
  const [error, setError] = useState<CheckoutFormError | null>(null)

  const conflicts = useMemo(() => conflictingCheckouts(draft, occupancy), [draft, occupancy])
  const unreturned = useMemo(() => unreturnedCheckouts(occupancy), [occupancy])
  const remaining = useMemo(
    () => remainingForDraft(asset.quantity, occupancy, draft, nowIso),
    [asset.quantity, occupancy, draft, nowIso],
  )
  const short = remaining !== null && Number(draft.quantity || '0') > remaining
  // 지금 당장은 비어 있지 않아 앞당겨 잡아 둔 자리인가 — 안내 문구가 이 사실을 먼저 말한다.
  const deferred = earliest > now

  const change = (next: CheckoutDraft) => {
    setDraft(next)
    if (error) setError(null)
  }

  // ── 날짜·시각 두 칸 ──────────────────────────────────────────────────
  const earliestParts = splitLocal(earliest)
  const checkoutParts = splitLocal(draft.checkoutAt)
  const dueParts = splitLocal(draft.dueAt)
  /** 지금 담고 있는 값이 후보에 없으면 끼워 넣는다 — 셀렉트가 빈 칸으로 보이지 않게. */
  const withCurrent = (options: string[], v: string) =>
    !v || options.includes(v) ? options : [...options, v].sort()
  const checkoutTimes = withCurrent(
    timeOptions(checkoutParts.date, earliest),
    checkoutParts.time,
  )
  const dueTimes = withCurrent(
    timeOptions(dueParts.date, draft.checkoutAt, true),
    dueParts.time,
  )

  /** 반출 일시를 바꾼다. 날짜를 옮겨 고를 수 없는 시각이 되면 그 날의 첫 후보로 끌어당긴다. */
  const setCheckout = (date: string, time: string) => {
    const options = timeOptions(date, earliest)
    const next = joinLocal(date, options.includes(time) ? time : (options[0] ?? ''))
    change({
      ...draft,
      checkoutAt: next,
      // 아직 손대지 않은 반납 예정은 함께 따라간다(하루 뒤 유지).
      dueAt:
        draft.dueAt === defaultDueAt(draft.checkoutAt) ? defaultDueAt(next) : draft.dueAt,
    })
  }

  const setDue = (date: string, time: string) => {
    const options = timeOptions(date, draft.checkoutAt, true)
    change({ ...draft, dueAt: joinLocal(date, options.includes(time) ? time : (options[0] ?? '')) })
  }

  const submit = () => {
    const found = validateCheckoutDraft(draft, earliest)
    if (found) return setError(found)
    onSubmit(toCheckoutInput(draft))
  }

  const invalid = (field: keyof CheckoutDraft) => error?.field === field

  return (
    <div className="space-y-4">
      {asset.requiresApproval && (
        <Banner tone="info">
          승인이 필요한 물품입니다. 등록하면 <b>승인 대기</b> 상태가 되며, 자산 담당자가 승인해야
          반출할 수 있습니다.
        </Banner>
      )}

      {unreturned.map((c) => {
        const late = overdueMs(c, new Date().toISOString())
        return (
          <Banner key={c.id} tone="warning">
            아직 반납되지 않은 반출이 있습니다 — {c.createdByName ?? '반출자'}, 반납 예정{' '}
            {formatDateTime(c.dueAt)}
            {late > 0 && ` (${elapsedLabel(late)})`}
          </Banner>
        )
      })}

      {/*
        잔여가 0이어도 예약은 연다 — 막는 대신 언제부터 비는지를 알린다. 한 개짜리 물건에서
        "지금 없음"을 "예약 불가"로 읽으면 먼저 가져간 사람이 반납할 때까지 아무도 줄을 설 수
        없고, 그러면 대장이 순서를 관리하는 일을 그만두게 된다.
      */}
      {deferred && (
        <Banner tone="info">
          지금은 잔여가 없어 <b>{earliest.replace('T', ' ')}</b>부터 잡을 수 있습니다. 그 전
          시각은 고를 수 없습니다.
        </Banner>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {/*
          Input·Select는 스스로를 감싸는 상자가 `w-full`이라, 폭은 바깥에서 정해 준다
          (컴포넌트에 className을 주면 안쪽 컨트롤에만 붙어 상자는 그대로 늘어난다).
        */}
        <Field label="반출 일시" required>
          <div className="flex gap-2">
            <div className="min-w-0 flex-1">
              <Input
                type="date"
                value={checkoutParts.date}
                min={earliestParts.date}
                invalid={invalid('checkoutAt')}
                onChange={(e) => setCheckout(e.target.value, checkoutParts.time)}
              />
            </div>
            <div className="w-24 shrink-0">
              <Select
                value={checkoutParts.time}
                invalid={invalid('checkoutAt')}
                onChange={(e) => setCheckout(checkoutParts.date, e.target.value)}
              >
                {checkoutTimes.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </Select>
            </div>
          </div>
        </Field>
        <Field label="반납 예정 일시" required>
          <div className="flex gap-2">
            <div className="min-w-0 flex-1">
              <Input
                type="date"
                value={dueParts.date}
                min={checkoutParts.date || earliestParts.date}
                invalid={invalid('dueAt')}
                onChange={(e) => setDue(e.target.value, dueParts.time)}
              />
            </div>
            <div className="w-24 shrink-0">
              <Select
                value={dueParts.time}
                invalid={invalid('dueAt')}
                onChange={(e) => setDue(dueParts.date, e.target.value)}
              >
                {dueTimes.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </Select>
            </div>
          </div>
        </Field>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field
          label="수량"
          required
          hint={
            remaining === null
              ? `보유 ${asset.quantity}개.`
              : `이 기간 잔여 ${remaining}개 / 보유 ${asset.quantity}개.`
          }
        >
          <Input
            value={draft.quantity}
            invalid={invalid('quantity') || short}
            inputMode="numeric"
            onChange={(e) =>
              change({ ...draft, quantity: e.target.value.replace(/[^\d]/g, '') })
            }
            placeholder="1"
          />
        </Field>
        <div />
      </div>

      {/*
        기간이 겹친다고 곧바로 막지 않는다 — 다섯 개 중 두 개가 나가 있어도 세 개는 빌릴 수
        있기 때문이다. 겹치는 건은 누가 잡고 있는지 알려 주는 정보로 두고, 경고는 요청한
        개수가 잔여를 넘을 때만 낸다.
      */}
      {short && (
        <Banner tone="danger">
          이 기간 잔여는 {remaining}개인데 {draft.quantity}개를 요청했습니다.
        </Banner>
      )}
      {conflicts.length > 0 && (
        <Banner tone="info">
          {conflicts.map((c) => (
            <span key={c.id} className="block">
              {formatDateTime(c.checkoutAt)} ~ {formatDateTime(c.dueAt)} · {c.quantity}개{' '}
              {CHECKOUT_LABELS[c.status]}({c.createdByName ?? '반출자'})
            </span>
          ))}
        </Banner>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="목적" required>
          <Input
            value={draft.purpose}
            invalid={invalid('purpose')}
            onChange={(e) => change({ ...draft, purpose: e.target.value })}
            placeholder="예: 데모데이 현장 촬영"
            autoFocus
          />
        </Field>
        <Field label="행선지">
          <Input
            value={draft.destination}
            onChange={(e) => change({ ...draft, destination: e.target.value })}
            placeholder="예: 코엑스 그랜드볼룸"
          />
        </Field>
      </div>

      <Field label="비고">
        <TextArea
          value={draft.note}
          rows={2}
          onChange={(e) => change({ ...draft, note: e.target.value })}
          placeholder="예: 삼각대·여분 배터리 함께 반출"
        />
      </Field>

      {error && <p className="text-caption text-danger">{error.message}</p>}

      {/*
        뒤로는 outline이다 — 이 버튼은 모달 푸터가 아니라 본문(흰 바탕) 위에 서 있어서,
        ghost(테두리·배경 없음)로 두면 글자만 떠 있고 누를 수 있는 영역이 보이지 않는다.
        같은 '취소' 성격이라도 회색 바탕의 푸터에 있을 때와 판단이 갈린다.
      */}
      <div className="flex justify-end gap-2 border-t border-gray-200 pt-3">
        <Button variant="outline" onClick={onCancel} disabled={busy}>
          뒤로
        </Button>
        {/*
          고를 수 있는 시각이 모두 지금 이후이므로 등록은 언제나 예약이다 — '지금 가져감'도
          "지금부터 잡는 예약"일 뿐이라, 버튼도 목록의 '+ 예약하기'와 같은 말을 쓴다.
        */}
        <Button onClick={submit} disabled={busy || short}>
          {busy ? '저장 중…' : asset.requiresApproval ? '승인 요청' : '예약 등록'}
        </Button>
      </div>
    </div>
  )
}
