import { Button, Modal } from '@ynarcher/ui'
import { useEffect, useState } from 'react'
import { PartnerFormFields } from '@/features/management/partners/PartnerFormFields'
import {
  draftFromPartner,
  emptyPartnerDraft,
  toPartnerInput,
  validatePartnerDraft,
  type PartnerDraft,
  type PartnerFormError,
} from '@/features/management/partners/partnerForm'
import type {
  TradePartner,
  TradePartnerInput,
} from '@/features/management/partners/partnersApi'

interface PartnerFormModalProps {
  open: boolean
  /** 있으면 수정, 없으면 등록. */
  partner?: TradePartner
  busy: boolean
  onClose: () => void
  onSubmit: (v: TradePartnerInput) => void
}

/**
 * 거래처 등록·수정 모달. 등록과 수정은 같은 폼이며 제목과 코드 칸만 갈린다.
 *
 * 푸터에 삭제를 두지 않는다 — 거래처는 지우는 것이 아니라 거래를 그만두는 것이고, 그 스위치는
 * 폼 안('사용 여부')에 있다. 전표가 가리키는 상대를 목록에서 없애면 과거 기록이 누구에게
 * 나갔는지 답할 수 없다.
 */
export function PartnerFormModal({
  open,
  partner,
  busy,
  onClose,
  onSubmit,
}: PartnerFormModalProps) {
  const editing = Boolean(partner)
  const [draft, setDraft] = useState<PartnerDraft>(() => emptyPartnerDraft())
  const [error, setError] = useState<PartnerFormError | null>(null)

  // 열릴 때마다 대상에 맞춰 초기화한다 — 닫았던 폼의 값이 다음 등록에 남으면 안 된다.
  useEffect(() => {
    if (!open) return
    setDraft(partner ? draftFromPartner(partner) : emptyPartnerDraft())
    setError(null)
  }, [open, partner])

  const change = (next: PartnerDraft) => {
    setDraft(next)
    // 고치는 중에 빨간 글씨가 남아 있으면 무엇을 고쳤는지 알 수 없다 — 값이 바뀌면 지운다.
    if (error) setError(null)
  }

  const submit = () => {
    const found = validatePartnerDraft(draft)
    if (found) return setError(found)
    onSubmit(toPartnerInput(draft))
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editing ? '거래처 수정' : '거래처 등록'}
      size="lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            취소
          </Button>
          <Button onClick={submit} disabled={busy || !draft.name.trim()}>
            {busy ? '저장 중…' : editing ? '저장' : '등록'}
          </Button>
        </>
      }
    >
      <PartnerFormFields
        draft={draft}
        onChange={change}
        partnerId={partner?.id}
        code={partner?.code}
        error={error}
      />
    </Modal>
  )
}
