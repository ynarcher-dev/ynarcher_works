import { Button, Card, TextArea, useToast } from '@ynarcher/ui'
import { useState } from 'react'
import { useDecideApproval } from '@/features/approval/approvalApi'
import { LINE_KIND_LABEL, type ApprovalLineKind } from '@/features/approval/config'

interface ApprovalDecideBarProps {
  documentId: string
  /** 지금 처리해야 할 내 결재선 행. */
  lineId: string
  /** 내 자리의 구분(결재·합의·재무합의) — 버튼과 안내 문구가 이 말을 따른다. */
  kind: ApprovalLineKind
  /** 내가 마지막 한 표인가(승인 시 문서가 최종 승인으로 끝난다). */
  isFinal: boolean
}

/**
 * 결재 처리(승인·반려) — 내 차례일 때만 상세에 나타난다.
 *
 * 의견은 결재 행위에 붙는 기록이라 문서 코멘트(우측 의견 패널)와 축이 다르다. 코멘트는
 * 누구나 언제든 남기는 대화이고, 이 의견은 "왜 승인·반려했는가"로 결재선 행에 남는다.
 *
 * 반려는 되돌리기 어려우므로 확인을 한 번 받는다. 최종 판정(내 행만 갱신 가능)은 RLS가 한다.
 */
export function ApprovalDecideBar({
  documentId,
  lineId,
  kind,
  isFinal,
}: ApprovalDecideBarProps) {
  const toast = useToast()
  const decide = useDecideApproval()
  const [comment, setComment] = useState('')
  const kindLabel = LINE_KIND_LABEL[kind]

  const run = async (decision: 'APPROVED' | 'REJECTED') => {
    // 반려는 구분과 무관하게 문서 전체를 되돌린다(합의 반려도 문서가 멈춘다).
    if (decision === 'REJECTED' && !window.confirm('이 문서를 반려하시겠습니까?')) return
    try {
      await decide.mutateAsync({ lineId, documentId, decision, isFinal, comment })
      toast.show(decision === 'APPROVED' ? '승인했습니다.' : '반려했습니다.', 'success')
      setComment('')
    } catch {
      toast.show('처리에 실패했습니다. 권한을 확인하세요.', 'danger')
    }
  }

  return (
    <Card
      title={`${kindLabel} 처리`}
      subtitle={
        isFinal
          ? '남은 처리가 이것뿐입니다 — 승인하면 문서가 완료됩니다.'
          : kind === 'APPROVAL'
            ? undefined
            : '합의는 결재 순서를 기다리지 않고 지금 처리할 수 있습니다.'
      }
    >
      <div className="space-y-3">
        <TextArea
          rows={2}
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder={`${kindLabel} 의견(선택)`}
        />
        <div className="flex items-center justify-end gap-2">
          <Button
            variant="outline-danger"
            onClick={() => void run('REJECTED')}
            disabled={decide.isPending}
          >
            반려
          </Button>
          <Button onClick={() => void run('APPROVED')} disabled={decide.isPending}>
            승인
          </Button>
        </div>
      </div>
    </Card>
  )
}
