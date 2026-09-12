import { DOC_STATUS_LABEL, DOC_STATUS_TONE } from '@/features/approval/config'
import { currentRound } from '@/features/approval/model'
import type { ApprovalLine } from '@/features/approval/model'
import type { ApprovalStatus } from '@/features/management/config'
import type { BadgeTone } from '@ynarcher/ui'

/**
 * 기안자 축 — 기안 취소와 기안 삭제.
 *
 * 결재자 축(`approvalRecall.ts`: 승인 취소·결재 초기화)과 파일을 나눈 이유는 판정하는 사람이
 * 다르기 때문이다. 저쪽은 "내 도장을 되돌릴 수 있나"를 결재선 한 자리로 답하고, 이쪽은
 * "이 문서를 되가져올 수 있나"를 문서 상태로 답한다.
 *
 * 같은 조건을 서버 RPC가 다시 확인한다 — 화면에서 숨기는 것은 보안이 아니다.
 */
export interface ApprovalDraftActionContext {
  status: ApprovalStatus
  drafterId: string | null
  lines: ApprovalLine[]
  /** 하이웍스 복원본. 결재선이 참여자 원장에 있어 취소·삭제 둘 다 대상이 아니다. */
  isLegacy: boolean
}

/**
 * 기안 취소 가능 여부 — 기안자 본인 + 최종 승인 전.
 *
 * 끝난 문서(APPROVED·REJECTED)는 이 축이 아니다. 최종 승인을 되돌리는 일은 마지막 승인자의
 * '결재 초기화'가 갖고, 반려는 종결이라 되돌릴 것이 없다(2026-09-10 결정).
 *
 * 보완 중(REVISION_REQUIRED)도 연다 — 이미 기안자 손에 있지만 그 문서를 **접을** 자리가
 * 없으면 보완 칸에 영영 떠 있게 된다. 취소하면 기안 단계로 내려와 삭제까지 이어진다.
 */
export function canWithdrawDraft(ctx: ApprovalDraftActionContext, uid: string | null): boolean {
  if (!uid || ctx.isLegacy || ctx.drafterId !== uid) return false
  return (
    ctx.status === 'PENDING' || ctx.status === 'IN_REVIEW' || ctx.status === 'REVISION_REQUIRED'
  )
}

/**
 * 기안 삭제 가능 여부 — 기안자 본인 + 기안 단계.
 *
 * 흐르는 중인 문서를 바로 지울 수 없는 이유는 취소가 결재선에 선 사람들에게 알림을 보내기
 * 때문이다. 먼저 취소해 되가져와야 하므로, 지우는 일이 그 통지를 건너뛰지 못한다.
 *
 * 근거 품의로 걸린 문서는 서버가 막는다(지출 문서가 이 문서를 가리킨다) — 화면이 미리 알 수
 * 없는 사실이라 여기서 판정하지 않고 삭제창이 서버 오류를 그대로 전한다.
 */
export function canDeleteDraft(ctx: ApprovalDraftActionContext, uid: string | null): boolean {
  if (!uid || ctx.isLegacy || ctx.drafterId !== uid) return false
  return ctx.status === 'DRAFT'
}

/**
 * 기안 취소로 기안 단계에 돌아온 문서인가 — 상신 이력(회차 2 이상)을 가진 임시저장이다.
 *
 * 새 상태값을 만들지 않고 회차로 판정하는 이유는 취소가 문서를 **기안 단계로 되돌리는**
 * 일이기 때문이다(사용자 확정). 회차를 쌓는 경로는 셋뿐이고 나머지 둘은 각자 다른 상태로
 * 끝난다 — 보완 재상신은 PENDING·IN_REVIEW, 최종 승인 초기화는 REJECTED. 그래서
 * `DRAFT`면서 2차 이상인 문서는 취소된 문서뿐이다.
 *
 * 한 번도 상신하지 않은 임시저장과 갈라야 하는 이유는 목록이 사실을 말해야 하기 때문이다 —
 * 결재자가 도장을 찍었던 문서가 '임시저장'으로만 서 있으면 무슨 일이 있었는지 답하지 못한다.
 */
export function isWithdrawnDraft(status: ApprovalStatus, lines: ApprovalLine[]): boolean {
  return status === 'DRAFT' && currentRound(lines) > 1
}

/** 상태 표기 — 취소된 문서만 '기안 취소'로 갈라 적고 나머지는 상태 원장이 답한다. */
export function approvalStatusLabel(status: ApprovalStatus, lines: ApprovalLine[]): string {
  return isWithdrawnDraft(status, lines) ? '기안 취소' : DOC_STATUS_LABEL[status]
}

/**
 * 상태 색 — 취소는 경고(노랑)다. 보완과 같은 **멈춤**이라 같은 색을 쓴다(2026-09-10에
 * 보완 색을 정한 근거 그대로). 반려의 빨강을 쓰지 않는 이유는 종결이 아니기 때문이고,
 * 임시저장의 회색을 쓰지 않는 이유는 손이 가야 할 문서이기 때문이다.
 */
export function approvalStatusTone(status: ApprovalStatus, lines: ApprovalLine[]): BadgeTone {
  return isWithdrawnDraft(status, lines) ? 'warning' : DOC_STATUS_TONE[status]
}
