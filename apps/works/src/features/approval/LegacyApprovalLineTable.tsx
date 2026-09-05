import type { LegacyApprovalParticipant } from '@/features/approval/approvalApi'
import {
  ApprovalStampTable,
  type StampLine,
} from '@/features/approval/ApprovalStampTable'

const ROLE_PRIORITY: Record<NonNullable<LegacyApprovalParticipant['normalized_role']>, number> = {
  DRAFTER: 100,
  APPROVER: 90,
  AGREEMENT: 80,
  FINANCE_AGREEMENT: 80,
  CONFIRMER: 70,
  CC: 60,
  OTHER: 10,
}

function mergeParticipants(rows: LegacyApprovalParticipant[]): LegacyApprovalParticipant[] {
  const merged = new Map<string, LegacyApprovalParticipant>()
  for (const row of rows) {
    if (row.normalized_role === 'DRAFTER') continue
    const key = row.decided_at ? `${row.original_name}|${row.decided_at}` : row.id
    const current = merged.get(key)
    if (!current) {
      merged.set(key, row)
      continue
    }

    const currentPriority = current.normalized_role ? ROLE_PRIORITY[current.normalized_role] : 0
    const rowPriority = row.normalized_role ? ROLE_PRIORITY[row.normalized_role] : 0
    const decisionSource = rowPriority > currentPriority ? row : current
    merged.set(key, {
      ...current,
      normalized_role: decisionSource.normalized_role,
      source_role: decisionSource.source_role ?? current.source_role,
      source_decision: decisionSource.source_decision ?? current.source_decision,
      normalized_decision: decisionSource.normalized_decision ?? current.normalized_decision,
      source_line_section: current.source_line_section ?? row.source_line_section,
      step_order: current.step_order ?? row.step_order,
      original_position: current.original_position ?? row.original_position,
      actor: current.actor ?? row.actor,
    })
  }

  return [...merged.values()].sort((a, b) => {
    const time = (a.decided_at ?? '').localeCompare(b.decided_at ?? '')
    if (time !== 0) return time
    return (a.step_order ?? Number.MAX_SAFE_INTEGER) - (b.step_order ?? Number.MAX_SAFE_INTEGER)
  })
}

function stampLabel(row: LegacyApprovalParticipant): string {
  if (row.normalized_decision === 'REJECTED') return '반려'
  if (row.normalized_decision === 'CONFIRMED' || row.normalized_role === 'CONFIRMER') return '확인'
  if (row.normalized_decision === 'APPROVED' || row.normalized_role === 'APPROVER') return '승인'
  if (row.source_line_section === 'third_line' || row.source_decision === 'ok') return '확인'
  return row.source_decision || row.source_role || '확인'
}

export function LegacyApprovalLineTable({
  participants,
  drafterId,
  draftedAt,
  nameOf,
  titleOf,
}: {
  participants: LegacyApprovalParticipant[]
  drafterId: string | null
  draftedAt: string | null
  nameOf: (id: string | null) => string
  titleOf: (id: string | null) => string
}) {
  const lines: StampLine[] = mergeParticipants(participants).map((row, index) => ({
    id: row.id,
    approverId: null,
    stepOrder: index + 1,
    decision: row.normalized_decision === 'REJECTED' ? 'REJECTED' : 'APPROVED',
    kind: 'APPROVAL',
    decidedAt: row.decided_at,
    comment: null,
    snapshotName: row.original_name,
    snapshotTitle: row.original_position || row.actor?.original_position || '',
    stampLabel: stampLabel(row),
  }))

  return (
    <ApprovalStampTable
      drafterId={drafterId}
      draftedAt={draftedAt}
      lines={lines}
      recipients={[]}
      nameOf={nameOf}
      titleOf={titleOf}
    />
  )
}
