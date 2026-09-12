import { Button } from '@ynarcher/ui'
import { useState } from 'react'
import { ApprovalDeleteModal } from '@/features/approval/ApprovalDeleteModal'
import { ApprovalRecallModal } from '@/features/approval/ApprovalRecallModal'
import { ApprovalWithdrawModal } from '@/features/approval/ApprovalWithdrawModal'
import type { ApprovalDetail } from '@/features/approval/approvalApi'
import {
  canDeleteDraft,
  canWithdrawDraft,
  isWithdrawnDraft,
} from '@/features/approval/approvalDraftActions'
import { approvalRecallActionFor, isFinalApprovalReset } from '@/features/approval/approvalRecall'
import { livingLines } from '@/features/approval/model'

interface ApprovalDetailActionsProps {
  doc: ApprovalDetail
  uid: string | null
  /** 임시저장·보완 문서를 고치러 간다(기안 화면 재사용). */
  onEdit?: (id: string) => void
  /** 문서가 사라진 뒤 갈 곳. 상세에 머무를 수 없다. */
  onDeleted: () => void
  /** 결재 처리 창을 연다. 상태는 상세가 갖는다 — 결재선 표의 내 칸도 같은 창을 연다. */
  onDecide: () => void
  /** 지금 내 차례인 구분의 이름(`결재`·`합의`·`재무합의`). 내 차례가 아니면 null. */
  decideKindLabel: string | null
}

/**
 * 상세 상단의 동작 묶음 — 두 축이 나란히 선다.
 *
 * **기안자 축**(수정 · 기안 취소 · 기안 삭제)과 **결재자 축**(승인 취소 · 결재 초기화 ·
 * ○○ 처리)이다. 한 사람이 둘 다 가질 수는 없다 — 기안자는 자기 문서의 결재선에 서지
 * 않으므로, 화면에 실제로 서는 것은 언제나 한 축이다.
 *
 * 상세 본문에서 꺼낸 이유는 파일 길이가 아니라 **판정이 모이는 자리**가 필요했기 때문이다.
 * 버튼이 여섯이 되면서 "이 문서에서 내가 할 수 있는 일"이 상세 본문 중간에 흩어졌고, 그
 * 판정들은 서로를 배제하는 관계라 한 자리에서 읽혀야 한다.
 */
export function ApprovalDetailActions({
  doc,
  uid,
  onEdit,
  onDeleted,
  onDecide,
  decideKindLabel,
}: ApprovalDetailActionsProps) {
  const [withdrawing, setWithdrawing] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [recalling, setRecalling] = useState(false)

  const lines = doc.approval_lines
  const draftCtx = {
    status: doc.status,
    drafterId: doc.drafter_id,
    lines,
    isLegacy: Boolean(doc.legacy),
  }
  const finalApprovalReset = isFinalApprovalReset(doc.status, lines)
  const recallAction = uid ? approvalRecallActionFor(doc.status, lines, uid) : null
  // 기안자가 고칠 수 있는 문서는 셋이다 — 임시저장(기안 취소로 돌아온 것 포함), 보완 요청,
  // 그리고 최종 승인 초기화로 반려된 문서. 반려는 종결이라 열지 않는다.
  const canEdit =
    Boolean(onEdit) &&
    doc.drafter_id === uid &&
    (doc.status === 'DRAFT' || doc.status === 'REVISION_REQUIRED' || finalApprovalReset)
  const canWithdraw = canWithdrawDraft(draftCtx, uid)
  const canDelete = canDeleteDraft(draftCtx, uid)
  // 취소창이 "무효가 되는 결재 n건"을 말하려면 현재 회차의 처리된 도장 수가 필요하다.
  const stampedCount = livingLines(lines).filter((l) => l.decision !== 'PENDING').length
  const editLabel = doc.status === 'DRAFT' ? '수정' : '보완 후 재상신'

  return (
    <>
      {/* 기안자 본인이 고칠 수 있는 문서만 [수정]이 선다. 흐르는 중인 문서는 이미 찍힌 도장이
          무엇에 대한 것인지 흐려지므로 먼저 [기안 취소]로 되가져와야 한다.
          (같은 조건을 서버 RPC가 다시 확인한다 — 화면에서 숨기는 것은 보안이 아니다.) */}
      {canEdit && (
        <Button variant="outline" onClick={() => onEdit?.(doc.id)}>
          {editLabel}
        </Button>
      )}
      {/* 기안 취소는 되돌릴 수 있는 일이라 outline이고, 삭제는 되돌릴 수 없어 danger다. */}
      {canWithdraw && (
        <Button variant="outline-danger" onClick={() => setWithdrawing(true)}>
          기안 취소
        </Button>
      )}
      {canDelete && (
        <Button variant="outline-danger" onClick={() => setDeleting(true)}>
          기안 삭제
        </Button>
      )}
      {recallAction && (
        <Button
          variant={recallAction.action === 'RESET' ? 'outline-danger' : 'outline'}
          onClick={() => setRecalling(true)}
        >
          {recallAction.action === 'RESET' ? '결재 초기화' : '승인 취소'}
        </Button>
      )}
      {/* 결재 처리는 창으로 연다 — 승인·반려 버튼이 문서 옆에 상시로 서 있으면 다 읽기
          전에 손이 먼저 나간다. 이 버튼은 "처리하겠다"는 의사를 밝히는 자리다. */}
      {decideKindLabel && <Button onClick={onDecide}>{decideKindLabel} 처리</Button>}

      {canWithdraw && (
        <ApprovalWithdrawModal
          open={withdrawing}
          onClose={() => setWithdrawing(false)}
          documentId={doc.id}
          stampedCount={stampedCount}
        />
      )}
      {canDelete && (
        <ApprovalDeleteModal
          open={deleting}
          onClose={() => setDeleting(false)}
          onDeleted={onDeleted}
          documentId={doc.id}
          title={doc.title}
          docNo={doc.doc_no}
          hadSubmission={isWithdrawnDraft(doc.status, lines) || Boolean(doc.doc_no)}
        />
      )}
      {recallAction && (
        <ApprovalRecallModal
          open={recalling}
          onClose={() => setRecalling(false)}
          documentId={doc.id}
          lineId={recallAction.lineId}
          action={recallAction.action}
        />
      )}
    </>
  )
}
