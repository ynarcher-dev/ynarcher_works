import { Badge, Button, Modal, cn } from '@ynarcher/ui'
import { ApprovalSeqBadge } from '@/features/approval/ApprovalSeqBadge'
import { DOC_STATUS_TONE, LINE_KIND_LABEL, approvalText } from '@/features/approval/config'
import type { ApprovalLineKind } from '@/features/approval/config'

export interface ApprovalCommentView {
  kind: ApprovalLineKind
  /** 자기 구분 안에서의 순번(결재선 표에 선 배지와 같은 숫자). */
  seq: number
  name: string
  title: string
  decision: 'APPROVED' | 'REJECTED'
  decidedAt: string | null
  comment: string
}

interface ApprovalCommentModalProps {
  /** 열 의견. null이면 창을 세우지 않는다. */
  view: ApprovalCommentView | null
  onClose: () => void
}

/**
 * 결재 의견 창 — 도장 한 칸에 남은 "왜 이렇게 처리했는가"를 읽는다.
 *
 * **본문 아래 카드 섹션에서 창으로 옮겼다**(2026-08-26). 의견은 문서를 읽는 내내 필요한 것이
 * 아니라 특정 도장을 보고 "이 사람은 왜?"라고 물을 때만 필요하다. 카드로 상시 펼쳐 두면
 * 본문과 의견 사이가 멀어져(스크롤 끝에 있다) 정작 물음이 생긴 자리에서는 답이 보이지 않고,
 * 의견이 없는 문서에서는 그 자리가 통째로 사라져 화면 구성이 문서마다 달라진다.
 *
 * 그래서 **답을 물음이 생긴 자리에 붙였다** — 결재선 표의 도장을 누르면 그 도장의 의견이 뜬다.
 * 특히 반려는 사유가 곧 다음에 할 일이라, 반려 도장 옆에서 바로 열리는 편이 맞다.
 *
 * 창은 **누른 한 칸의 의견만** 보인다. 모든 의견을 한 창에 모으면 어느 도장을 눌러도 같은
 * 것이 뜨게 되어, 도장을 눌렀다는 사실이 뜻을 잃는다(전체를 훑는 일은 도장마다 붙은 말풍선
 * 표식이 어느 칸에 말이 남았는지 한눈에 알려주는 것으로 갈음한다).
 */
export function ApprovalCommentModal({ view, onClose }: ApprovalCommentModalProps) {
  if (!view) return null

  return (
    <Modal
      open
      onClose={onClose}
      title="결재 의견"
      size="sm"
      footer={<Button onClick={onClose}>닫기</Button>}
    >
      <div className="space-y-3">
        {/* 누구의 어느 처리인지 — 결재선 표에서 누른 칸과 같은 말(구분·순번 배지)로 적는다.
            다른 이름으로 적으면 방금 누른 칸이 이 칸인지 확인할 길이 없다. */}
        <div className="flex flex-wrap items-center gap-2">
          <ApprovalSeqBadge seq={view.seq} />
          <span className={approvalText.head}>{LINE_KIND_LABEL[view.kind]}</span>
          <span className={approvalText.primary}>{view.name}</span>
          {view.title && <span className={approvalText.meta}>{view.title}</span>}
          <Badge tone={DOC_STATUS_TONE[view.decision]}>
            {view.decision === 'APPROVED' ? '승인' : '반려'}
          </Badge>
          {view.decidedAt && (
            <span className={cn('ml-auto tabular-nums', approvalText.meta)}>
              {view.decidedAt.slice(0, 10)}
            </span>
          )}
        </div>

        {/* 사람이 쓴 문장이라 줄바꿈을 그대로 살린다. 면을 깔아 위의 머리 줄과 갈라 둔다 —
            둘 다 같은 크기라 색·면이 없으면 어디부터가 그 사람의 말인지 경계가 서지 않는다. */}
        <p
          className={cn(
            'whitespace-pre-wrap rounded-radius-md bg-gray-25 p-3',
            approvalText.body,
          )}
        >
          {view.comment}
        </p>
      </div>
    </Modal>
  )
}
