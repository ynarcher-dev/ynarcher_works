import type { LegacyApprovalParticipant } from '@/features/approval/approvalApi'
import type {
  StampDrafterSnapshot,
  StampLine,
  StampRecipient,
} from '@/features/approval/ApprovalStampTable'
import type { ApprovalLineKind } from '@/features/approval/config'

const LINE_KIND_BY_ROLE: Partial<Record<NonNullable<LegacyApprovalParticipant['normalized_role']>, ApprovalLineKind>> = {
  APPROVER: 'APPROVAL',
  CONFIRMER: 'APPROVAL',
  AGREEMENT: 'AGREEMENT',
  FINANCE_AGREEMENT: 'FINANCE_AGREEMENT',
}

function stampLabel(row: LegacyApprovalParticipant): string {
  if (row.normalized_decision === 'REJECTED') return '반려'
  if (row.normalized_decision === 'CONFIRMED' || row.normalized_role === 'CONFIRMER') return '확인'
  return '승인'
}

function stampDecision(row: LegacyApprovalParticipant): StampLine['decision'] {
  if (row.normalized_decision === 'REJECTED') return 'REJECTED'
  if (row.normalized_decision === 'PENDING' || !row.normalized_decision) return 'PENDING'
  return 'APPROVED'
}

function byStep(a: LegacyApprovalParticipant, b: LegacyApprovalParticipant): number {
  const step = (a.step_order ?? Number.MAX_SAFE_INTEGER) - (b.step_order ?? Number.MAX_SAFE_INTEGER)
  return step !== 0 ? step : a.id.localeCompare(b.id)
}

export function buildLegacyApprovalPresentation(participants: LegacyApprovalParticipant[]): {
  drafter: StampDrafterSnapshot | null
  lines: StampLine[]
  recipients: StampRecipient[]
} {
  const active = participants.filter((row) => row.normalized_role && row.normalized_role !== 'OTHER')
  const drafterRow = active.find((row) => row.normalized_role === 'DRAFTER')
  const drafter = drafterRow
    ? {
        key: drafterRow.id,
        name: drafterRow.original_name,
        title: drafterRow.original_position || drafterRow.actor?.original_position || '',
      }
    : null

  const lines = active
    .filter((row) => row.normalized_role && LINE_KIND_BY_ROLE[row.normalized_role])
    .sort((a, b) => {
      const kind = String(LINE_KIND_BY_ROLE[a.normalized_role!])
        .localeCompare(String(LINE_KIND_BY_ROLE[b.normalized_role!]))
      return kind !== 0 ? kind : byStep(a, b)
    })
    .map((row): StampLine => ({
      id: row.id,
      approverId: null,
      stepOrder: row.step_order ?? Number.MAX_SAFE_INTEGER,
      decision: stampDecision(row),
      kind: LINE_KIND_BY_ROLE[row.normalized_role!]!,
      decidedAt: row.decided_at,
      comment: null,
      snapshotName: row.original_name,
      snapshotTitle: row.original_position || row.actor?.original_position || '',
      stampLabel: stampLabel(row),
    }))

  const recipients = active
    .filter((row) => row.normalized_role === 'CC')
    .sort(byStep)
    .map((row): StampRecipient => ({
      key: row.id,
      userId: null,
      snapshotName: row.original_name,
      read: row.normalized_decision === 'CONFIRMED',
    }))

  return { drafter, lines, recipients }
}
