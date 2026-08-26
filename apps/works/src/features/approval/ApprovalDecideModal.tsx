import { Button, Modal, Radio, TextArea, useToast } from '@ynarcher/ui'
import { useState } from 'react'
import { useDecideApproval } from '@/features/approval/approvalApi'
import { LINE_KIND_LABEL, type ApprovalLineKind } from '@/features/approval/config'

type Decision = 'APPROVED' | 'REJECTED'

interface ApprovalDecideModalProps {
  open: boolean
  onClose: () => void
  documentId: string
  /** 지금 처리해야 할 내 결재선 행. */
  lineId: string
  /** 내 자리의 구분(결재·합의·재무합의) — 제목과 안내 문구가 이 말을 따른다. */
  kind: ApprovalLineKind
  /** 내가 마지막 한 표인가(승인 시 문서가 최종 승인으로 끝난다). */
  isFinal: boolean
}

/**
 * 결재 처리(승인·반려) 창 — 내 차례일 때 상단 [○○ 처리] 버튼으로 연다.
 *
 * **상시로 서 있던 우측 카드에서 창으로 옮겼다**(2026-08-26, 하이웍스 방식). 결재는 문서를
 * 다 읽은 뒤 한 번 내리는 판단이라, 처리 칸이 문서 옆에 늘 펼쳐져 있으면 읽는 동안 내내
 * 승인·반려 버튼이 시야에 머문다 — 읽기 전에 누를 수 있는 자리에 있는 것 자체가 오처리를
 * 부른다. 창으로 두면 "처리하겠다"는 의사를 한 번 밝힌 사람만 그 앞에 선다.
 *
 * 승인·반려를 버튼 둘로 갈라 두지 않고 **라디오 하나로 고르게** 한다. 버튼이 둘이면 어느
 * 쪽을 누르는지가 곧 결정이라 손이 먼저 나가지만, 고른 뒤 [확인]을 누르는 흐름은 무엇을
 * 고른 상태인지 눈으로 확인하는 단계를 강제한다(하이웍스도 같은 형태다).
 *
 * 의견은 결재 행위에 붙는 기록이라 문서 코멘트(우측 의견 패널)와 축이 다르다. 코멘트는
 * 누구나 언제든 남기는 대화이고, 이 의견은 "왜 승인·반려했는가"로 결재선 행에 남는다.
 *
 * 반려는 문서 전체를 되돌리므로 한 번 더 묻는다. 최종 판정(내 행만 갱신 가능)은 RLS가 한다.
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
  const [decision, setDecision] = useState<Decision>('APPROVED')
  const [comment, setComment] = useState('')
  const kindLabel = LINE_KIND_LABEL[kind]

  const close = () => {
    // 다음에 열 때는 늘 승인이 골라진 채로 시작한다 — 앞서 반려를 골랐던 것이 남아 있으면
    // 다른 문서를 처리하러 들어온 사람이 자기가 고르지 않은 값을 확인하게 된다.
    setDecision('APPROVED')
    setComment('')
    onClose()
  }

  const submit = async () => {
    // 반려는 구분과 무관하게 문서 전체를 되돌린다(합의 반려도 문서가 멈춘다).
    if (decision === 'REJECTED' && !window.confirm('이 문서를 반려하시겠습니까?')) return
    try {
      await decide.mutateAsync({ lineId, documentId, decision, isFinal, comment })
      toast.show(decision === 'APPROVED' ? '승인했습니다.' : '반려했습니다.', 'success')
      close()
    } catch {
      toast.show('처리에 실패했습니다. 권한을 확인하세요.', 'danger')
    }
  }

  return (
    <Modal
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
        <div className="flex items-center gap-5">
          <Radio
            name="approval-decision"
            label="승인"
            checked={decision === 'APPROVED'}
            onChange={() => setDecision('APPROVED')}
          />
          <Radio
            name="approval-decision"
            label="반려"
            checked={decision === 'REJECTED'}
            onChange={() => setDecision('REJECTED')}
          />
        </div>

        {/* 고른 것이 무엇을 뜻하는지 한 줄로 되묻는다 — 마지막 한 표일 때는 이 처리로 문서가
            끝난다는 사실이 승인 여부만큼 중요하다. */}
        <p className="text-body-sm text-gray-700">
          {decision === 'REJECTED'
            ? '반려하시겠습니까? 문서가 즉시 종결됩니다.'
            : isFinal
              ? '승인하시겠습니까? 남은 처리가 이것뿐이라 문서가 완료됩니다.'
              : '승인하시겠습니까?'}
        </p>

        <TextArea
          rows={3}
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder="의견을 입력하세요."
        />
      </div>
    </Modal>
  )
}
