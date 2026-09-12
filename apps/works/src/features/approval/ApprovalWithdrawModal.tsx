import { Button, Modal, TextArea, useToast } from '@ynarcher/ui'
import { useState } from 'react'
import { useWithdrawApproval } from '@/features/approval/approvalDraftApi'

interface ApprovalWithdrawModalProps {
  open: boolean
  onClose: () => void
  documentId: string
  /** 현재 회차에서 이미 처리된 도장 수. 0이면 아직 아무도 손대지 않은 문서다. */
  stampedCount: number
}

/**
 * 기안 취소 확인창 — 문서를 기안 단계로 되가져온다.
 *
 * 따라쓰기를 요구하지 않는 이유는 **되돌릴 수 있는 일**이기 때문이다. 취소한 문서는
 * 기안함에 그대로 있고 고쳐서 다시 올릴 수 있다. 되돌릴 수 없는 것은 그 다음 단계의
 * 기안 삭제이고, 따라쓰기는 거기 있다.
 *
 * 사유는 필수다 — 결재선에 선 사람들에게 알림이 가고, 이미 도장을 찍은 사람은 왜 자기 판단이
 * 무효가 됐는지 알아야 한다(반려·보완 요청이 사유를 필수로 받는 것과 같은 근거). 서버도
 * 빈 사유를 거절한다.
 */
export function ApprovalWithdrawModal({
  open,
  onClose,
  documentId,
  stampedCount,
}: ApprovalWithdrawModalProps) {
  const toast = useToast()
  const withdraw = useWithdrawApproval()
  const [reason, setReason] = useState('')

  const close = () => {
    setReason('')
    onClose()
  }

  const submit = async () => {
    if (!reason.trim()) {
      toast.show('결재선에 전달할 취소 사유를 입력하세요.', 'warning')
      return
    }
    try {
      await withdraw.mutateAsync({ documentId, reason })
      toast.show('기안을 취소했습니다. 문서가 기안 단계로 돌아왔습니다.', 'success')
      close()
    } catch {
      toast.show('취소할 수 없습니다. 이미 최종 승인되었는지 확인하세요.', 'danger')
    }
  }

  return (
    <Modal
      dismissible={false}
      open={open}
      onClose={close}
      title="기안 취소"
      size="sm"
      footer={
        <>
          <Button variant="outline" onClick={close} disabled={withdraw.isPending}>
            닫기
          </Button>
          <Button variant="danger" onClick={() => void submit()} disabled={withdraw.isPending}>
            {withdraw.isPending ? '취소 중…' : '기안 취소'}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <p className="text-body text-gray-700">
          문서를 <b>기안 단계로 되돌립니다.</b> 내용을 고쳐 다시 올릴 수 있고, 접으려면 기안
          단계에서 삭제합니다.
        </p>
        {/*
          이미 받은 승인을 이어받지 않는다는 사실을 먼저 말한다 — 보완 재상신과 갈리는
          지점이라(저쪽은 기존 승인이 유지된다) 같은 줄로 읽으면 담당자가 가볍게 누른다.
        */}
        {stampedCount > 0 ? (
          <div className="rounded-radius-md border border-warning-border bg-warning-subtle px-3 py-2">
            <p className="text-body-sm text-gray-900">
              이미 처리된 결재 <b>{stampedCount}건이 무효가 됩니다.</b> 다시 올리면{' '}
              <b>처음 사람부터</b> 결재를 받습니다.
            </p>
            <p className="mt-1 text-caption text-gray-600">
              지난 회차의 도장과 의견은 이력으로 남습니다. 내용을 고칠 수 있는 문서라 앞사람의
              승인을 이어받지 않습니다.
            </p>
          </div>
        ) : (
          <p className="text-body-sm text-gray-600">
            아직 처리된 결재가 없습니다. 결재선에 선 분들에게 취소 사실이 알려집니다.
          </p>
        )}
        <label className="block">
          <span className="text-body-sm text-gray-700">
            취소 사유 <b>(필수)</b> — 결재선·참조자에게 함께 전달됩니다.
          </span>
          <TextArea
            rows={3}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="예) 품의 금액을 잘못 적어 수정 후 다시 올리겠습니다."
            className="mt-1"
            disabled={withdraw.isPending}
          />
        </label>
      </div>
    </Modal>
  )
}
