import { Button, Input, Modal } from '@ynarcher/ui'
import { useState } from 'react'

const MAX = 30

interface Props {
  open: boolean
  /** 비활성화 대상 이름(안내 문구용). */
  name?: string
  busy?: boolean
  /**
   * 동작 문구(기본 '비활성화'). 리스트의 비활성화와 상세 페이지의 '삭제'가 같은 소프트 삭제
   * 흐름을 공유하되 버튼·안내 문구만 다르게 낼 수 있게 한다.
   */
  verb?: string
  onCancel: () => void
  /** 입력한 사유(공백 제거, 1~20자)를 전달한다. */
  onConfirm: (reason: string) => void
}

/** 비활성화/삭제 사유 입력 모달(30자 이내). 사유는 기여 로그에 기록된다. */
export function DeactivateReasonModal({ open, name, busy, verb = '비활성화', onCancel, onConfirm }: Props) {
  const [reason, setReason] = useState('')
  const trimmed = reason.trim()
  const submit = () => {
    if (trimmed) onConfirm(trimmed)
  }
  return (
    <Modal
      open={open}
      onClose={onCancel}
      title={`${verb} 사유`}
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onCancel} disabled={busy}>
            취소
          </Button>
          <Button variant="danger" onClick={submit} disabled={busy || !trimmed}>
            {verb}
          </Button>
        </>
      }
    >
      <div className="space-y-2">
        <p className="text-caption text-gray-600">
          {name ? <b>{name}</b> : '이 항목'}을(를) {verb}합니다. 사유를 30자 이내로 입력하세요.
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
        <div className="text-right text-caption text-gray-600">
          {reason.length}/{MAX}
        </div>
      </div>
    </Modal>
  )
}
