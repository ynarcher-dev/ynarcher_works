import { Button, Input, Modal, TextArea } from '@ynarcher/ui'
import { useEffect, useState } from 'react'
import { formatDateTime, nowLocalInput } from '@/features/office/checkouts/checkoutConfig'
import type { Checkout } from '@/features/office/checkouts/checkoutsApi'

/** 한 마디를 더 받아야 하는 처리 둘. 나머지(승인·반출 시작·취소)는 확인만 받고 바로 보낸다. */
export type PromptAction = 'REJECT' | 'RETURN'

interface CheckoutActionModalProps {
  open: boolean
  action: PromptAction
  row: Checkout | null
  busy: boolean
  onClose: () => void
  /** returnedAt은 로컬 입력 표기 그대로 넘긴다(ISO 변환은 호출부가 한다). */
  onConfirm: (v: { returnedAt: string; note: string }) => void
}

/**
 * 반려·반납 처리 모달.
 *
 * 반려는 사유가 있어야 한다 — 거절만 남으면 요청한 사람은 무엇을 고쳐 다시 올려야 할지 모른다.
 * 반납은 실제로 돌아온 일시를 받는다(지금이 기본). 예정과 다른 때가 흔하고, 그 차이가 곧
 * 이 대장이 남기려는 사실이다.
 */
export function CheckoutActionModal({
  open,
  action,
  row,
  busy,
  onClose,
  onConfirm,
}: CheckoutActionModalProps) {
  const [returnedAt, setReturnedAt] = useState(() => nowLocalInput())
  const [note, setNote] = useState('')

  useEffect(() => {
    if (!open) return
    setReturnedAt(nowLocalInput())
    setNote('')
  }, [open, row?.id])

  if (!row) return null

  const returning = action === 'RETURN'
  /*
   * 반납은 언제든 받는다 — 반출 시각보다 앞선 값도 막지 않는다.
   *
   * 종전에는 여기서 막았다. 그런데 예약보다 일찍 가져간 건(약속 시각이 아직 미래인 채로
   * 반출 중이 된 건)은 반납하려는 순간마다 이 문에 걸렸다. 물건은 이미 손에 있고 돌아왔는데
   * 화면이 "돌아올 수 없다"고 우기는 자리였다.
   *
   * 어긋난 값이 오면 서버가 나간 시각을 돌아온 시각까지 당겨 맞춘다
   * (app.validate_asset_checkout_transition). 확실히 아는 것은 돌아왔다는 사실이므로,
   * 사람을 세워 두고 고치게 하는 대신 원장이 그 사실 쪽으로 따라간다.
   */
  const blocked = busy || (returning ? !returnedAt : !note.trim())

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={returning ? `반납 처리: ${row.assetName}` : `반려: ${row.assetName}`}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            취소
          </Button>
          <Button onClick={() => onConfirm({ returnedAt, note })} disabled={blocked}>
            {busy ? '처리 중…' : returning ? '반납 완료' : '반려'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {returning && (
          <label className="block">
            <span className="mb-1 block text-caption font-medium text-gray-600">
              실제 반납 일시<span className="ml-0.5 text-danger">*</span>
            </span>
            <Input
              type="datetime-local"
              value={returnedAt}
              onChange={(e) => setReturnedAt(e.target.value)}
            />
            <span className="mt-1 block text-caption text-gray-500">
              반출 {formatDateTime(row.checkoutAt)}
            </span>
          </label>
        )}

        <label className="block">
          <span className="mb-1 block text-caption font-medium text-gray-600">
            {returning ? '반납 메모' : '반려 사유'}
            {!returning && <span className="ml-0.5 text-danger">*</span>}
          </span>
          <TextArea
            value={note}
            rows={3}
            onChange={(e) => setNote(e.target.value)}
            placeholder={
              returning ? '예: 삼각대 다리 하나 파손' : '예: 같은 기간에 사내 행사 사용 예정'
            }
            autoFocus
          />
        </label>
      </div>
    </Modal>
  )
}
