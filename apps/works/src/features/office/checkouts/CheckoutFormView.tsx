import { Banner, Button, Input, TextArea } from '@ynarcher/ui'
import { useMemo, useState, type ReactNode } from 'react'
import {
  CHECKOUT_LABELS,
  elapsedLabel,
  formatDateTime,
  nowLocalInput,
  overdueMs,
} from '@/features/office/checkouts/checkoutConfig'
import {
  conflictingCheckouts,
  defaultDueAt,
  emptyCheckoutDraft,
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

function Field({
  label,
  required,
  hint,
  children,
}: {
  label: string
  required?: boolean
  hint?: string
  children: ReactNode
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-caption font-medium text-gray-600">
        {label}
        {required && <span className="ml-0.5 text-danger">*</span>}
      </span>
      {children}
      {hint && <span className="mt-1 block text-caption text-gray-500">{hint}</span>}
    </label>
  )
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
  const [draft, setDraft] = useState<CheckoutDraft>(() => emptyCheckoutDraft(asset.id))
  const [error, setError] = useState<CheckoutFormError | null>(null)

  const conflicts = useMemo(() => conflictingCheckouts(draft, occupancy), [draft, occupancy])
  const unreturned = useMemo(() => unreturnedCheckouts(occupancy), [occupancy])
  const now = nowLocalInput()

  const change = (next: CheckoutDraft) => {
    setDraft(next)
    if (error) setError(null)
  }

  const submit = () => {
    const found = validateCheckoutDraft(draft)
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

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="반출 일시" required hint="지금 가져가면 그대로 두세요.">
          <Input
            type="datetime-local"
            value={draft.checkoutAt}
            invalid={invalid('checkoutAt')}
            onChange={(e) =>
              // 시작을 바꾸면 아직 손대지 않은 반납 예정은 함께 따라간다(하루 뒤 유지).
              change({
                ...draft,
                checkoutAt: e.target.value,
                dueAt:
                  draft.dueAt === defaultDueAt(draft.checkoutAt)
                    ? defaultDueAt(e.target.value)
                    : draft.dueAt,
              })
            }
          />
        </Field>
        <Field
          label="반납 예정 일시"
          required
          hint="이때까지 다른 사람이 이 물건을 잡을 수 없습니다."
        >
          <Input
            type="datetime-local"
            value={draft.dueAt}
            min={draft.checkoutAt || now}
            invalid={invalid('dueAt')}
            onChange={(e) => change({ ...draft, dueAt: e.target.value })}
          />
        </Field>
      </div>

      {conflicts.length > 0 && (
        <Banner tone="danger">
          {conflicts.map((c) => (
            <span key={c.id} className="block">
              {formatDateTime(c.checkoutAt)} ~ {formatDateTime(c.dueAt)}에 이미{' '}
              {CHECKOUT_LABELS[c.status]} 건이 있습니다({c.createdByName ?? '반출자'}).
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

      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onCancel} disabled={busy}>
          뒤로
        </Button>
        <Button onClick={submit} disabled={busy}>
          {busy ? '저장 중…' : asset.requiresApproval ? '승인 요청' : '반출 등록'}
        </Button>
      </div>
    </div>
  )
}
