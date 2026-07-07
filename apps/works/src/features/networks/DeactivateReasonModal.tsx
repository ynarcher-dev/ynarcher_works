import { Button, Input, Modal } from '@ynarcher/ui'
import { useState } from 'react'

const MAX = 20

interface Props {
  open: boolean
  /** 비활성화 대상 이름(안내 문구용). */
  name?: string
  busy?: boolean
  onCancel: () => void
  /** 입력한 사유(공백 제거, 1~20자)를 전달한다. */
  onConfirm: (reason: string) => void
}

/** 비활성화 사유 입력 모달(20자 이내). 사유는 기여 로그에 기록된다. */
export function DeactivateReasonModal({ open, name, busy, onCancel, onConfirm }: Props) {
  const [reason, setReason] = useState('')
  const trimmed = reason.trim()
  const submit = () => {
    if (trimmed) onConfirm(trimmed)
  }
  return (
    <Modal
      open={open}
      onClose={onCancel}
      title="비활성화 사유"
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onCancel} disabled={busy}>
            취소
          </Button>
          <Button variant="danger" onClick={submit} disabled={busy || !trimmed}>
            비활성화
          </Button>
        </>
      }
    >
      <div className="space-y-2">
        <p className="text-caption text-gray-500">
          {name ? <b>{name}</b> : '이 항목'}을(를) 비활성화합니다. 사유를 20자 이내로 입력하세요.
        </p>
        <Input
          autoFocus
          value={reason}
          maxLength={MAX}
          placeholder="예: 퇴사, 중복 정리"
          onChange={(e) => setReason(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') submit()
          }}
        />
        <div className="text-right text-caption text-gray-400">
          {reason.length}/{MAX}
        </div>
      </div>
    </Modal>
  )
}
