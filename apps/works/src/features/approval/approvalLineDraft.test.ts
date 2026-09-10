import { describe, expect, it } from 'vitest'
import { EMPTY_LINES } from '@/features/approval/approvalApi'
import {
  appendApprovalSlots,
  appendUniqueRecipients,
  removeApprovalSlot,
} from '@/features/approval/approvalLineDraft'

describe('approvalLineDraft', () => {
  it('같은 사람을 같은 결재선의 여러 자리에 넣을 수 있다', () => {
    const once = appendApprovalSlots(EMPTY_LINES, 'APPROVAL', ['user-1'])
    const twice = appendApprovalSlots(once, 'APPROVAL', ['user-1'])

    expect(twice.APPROVAL).toEqual(['user-1', 'user-1'])
  })

  it('같은 사람의 여러 자리 중 누른 자리 하나만 제거한다', () => {
    const lines = { ...EMPTY_LINES, APPROVAL: ['user-1', 'user-2', 'user-1'] }

    expect(removeApprovalSlot(lines, 'APPROVAL', 0).APPROVAL).toEqual(['user-2', 'user-1'])
  })

  it('참조자는 도장 자리가 아니므로 중복을 접는다', () => {
    expect(appendUniqueRecipients(['user-1'], ['user-1', 'user-2'])).toEqual([
      'user-1',
      'user-2',
    ])
  })
})
