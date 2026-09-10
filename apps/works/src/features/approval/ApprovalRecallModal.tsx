import { Button, Modal, TextArea, useToast } from '@ynarcher/ui'
import { useState } from 'react'
import { useRecallApproval } from '@/features/approval/approvalApi'
import type { ApprovalRecallAction } from '@/features/approval/approvalRecall'

interface ApprovalRecallModalProps {
  open: boolean
  onClose: () => void
  documentId: string
  lineId: string
  action: ApprovalRecallAction
}

export function ApprovalRecallModal({
  open,
  onClose,
  documentId,
  lineId,
  action,
}: ApprovalRecallModalProps) {
  const toast = useToast()
  const recall = useRecallApproval()
  const [reason, setReason] = useState('')
  const resetting = action === 'RESET'

  const close = () => {
    setReason('')
    onClose()
  }

  const submit = async () => {
    if (resetting && !reason.trim()) {
      toast.show('기안자에게 전달할 초기화 사유를 입력하세요.', 'warning')
      return
    }
    try {
      const result = await recall.mutateAsync({ documentId, lineId, reason })
      toast.show(
        result === 'RESET'
          ? '결재를 초기화하고 기안자에게 반려했습니다.'
          : '승인을 취소했습니다.',
        'success',
      )
      close()
    } catch {
      toast.show('처리할 수 없습니다. 이후 결재가 진행됐는지 확인하세요.', 'danger')
    }
  }

  return (
    <Modal
      dismissible={false}
      open={open}
      onClose={close}
      title={resetting ? '결재 초기화' : '승인 취소'}
      size="sm"
      footer={
        <>
          <Button variant="outline" onClick={close} disabled={recall.isPending}>
            닫기
          </Button>
          <Button
            variant={resetting ? 'danger' : 'primary'}
            onClick={() => void submit()}
            disabled={recall.isPending}
          >
            {resetting ? '초기화 후 반려' : '승인 취소'}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <p className="text-body-sm text-gray-700">
          {resetting
            ? '완료된 회차는 이력으로 보존됩니다. 전체 결재선을 새 회차로 초기화하고 문서를 최초 기안자에게 반려합니다.'
            : '본인 승인을 취소하면 문서는 다시 본인 결재 대기 상태가 됩니다.'}
        </p>
        <TextArea
          rows={3}
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          placeholder={resetting ? '초기화 사유를 입력하세요. (필수)' : '취소 사유를 입력하세요.'}
        />
      </div>
    </Modal>
  )
}
