import { FORM_TYPES } from '@/features/management/config'
import type { ApprovalStatus } from '@/features/management/config'
import type { ApprovalBoxKey, ApprovalProgressKey, ApprovalRole } from '@/features/approval/config'

export interface ApprovalLine {
  approver_id: string | null
  step_order: number
  decision: 'PENDING' | 'APPROVED' | 'REJECTED'
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

/**
 * 지금이 내 결재 차례인가 — 순번대로 훑어 첫 PENDING 결재선이 나이면 참.
 * 앞 단계가 반려됐으면 흐름이 끊긴 것이므로 누구의 차례도 아니다.
 */
export function isMyTurn(lines: ApprovalLine[], uid: string): boolean {
  const sorted = [...lines].sort((a, b) => a.step_order - b.step_order)
  for (const l of sorted) {
    if (l.decision === 'REJECTED') return false
    if (l.decision === 'PENDING') return l.approver_id === uid
  }
  return false
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
