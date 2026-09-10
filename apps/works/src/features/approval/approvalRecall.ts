import type { ApprovalStatus } from '@/features/management/config'

export interface RecallLine {
  id: string
  approver_id: string | null
  round?: number
  decision: 'PENDING' | 'REVISION_REQUESTED' | 'APPROVED' | 'REJECTED'
  decided_at?: string | null
}

export type ApprovalRecallAction = 'WITHDRAW' | 'RESET'

const roundOf = (line: RecallLine): number => line.round ?? 1

const latestRound = (lines: RecallLine[]): number =>
  lines.reduce((latest, line) => Math.max(latest, roundOf(line)), 1)

function latestApproved(lines: RecallLine[]): RecallLine | null {
  return (
    [...lines]
      .filter((line) => line.decision === 'APPROVED')
      .sort((a, b) => {
        const byTime = (b.decided_at ?? '').localeCompare(a.decided_at ?? '')
        return byTime || b.id.localeCompare(a.id)
      })[0] ?? null
  )
}

/**
 * 최종 승인 초기화로 기안자에게 돌아온 문서의 모양.
 * 완료 회차는 보존되고 그 다음 회차 전체가 아직 PENDING인 경우에만 참이다.
 */
export function isFinalApprovalReset(
  status: ApprovalStatus,
  lines: RecallLine[],
): boolean {
  if (status !== 'REJECTED') return false
  const current = latestRound(lines)
  if (current <= 1) return false
  const living = lines.filter((line) => roundOf(line) === current)
  const previous = lines.filter((line) => roundOf(line) === current - 1)
  return (
    living.length > 0 &&
    living.every((line) => line.decision === 'PENDING') &&
    previous.length > 0 &&
    previous.every((line) => line.decision === 'APPROVED')
  )
}

/** 서버와 같은 보수적 규칙으로 현재 사용자에게 보여 줄 회수 동작을 고른다. */
export function approvalRecallActionFor(
  status: ApprovalStatus,
  lines: RecallLine[],
  uid: string,
): { action: ApprovalRecallAction; lineId: string } | null {
  const current = latestRound(lines)
  const living = lines.filter((line) => roundOf(line) === current)

  if (status === 'APPROVED') {
    const latest = latestApproved(living)
    return latest?.approver_id === uid ? { action: 'RESET', lineId: latest.id } : null
  }

  const mine = latestApproved(living.filter((line) => line.approver_id === uid))
  if (!mine) return null

  if (
    (status === 'PENDING' || status === 'IN_REVIEW') &&
    living.some((line) => line.decision === 'PENDING')
  ) {
    return { action: 'WITHDRAW', lineId: mine.id }
  }
  return null
}
