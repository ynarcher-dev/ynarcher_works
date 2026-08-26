import { FORM_TYPES } from '@/features/management/config'
import type { ApprovalStatus } from '@/features/management/config'
import type {
  ApprovalBoxKey,
  ApprovalLineKind,
  ApprovalProgressKey,
  ApprovalRole,
} from '@/features/approval/config'

export interface ApprovalLine {
  approver_id: string | null
  step_order: number
  decision: 'PENDING' | 'APPROVED' | 'REJECTED'
  /** 구분. 미지정 행(구 데이터)은 결재로 본다. */
  kind?: ApprovalLineKind
}

/** 문서함 목록 한 행 — approvalApi의 LIST_SELECT와 형태가 일치해야 한다. */
export interface ApprovalListRow {
  id: string
  title: string
  doc_no: string | null
  form_type: string
  status: ApprovalStatus
  drafter_id: string | null
  department_id: string | null
  amount: number | null
  created_at: string
  completed_at: string | null
  form: { name: string } | null
  approval_lines: ApprovalLine[]
  approval_recipients: { user_id: string }[]
  approval_reads: { user_id: string }[]
}

const inProgress = (s: ApprovalStatus) => s === 'PENDING' || s === 'IN_REVIEW'
const isCompleted = (s: ApprovalStatus) => s === 'APPROVED' || s === 'REJECTED'

/** 문서 종류 표기 — 양식 원장이 정본, 양식 없는 구(舊) 문서는 legacy form_type으로 폴백. */
export function docTypeName(row: ApprovalListRow): string {
  if (row.form?.name) return row.form.name
  return FORM_TYPES.find((f) => f.key === row.form_type)?.label ?? row.form_type
}

const isApprover = (row: ApprovalListRow, uid: string) =>
  row.approval_lines.some((l) => l.approver_id === uid)

const isRecipient = (row: ApprovalListRow, uid: string) =>
  row.approval_recipients.some((r) => r.user_id === uid)

/** 기안·결재·참조 어느 자리로든 이 문서에 걸려 있는가(내 문서함 전체의 기준). */
export function isInvolved(row: ApprovalListRow, uid: string): boolean {
  return row.drafter_id === uid || isApprover(row, uid) || isRecipient(row, uid)
}

export function hasRead(row: ApprovalListRow, uid: string): boolean {
  return row.approval_reads.some((r) => r.user_id === uid)
}

const kindOf = (l: ApprovalLine): ApprovalLineKind => l.kind ?? 'APPROVAL'

/**
 * 지금이 내 차례인가 — 구분마다 진행 방식이 달라 판정도 갈린다.
 *
 * · **결재**는 순차다. 결재선만 순번대로 훑어 첫 PENDING이 나이면 내 차례이며, 앞 단계가
 *   반려됐으면 흐름이 끊긴 것이라 누구의 차례도 아니다.
 * · **합의·재무합의**는 병렬이다. 상신된 문서라면 내 합의 행이 PENDING인 동안 언제든 처리할
 *   수 있다 — 순서를 강제하면 합의자가 자리를 비운 동안 결재 전체가 멈춘다.
 *
 * 문서 전체가 이미 반려됐으면(어느 행이든 REJECTED) 남은 차례는 없다.
 */
export function isMyTurn(lines: ApprovalLine[], uid: string): boolean {
  if (lines.some((l) => l.decision === 'REJECTED')) return false

  // 병렬 구분(합의·재무합의)은 순서를 보지 않는다.
  if (lines.some((l) => l.approver_id === uid && l.decision === 'PENDING' && kindOf(l) !== 'APPROVAL'))
    return true

  const sequential = lines
    .filter((l) => kindOf(l) === 'APPROVAL')
    .sort((a, b) => a.step_order - b.step_order)
  for (const l of sequential) {
    if (l.decision === 'PENDING') return l.approver_id === uid
  }
  return false
}

/**
 * 문서를 끝낼 마지막 한 표인가 — 구분에 상관없이 나 말고 남은 미처리 결재선이 없으면 참.
 * 합의가 병렬이라 "순번이 뒤인가"로는 답할 수 없다.
 */
export function isLastPending<T extends ApprovalLine & { id: string }>(
  lines: T[],
  lineId: string,
): boolean {
  return !lines.some((l) => l.id !== lineId && l.decision === 'PENDING')
}

/**
 * 진행 중 타일 분류 — 지금 나의 처리·주의가 필요한 문서를 역할로 가른다.
 * · waiting(대기): 내 결재 차례
 * · upcoming(예정): 결재선에 있으나 아직 차례가 아님
 * · ongoing(진행): 내가 기안해 흐르는 중
 * · confirm(확인): 완료(승인·반려)됐는데 아직 내가 열람하지 않음
 * 해당 없으면 null. 우선순위는 처리 급한 순(waiting > upcoming > ongoing)이다.
 */
export function progressBucket(row: ApprovalListRow, uid: string): ApprovalProgressKey | null {
  if (inProgress(row.status)) {
    if (isMyTurn(row.approval_lines, uid)) return 'waiting'
    if (row.approval_lines.some((l) => l.approver_id === uid && l.decision === 'PENDING'))
      return 'upcoming'
    if (row.drafter_id === uid) return 'ongoing'
    return null
  }
  if (isCompleted(row.status) && isInvolved(row, uid) && !hasRead(row, uid)) return 'confirm'
  return null
}

/** 구분 열 값 — 문서에서 나의 자리(기안 > 결재 > 참조 > 부서 순으로 판정). */
export function myRole(
  row: ApprovalListRow,
  uid: string,
  myDeptId: string | null,
): ApprovalRole | null {
  if (row.drafter_id === uid) return 'drafter'
  if (isApprover(row, uid)) return 'approver'
  if (isRecipient(row, uid)) return 'cc'
  if (myDeptId && row.department_id === myDeptId) return 'dept'
  return null
}

/**
 * 문서함 소속 판정. 부서 문서함은 상신된 문서만 담는다 — DRAFT는 아직 조직의
 * 문서가 아니고, 서버 RLS도 같은 기준(DRAFT는 기안자만)으로 가른다.
 */
export function inBox(
  row: ApprovalListRow,
  box: ApprovalBoxKey,
  uid: string,
  myDeptId: string | null,
): boolean {
  switch (box) {
    case 'mine-all':
      return isInvolved(row, uid)
    case 'mine-drafted':
      return row.drafter_id === uid
    case 'mine-approver':
      return isApprover(row, uid)
    case 'mine-cc':
      return isRecipient(row, uid)
    case 'mine-rejected':
      return isInvolved(row, uid) && row.status === 'REJECTED'
    case 'dept-all':
      return Boolean(myDeptId) && row.department_id === myDeptId && row.status !== 'DRAFT'
  }
}

/** 검색 — 제목·문서 번호·문서 종류·기안자 이름을 함께 훑는다. */
export function matchesKeyword(
  row: ApprovalListRow,
  keyword: string,
  drafterName: string,
): boolean {
  const q = keyword.trim().toLowerCase()
  if (!q) return true
  return (
    row.title.toLowerCase().includes(q) ||
    (row.doc_no ?? '').toLowerCase().includes(q) ||
    docTypeName(row).toLowerCase().includes(q) ||
    drafterName.toLowerCase().includes(q)
  )
}
