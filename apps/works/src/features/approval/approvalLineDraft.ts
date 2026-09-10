import type { ApprovalLineInput } from '@/features/approval/approvalApi'

export function appendApprovalSlots(
  lines: ApprovalLineInput,
  kind: keyof ApprovalLineInput,
  userIds: string[],
): ApprovalLineInput {
  return { ...lines, [kind]: [...lines[kind], ...userIds] }
}

export function removeApprovalSlot(
  lines: ApprovalLineInput,
  kind: keyof ApprovalLineInput,
  index: number,
): ApprovalLineInput {
  return { ...lines, [kind]: lines[kind].filter((_, i) => i !== index) }
}

export function appendUniqueRecipients(current: string[], userIds: string[]): string[] {
  return [...new Set([...current, ...userIds])]
}
