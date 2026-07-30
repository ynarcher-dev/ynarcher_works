import { Banner, Button, Input, Modal, TextArea, TokenMultiSelect } from '@ynarcher/ui'
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { CHECKOUT_LABELS, overdueDays, todayKey } from '@/features/office/checkouts/checkoutConfig'
import {
  conflictingCheckouts,
  emptyCheckoutDraft,
  toCheckoutInput,
  unreturnedCheckouts,
  validateCheckoutDraft,
  type CheckoutDraft,
  type CheckoutFormError,
} from '@/features/office/checkouts/checkoutForm'
import {
  useAssetOccupancy,
  usePortableAssets,
  type CheckoutInput,
  type PortableAsset,
} from '@/features/office/checkouts/checkoutsApi'

interface CheckoutFormModalProps {
  open: boolean
  busy: boolean
  branchNameOf: (id: string | null) => string | null
  onClose: () => void
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
 * 반출 등록 모달.
 *
 * 후보 자산은 원장이 아니라 `portable_assets` 뷰에서 온다 — 반출 가능으로 설정되지 않았거나
 * 폐기된 자산은 애초에 목록에 없다. 반출대장이 자산의 성격을 다시 판단하지 않는다는 규칙이
 * 화면에서는 "고를 수 없다"로 나타난다.
 *
 * 고른 물품의 사정(승인이 필요한가, 아직 안 돌아온 건이 있는가, 그 기간에 이미 예약이 있는가)은
 * 고르는 즉시 알린다. 저장을 눌러서야 알게 되면 날짜를 다시 고르는 일이 두 번 걸린다.
 */
export function CheckoutFormModal({
  open,
  busy,
  branchNameOf,
  onClose,
  onSubmit,
}: CheckoutFormModalProps) {
  const { data: assets } = usePortableAssets()
  const [draft, setDraft] = useState<CheckoutDraft>(() => emptyCheckoutDraft())
  const [error, setError] = useState<CheckoutFormError | null>(null)

  useEffect(() => {
    if (!open) return
    setDraft(emptyCheckoutDraft())
    setError(null)
  }, [open])

  const options = useMemo(() => assets ?? [], [assets])
  const chosen = useMemo(
    () => options.find((a) => a.id === draft.assetId),
    [options, draft.assetId],
  )
  const { data: occupancy } = useAssetOccupancy(draft.assetId || undefined)

  const conflicts = useMemo(
    () => conflictingCheckouts(draft, occupancy ?? []),
    [draft, occupancy],
  )
  const unreturned = useMemo(() => unreturnedCheckouts(occupancy ?? []), [occupancy])
  const today = todayKey()

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
    <Modal
      open={open}
      onClose={onClose}
      title="반출 등록"
      size="lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            취소
          </Button>
          {/* 승인이 필요한 물건이면 버튼 문구가 먼저 말한다 — 눌러 보고 나서 알게 하지 않는다. */}
          <Button onClick={submit} disabled={busy}>
            {busy ? '저장 중…' : chosen?.requiresApproval ? '승인 요청' : '등록'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="물품" required hint="반출 가능으로 설정된 자산만 고를 수 있습니다.">
          <TokenMultiSelect<PortableAsset>
            selected={chosen ? [chosen] : []}
            onChange={(next) => change({ ...draft, assetId: next.slice(-1)[0]?.id ?? '' })}
            options={options}
            getKey={(a) => a.id}
            getLabel={(a) => a.name}
            getMeta={(a) =>
              [a.itemType, a.serialNo, branchNameOf(a.branchId)].filter(Boolean).join(' · ') ||
              undefined
            }
            max={1}
            placeholder="물품명·시리얼로 검색"
          />
        </Field>

        {chosen?.requiresApproval && (
          <Banner tone="info">
            승인이 필요한 물품입니다. 등록하면 <b>승인 대기</b> 상태가 되며, 자산 담당자가 승인해야
            반출할 수 있습니다.
          </Banner>
        )}

        {unreturned.length > 0 && (
          <Banner tone="warning">
            {unreturned.map((c) => {
              const late = overdueDays(c, today)
              return (
                <span key={c.id} className="block">
                  아직 반납되지 않은 반출이 있습니다 — {c.createdByName ?? '반출자'}, 반납 예정{' '}
                  {c.dueOn}
                  {late > 0 && ` (${late}일 경과)`}
                </span>
              )
            })}
          </Banner>
        )}

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="반출일" required hint="오늘 가져가면 그대로 두세요.">
            <Input
              type="date"
              value={draft.checkoutOn}
              invalid={invalid('checkoutOn')}
              onChange={(e) => change({ ...draft, checkoutOn: e.target.value })}
            />
          </Field>
          <Field label="반납 예정일" required hint="이 날까지 그 물건을 다른 사람이 잡을 수 없습니다.">
            <Input
              type="date"
              value={draft.dueOn}
              invalid={invalid('dueOn')}
              onChange={(e) => change({ ...draft, dueOn: e.target.value })}
            />
          </Field>
        </div>

        {conflicts.length > 0 && (
          <Banner tone="danger">
            {conflicts.map((c) => (
              <span key={c.id} className="block">
                {c.checkoutOn} ~ {c.dueOn}에 이미 {CHECKOUT_LABELS[c.status]} 건이 있습니다(
                {c.createdByName ?? '반출자'}).
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
            rows={3}
            onChange={(e) => change({ ...draft, note: e.target.value })}
            placeholder="예: 삼각대·여분 배터리 함께 반출"
          />
        </Field>

        {error && <p className="text-caption text-danger">{error.message}</p>}
      </div>
    </Modal>
  )
}
