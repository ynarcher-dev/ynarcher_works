import type { LegacyApprovalParticipant } from '@/features/approval/approvalApi'
import { ApprovalStampTable } from '@/features/approval/ApprovalStampTable'
import { buildLegacyApprovalPresentation } from '@/features/approval/legacyApprovalPresentation'

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
  const presentation = buildLegacyApprovalPresentation(participants)

  return (
    <ApprovalStampTable
      drafterId={drafterId}
      draftedAt={draftedAt}
      drafterSnapshot={presentation.drafter}
      lines={presentation.lines}
      recipients={presentation.recipients}
      nameOf={nameOf}
      titleOf={titleOf}
    />
  )
}
