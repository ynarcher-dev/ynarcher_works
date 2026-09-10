import { Button, Modal, Radio, TextArea, useToast } from '@ynarcher/ui'
import { useState } from 'react'
import { useDecideApproval } from '@/features/approval/approvalApi'
import { LINE_KIND_LABEL, type ApprovalLineKind } from '@/features/approval/config'

export type ApprovalDecision = 'APPROVED' | 'REVISION_REQUESTED' | 'REJECTED'

interface ApprovalDecideModalProps {
  open: boolean
  onClose: () => void
  documentId: string
  /** 지금 처리해야 할 내 결재선 행. */
  lineId: string
  /** 내 자리의 구분(결재·합의·재무합의). */
  kind: ApprovalLineKind
  /** 내가 마지막 한 표인가(승인 시 문서가 최종 승인으로 끝난다). */
  isFinal: boolean
}

/**
 * 결재 처리 창 — 승인·보완 요청·반려 세 결과 중 하나를 고른다.
 *
 * 반려 안에 돌아갈 순번을 두던 구조는 폐기했다. 반려는 이 문서를 끝내는 판단이고,
 * 고쳐서 같은 결재선을 이어갈 필요가 있을 때는 보완 요청을 고른다. 보완 요청은 문서를
 * 현재 자리에서 멈추고 기안자에게 수정 권한을 열며, 재상신 뒤에는 이 자리부터 미처리
 * 결재가 이어진다. 둘은 다음 행동이 완전히 다르므로 별도 선택지여야 한다.
 *
 * 보완·반려 사유는 기안자의 다음 판단 근거라 필수다. 서버 RPC도 같은 조건을 강제한다.
 */
export function ApprovalDecideModal({
  open,
  onClose,
  documentId,
  lineId,
  kind,
  isFinal,
}: ApprovalDecideModalProps) {
  const toast = useToast()
  const decide = useDecideApproval()
  const [decision, setDecision] = useState<ApprovalDecision>('APPROVED')
  const [comment, setComment] = useState('')
  const kindLabel = LINE_KIND_LABEL[kind]

  const close = () => {
    setDecision('APPROVED')
    setComment('')
    onClose()
  }

  const summary = (): string => {
    if (decision === 'APPROVED') {
      return isFinal
        ? '승인하시겠습니까? 남은 처리가 이것뿐이라 문서가 완료됩니다.'
        : '승인하면 다음 순번으로 결재가 이어집니다.'
    }
    if (decision === 'REVISION_REQUESTED') {
      return '현재 결재 자리에서 문서를 멈춥니다. 기안자가 보완 후 재상신하면 이 자리부터 결재가 이어집니다.'
    }
    return '문서를 반려하고 결재를 종료합니다. 반려된 문서는 수정하거나 재상신할 수 없습니다.'
  }

  const submit = async () => {
    if (decision !== 'APPROVED' && !comment.trim()) {
      toast.show(`${decision === 'REJECTED' ? '반려' : '보완'} 사유를 입력하세요.`, 'warning')
      return
    }
    try {
      await decide.mutateAsync({
        lineId,
        documentId,
        decision,
        comment,
      })
      toast.show(
        decision === 'APPROVED'
          ? '승인했습니다.'
          : decision === 'REVISION_REQUESTED'
            ? '보완을 요청했습니다.'
            : '반려했습니다.',
        'success',
      )
      close()
    } catch {
      toast.show('처리에 실패했습니다. 권한과 현재 결재 상태를 확인하세요.', 'danger')
    }
  }

  return (
    <Modal
      dismissible={false}
      open={open}
      onClose={close}
      title={kindLabel}
      size="sm"
      footer={
        <>
          <Button variant="outline" onClick={close} disabled={decide.isPending}>
            취소
          </Button>
          <Button onClick={() => void submit()} disabled={decide.isPending}>
            확인
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
          <Radio
            name="approval-decision"
            label="승인"
            checked={decision === 'APPROVED'}
            onChange={() => setDecision('APPROVED')}
          />
          <Radio
            name="approval-decision"
            label="보완 요청"
            checked={decision === 'REVISION_REQUESTED'}
            onChange={() => setDecision('REVISION_REQUESTED')}
          />
          <Radio
            name="approval-decision"
            label="반려"
            checked={decision === 'REJECTED'}
            onChange={() => setDecision('REJECTED')}
          />
        </div>

        <p className="text-body-sm text-gray-700">{summary()}</p>

        <TextArea
          rows={3}
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder={decision === 'APPROVED' ? '의견을 입력하세요.' : '사유를 입력하세요. (필수)'}
        />
      </div>
    </Modal>
  )
}
