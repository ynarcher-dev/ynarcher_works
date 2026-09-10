import { describe, expect, it } from 'vitest'
import type { LegacyApprovalParticipant } from '@/features/approval/approvalApi'
import { buildLegacyApprovalPresentation } from '@/features/approval/legacyApprovalPresentation'

function participant(
  id: string,
  name: string,
  role: NonNullable<LegacyApprovalParticipant['normalized_role']>,
  step: number,
  decision: LegacyApprovalParticipant['normalized_decision'],
): LegacyApprovalParticipant {
  return {
    id,
    source_line_section: null,
    step_order: step,
    source_role: null,
    normalized_role: role,
    source_decision: null,
    normalized_decision: decision,
    decided_at: decision ? '2026-06-10 10:00:00' : null,
    original_name: name,
    original_position: null,
    actor: null,
  }
}

describe('buildLegacyApprovalPresentation', () => {
  it('역할별 결재선과 참조를 분리하고 원본 순서로 세운다', () => {
    const result = buildLegacyApprovalPresentation([
      participant('cc-2', '미열람 참조', 'CC', 2, null),
      participant('finance-2', '재무 2', 'FINANCE_AGREEMENT', 2, 'APPROVED'),
      participant('old', '퇴역 행', 'OTHER', 1, 'CONFIRMED'),
      participant('drafter', '기안자', 'DRAFTER', 1, 'APPROVED'),
      participant('approval', '결재자', 'APPROVER', 1, 'APPROVED'),
      participant('cc-1', '열람 참조', 'CC', 1, 'CONFIRMED'),
      participant('finance-1', '재무 1', 'FINANCE_AGREEMENT', 1, 'APPROVED'),
    ])

    expect(result.drafter?.name).toBe('기안자')
    expect(result.lines.filter((line) => line.kind === 'APPROVAL').map((line) => line.snapshotName))
      .toEqual(['결재자'])
    expect(result.lines.filter((line) => line.kind === 'FINANCE_AGREEMENT').map((line) => line.snapshotName))
      .toEqual(['재무 1', '재무 2'])
    expect(result.recipients.map((recipient) => [recipient.snapshotName, recipient.read])).toEqual([
      ['열람 참조', true],
      ['미열람 참조', false],
    ])
  })
})
