import {
  Ban,
  CalendarClock,
  CheckCheck,
  FileCheck,
  FilePen,
  Files,
  Hourglass,
  Inbox,
  PenLine,
  Send,
  Users,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { tableTextScale, type BadgeTone, type TableTextSet } from '@ynarcher/ui'
import type { ApprovalStatus } from '@/features/management/config'

/**
 * 전자결재 문서의 글자 단 — 카드 안 표의 기본(12px)이 아니라 **페이지 표의 단(14px)**을 쓴다.
 *
 * 밀도 규칙은 "카드 안에 든 표는 카드가 말하는 주제의 부속이라 한 단 내린다"인데, 결재 문서는
 * 카드에 담겼을 뿐 그 자체가 읽을거리다(화면이기 이전에 **양식**이고, 사람들이 종이와 기존
 * 결재 시스템에서 익힌 크기가 본문 크기다). 결재는 한 글자를 잘못 읽으면 승인 여부가 갈리는
 * 문서라 여기서만 예외를 둔다 — 2026-08-26 확정.
 *
 * 크기를 새로 만들지 않고 이미 있는 단(`tableTextScale.page`)을 고른다. 고르는 일은 이 한 줄이
 * 전부이며, 화면은 규격 클래스를 직접 쓰지 않고 이 단만 가져다 쓴다.
 */
export const approvalText: TableTextSet = tableTextScale.page

/**
 * 문서함(좌패널) 키. 내 문서함은 문서에서의 나의 자리(기안·결재·참조)로,
 * 부서 문서함은 소속으로 가른다.
 *
 * '진행 중인 문서'는 한때 상단 현황 타일이 담당했으나 2026-08-26 좌패널로 합쳤다 —
 * 둘 다 "목록을 어떤 기준으로 좁히는가"라는 같은 축이라, 자리를 나눠 두면 지금 무엇으로
 * 걸러진 목록을 보고 있는지가 두 곳에 흩어진다.
 */
export type ApprovalBoxKey =
  'mine-all' | 'mine-drafted' | 'mine-approver' | 'mine-cc' | 'mine-rejected' | 'dept-all'

export interface ApprovalBoxGroup {
  label: string
  boxes: { key: ApprovalBoxKey; label: string; icon: LucideIcon }[]
}

/**
 * 좌패널 그룹 순서 = **지금 할 일 → 내 것 → 부서 것**.
 * 진행 중인 문서(APPROVAL_PROGRESS_GROUP) → 내 문서함 → 부서 문서함 순으로 선다.
 *
 * 진행 그룹이 맨 위인 이유는 문서함을 열 때의 첫 질문이 "내 문서가 어디 있나"가 아니라
 * "지금 내가 처리할 게 있나"이기 때문이다. 부서함은 남의 문서까지 포함하는 가장 넓은
 * 범위라 맨 아래다. 그리는 순서는 ApprovalDocboxNav가 소유한다(키 종류가 둘이라 한 배열로
 * 묶을 수 없다).
 */
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
]

/** 부서 문서함 — 가장 넓은 범위라 좌패널 맨 아래에 둔다. */
export const APPROVAL_DEPT_GROUP: ApprovalBoxGroup = {
  label: '부서 문서함',
  boxes: [{ key: 'dept-all', label: '전체', icon: Inbox }],
}

/**
 * 진행 중인 문서 그룹 — 문서함과 같은 좌패널에 서지만 키 종류가 다르다(진행 상태 축).
 *
 * 하이웍스의 문서 상태 축(대기·예정·진행·완료·수신대기·회람대기)에서 우리 데이터에 있는
 * 것만 골라 세운다. '완료'와 '회람 대기'는 **확인** 하나로 합쳤다 — 다 끝난 문서는 시간이
 * 갈수록 쌓이기만 해서 "지금 신경 쓸 것"을 묻는 이 그룹의 성격과 어긋나고, 여기서 답해야
 * 하는 것은 "끝났는데 내가 아직 못 본 게 있나" 하나이기 때문이다.
 *
 * **임시저장**이 이 그룹에 서는 이유(2026-08-26): 기안을 하고도 상신하지 않으면 그 문서는
 * 어느 칸에도 들지 않아, 분명히 만든 문서가 대시보드에서 0건으로 보였다. 쓰다 만 문서야말로
 * 내 손이 가야 할 것이라 여기가 제자리다(하이웍스의 '임시보관함'과 같은 자리). 내 문서함의
 * '기안'과 겹치지 않는다 — 저쪽은 상신 여부와 무관한 **내가 기안한 전부**이고, 이쪽은 아직
 * 조직에 올라가지 않은 것만이다.
 */
export const APPROVAL_PROGRESS_GROUP: {
  label: string
  boxes: { key: ApprovalProgressKey; label: string; icon: LucideIcon }[]
} = {
  label: '진행 중인 문서',
  boxes: [
    { key: 'all', label: '전체', icon: Files },
    { key: 'waiting', label: '대기', icon: Hourglass },
    { key: 'confirm', label: '확인', icon: CheckCheck },
    { key: 'upcoming', label: '예정', icon: CalendarClock },
    { key: 'ongoing', label: '진행', icon: Send },
    { key: 'draft', label: '임시저장', icon: FilePen },
  ],
}

/**
 * 첨부·의견의 다형 키. 두 원장(attachments / entity_feedback) 모두 'approval'을 쓰며,
 * 열람 경계는 서버 RLS가 app.can_read_approval(문서)로 판정한다.
 * 리터럴을 화면마다 적지 않고 여기 한 곳에서 상수로 가져다 쓴다(오타가 타입에 걸리지 않는다).
 */
export const APPROVAL_ATTACHMENT_TYPE = 'approval'
export const APPROVAL_FEEDBACK_TYPE = 'approval'

/** 진행 상태 키. 전체 = 나머지 다섯의 합집합(문서 한 건은 한 칸에만 든다). */
export type ApprovalProgressKey =
  'all' | 'waiting' | 'confirm' | 'upcoming' | 'ongoing' | 'draft'

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
