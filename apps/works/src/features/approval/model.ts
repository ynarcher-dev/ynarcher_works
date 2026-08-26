import { LINE_KIND_ORDER } from '@/features/approval/config'
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

/**
 * 문서 종류 표기 — 양식 원장이 정본, 양식 없는 구(舊) 문서는 legacy form_type으로 폴백.
 *
 * 목록 행 전체가 아니라 **양식 두 칸만** 받는다. 같은 판정을 문서함 목록 바깥에서도 쓰기
 * 때문이다(사업 상세의 '관련 전자결재' 패널은 목록과 다른 select로 문서를 읽는다) —
 * 행 타입에 묶어 두면 부르는 쪽마다 쓰지도 않는 열을 채워 넣어야 한다.
 */
export function docTypeName(row: { form: { name: string } | null; form_type: string }): string {
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
 * 지금이 내 차례인가 — **세 구분 모두 자기 줄 안에서 순차**다(2026-08-26). 구분마다 결재선을
 * 순번대로 훑어 아직 처리되지 않은 첫 행이 나이면 내 차례이고, 앞 순번이 남아 있으면 아니다.
 *
 * 줄끼리는 서로를 기다리지 않는다 — 합의 1번과 결재 1번은 동시에 각자의 차례일 수 있다.
 * 합의를 결재의 앞뒤에 못 박으면 두 줄이 사실은 한 줄이 되어, 결재선 표가 구분을 나눠
 * 보여 주는 뜻이 사라진다.
 *
 * 문서 전체가 이미 반려됐으면(어느 행이든 REJECTED) 남은 차례는 없다 — 구분이 무엇이든
 * 반려 한 건이 문서를 종결시키므로 다른 줄의 다음 순번도 함께 끊긴다.
 */
export function isMyTurn(lines: ApprovalLine[], uid: string): boolean {
  if (lines.some((l) => l.decision === 'REJECTED')) return false

  return LINE_KIND_ORDER.some((kind) => {
    const next = lines
      .filter((l) => kindOf(l) === kind)
      .sort((a, b) => a.step_order - b.step_order)
      .find((l) => l.decision === 'PENDING')
    return next?.approver_id === uid
  })
}

/**
 * 문서를 끝낼 마지막 한 표인가 — 구분에 상관없이 나 말고 남은 미처리 결재선이 없으면 참.
 * 구분이 셋으로 나뉜 뒤로는 "순번이 뒤인가"로 답할 수 없다 — 내 결재 줄이 끝나도 합의 줄에
 * 남은 사람이 있으면 문서는 아직 끝나지 않는다.
 */
export function isLastPending<T extends ApprovalLine & { id: string }>(
  lines: T[],
  lineId: string,
): boolean {
  return !lines.some((l) => l.id !== lineId && l.decision === 'PENDING')
}

/**
 * 진행 상태 분류 — **아직 끝나지 않은** 문서 중 나의 처리·주의가 필요한 것을 역할로 가른다.
 * · draft(임시저장): 내가 기안하다 만 문서(아직 상신 전)
 * · waiting(대기): 내 결재 차례
 * · upcoming(예정): 결재선에 있으나 아직 차례가 아님
 * · ongoing(진행): 내가 기안해 흐르는 중
 * 해당 없으면 null. 우선순위는 처리 급한 순(waiting > upcoming > ongoing)이다.
 *
 * 완료(승인·반려)된 문서는 여기서 답하지 않는다(2026-08-26) — 다 끝난 문서가 '진행 중인
 * 문서'에 서 있으면 그 이름이 사실과 어긋난다. 끝났는데 아직 못 본 문서는 내 문서함의
 * '확인' 칸(inBox의 mine-confirm)이 받는다.
 */
export function progressBucket(row: ApprovalListRow, uid: string): ApprovalProgressKey | null {
  // 임시저장은 상신 전이라 결재선을 볼 필요가 없다 — 아직 아무의 차례도 아니고, 오직
  // 쓴 사람만의 일이다. 남의 임시저장은 서버가 애초에 내려보내지 않지만(RLS: DRAFT는
  // 기안자만), 화면 분류도 같은 기준을 다시 적어 목록 필터가 서버보다 넓어지지 않게 한다.
  if (row.status === 'DRAFT') return row.drafter_id === uid ? 'draft' : null

  if (inProgress(row.status)) {
    if (isMyTurn(row.approval_lines, uid)) return 'waiting'
    if (row.approval_lines.some((l) => l.approver_id === uid && l.decision === 'PENDING'))
      return 'upcoming'
    if (row.drafter_id === uid) return 'ongoing'
    return null
  }
  return null
}

/**
 * 진행 분류별 건수. `all`은 나머지 넷의 합(문서 한 건은 한 칸에만 든다).
 *
 * 두 자리가 같은 숫자를 말한다 — 문서함 좌패널의 '진행 중인 문서'와 OFFICE 대시보드의
 * 전자결재 카드다. 세는 규칙을 화면마다 적으면 같은 사람에게 두 곳이 다른 건수를 보이는
 * 날이 오므로(분류 규칙은 progressBucket 하나뿐인데 집계를 각자 하면 필터가 갈린다),
 * 세는 일까지 여기서 한 번에 끝낸다.
 *
 * uid가 없으면(로그인 정보 도착 전) 전부 0이다 — 모르는 상태를 0으로 적는 것이지 "없다"고
 * 단정하는 것이 아니며, uid가 들어오는 즉시 다시 센다.
 */
export function countByProgress(
  rows: ApprovalListRow[],
  uid: string | null,
): Record<ApprovalProgressKey, number> {
  const counts: Record<ApprovalProgressKey, number> = {
    all: 0,
    waiting: 0,
    upcoming: 0,
    ongoing: 0,
    draft: 0,
  }
  if (!uid) return counts
  for (const row of rows) {
    const bucket = progressBucket(row, uid)
    if (!bucket) continue
    counts[bucket] += 1
    counts.all += 1
  }
  return counts
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
    // 확인: 끝났는데 내가 아직 안 열어 본 문서. 다른 칸과 달리 **열면 빠진다** — 함이 아니라
    // 할 일에 가깝지만, 완료된 문서를 찾는 자리가 내 문서함이라 여기 둔다(반려 칸도 상태로
    // 좁힌 칸이다). 열람 표시는 상세를 열 때 useMarkApprovalRead가 남긴다.
    case 'mine-confirm':
      return isCompleted(row.status) && isInvolved(row, uid) && !hasRead(row, uid)
    case 'mine-rejected':
      return isInvolved(row, uid) && row.status === 'REJECTED'
    case 'dept-all':
      return Boolean(myDeptId) && row.department_id === myDeptId && row.status !== 'DRAFT'
  }
}

/**
 * 문서함별 건수. 진행 상태 건수(countByProgress)와 달리 칸끼리 겹친다 — '전체'는 나머지를
 * 품고, 한 문서가 기안이면서 결재일 수도 있다. 그래서 합을 내지 않고 칸마다 따로 센다.
 *
 * 세는 대상은 부르는 쪽이 넘긴 키 목록이다. 좌패널은 자기가 그리는 칸 전부를, 대시보드는
 * 자기가 세우는 한 칸('확인')만 넘긴다 — 쓰지도 않을 칸을 세느라 목록을 여러 번 훑지 않는다.
 */
export function countByBox(
  rows: ApprovalListRow[],
  keys: ApprovalBoxKey[],
  uid: string | null,
  myDeptId: string | null,
): Record<ApprovalBoxKey, number> {
  const counts = Object.fromEntries(keys.map((k) => [k, 0])) as Record<ApprovalBoxKey, number>
  if (!uid) return counts
  for (const row of rows) for (const key of keys) if (inBox(row, key, uid, myDeptId)) counts[key] += 1
  return counts
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
