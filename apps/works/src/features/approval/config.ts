import { Ban, FileCheck, Files, Inbox, PenLine, Users } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { BadgeTone } from '@ynarcher/ui'
import type { ApprovalStatus } from '@/features/management/config'

/**
 * 문서함(좌패널) 키. 내 문서함은 문서에서의 나의 자리(기안·결재·참조)로,
 * 부서 문서함은 소속으로 가른다. 하이웍스의 '진행 중인 문서' 그룹은 좌패널이 아니라
 * 상단 현황 타일(ApprovalProgressKey)이 담당한다 — 2026-08-26 설계 확정.
 */
export type ApprovalBoxKey =
  | 'mine-all'
  | 'mine-drafted'
  | 'mine-approver'
  | 'mine-cc'
  | 'mine-rejected'
  | 'dept-all'

export interface ApprovalBoxGroup {
  label: string
  boxes: { key: ApprovalBoxKey; label: string; icon: LucideIcon }[]
}

export const APPROVAL_BOX_GROUPS: ApprovalBoxGroup[] = [
  {
    label: '내 문서함',
    boxes: [
      { key: 'mine-all', label: '전체', icon: Files },
      { key: 'mine-drafted', label: '기안', icon: PenLine },
      { key: 'mine-approver', label: '결재', icon: FileCheck },
      { key: 'mine-cc', label: '회람/참조', icon: Users },
      { key: 'mine-rejected', label: '반려', icon: Ban },
    ],
  },
  {
    label: '부서 문서함',
    boxes: [{ key: 'dept-all', label: '전체', icon: Inbox }],
  },
]

/**
 * 첨부·의견의 다형 키. 두 원장(attachments / entity_feedback) 모두 'approval'을 쓰며,
 * 열람 경계는 서버 RLS가 app.can_read_approval(문서)로 판정한다.
 * 리터럴을 화면마다 적지 않고 여기 한 곳에서 상수로 가져다 쓴다(오타가 타입에 걸리지 않는다).
 */
export const APPROVAL_ATTACHMENT_TYPE = 'approval'
export const APPROVAL_FEEDBACK_TYPE = 'approval'

/** 진행 중 현황 타일 키. 전체 = 나머지 넷의 합집합. */
export type ApprovalProgressKey = 'all' | 'waiting' | 'confirm' | 'upcoming' | 'ongoing'

/**
 * 문서함 목록의 상태 표기 — 목록에서는 결재 단계(1차 검토 등)까지 가르지 않고
 * 임시저장/진행/완료/반려 네 단으로 접는다. 단계는 상세의 결재선 도장 표가 답한다.
 */
export const DOC_STATUS_LABEL: Record<ApprovalStatus, string> = {
  DRAFT: '임시저장',
  PENDING: '진행',
  IN_REVIEW: '진행',
  APPROVED: '완료',
  REJECTED: '반려',
}

export const DOC_STATUS_TONE: Record<ApprovalStatus, BadgeTone> = {
  DRAFT: 'neutral',
  PENDING: 'info',
  IN_REVIEW: 'info',
  APPROVED: 'success',
  REJECTED: 'danger',
}

/** 구분 열 — 이 문서에서 나의 자리. 값이 대등한 분류라 배지가 아니라 텍스트로 적는다. */
export type ApprovalRole = 'drafter' | 'approver' | 'cc' | 'dept'

export const APPROVAL_ROLE_LABEL: Record<ApprovalRole, string> = {
  drafter: '기안',
  approver: '결재',
  cc: '참조',
  dept: '부서',
}

/**
 * 결재선 구분. 진행 방식이 다르다 —
 * 결재는 순차(앞 사람이 처리해야 다음 차례), 합의·재무합의는 병렬(상신 즉시 모두 대기).
 * 참조는 결재하지 않으므로 이 축이 아니라 별도 원장(approval_recipients)이 담는다.
 */
export type ApprovalLineKind = 'APPROVAL' | 'AGREEMENT' | 'FINANCE_AGREEMENT'

export const LINE_KIND_LABEL: Record<ApprovalLineKind, string> = {
  APPROVAL: '결재',
  AGREEMENT: '합의',
  FINANCE_AGREEMENT: '재무합의',
}

/** 결재선 표·지정 화면에서 늘 이 순서로 놓는다(결재 → 합의 → 재무합의 → 참조). */
export const LINE_KIND_ORDER: ApprovalLineKind[] = ['APPROVAL', 'AGREEMENT', 'FINANCE_AGREEMENT']

/** 순차로 진행되는 구분인가(아니면 병렬). */
export function isSequentialKind(kind: ApprovalLineKind): boolean {
  return kind === 'APPROVAL'
}
