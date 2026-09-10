import { describe, expect, it } from 'vitest'
import {
  approvalRecallActionFor,
  isFinalApprovalReset,
  type RecallLine,
} from './approvalRecall'

const ME = 'me'

function line(partial: Partial<RecallLine> = {}): RecallLine {
  return {
    id: 'line-1',
    approver_id: ME,
    round: 1,
    decision: 'APPROVED',
    decided_at: '2026-09-10T01:00:00Z',
    ...partial,
  }
}

describe('approvalRecallActionFor', () => {
  it('뒤에 미처리 결재가 남은 가장 최근 승인자는 승인을 취소할 수 있다', () => {
    const lines = [
      line(),
      line({ id: 'line-2', approver_id: 'next', decision: 'PENDING', decided_at: null }),
    ]
    expect(approvalRecallActionFor('IN_REVIEW', lines, ME)).toEqual({
      action: 'WITHDRAW',
      lineId: 'line-1',
    })
  })

  it('다른 사람이 뒤이어 승인했어도 미처리 결재가 남으면 본인 승인을 취소할 수 있다', () => {
    const lines = [
      line(),
      line({
        id: 'line-2',
        approver_id: 'next',
        decided_at: '2026-09-10T02:00:00Z',
      }),
      line({ id: 'line-3', approver_id: 'last', decision: 'PENDING', decided_at: null }),
    ]
    expect(approvalRecallActionFor('IN_REVIEW', lines, ME)).toEqual({
      action: 'WITHDRAW',
      lineId: 'line-1',
    })
  })

  it('문서를 완료한 마지막 승인자에게는 결재 초기화를 제공한다', () => {
    expect(approvalRecallActionFor('APPROVED', [line()], ME)).toEqual({
      action: 'RESET',
      lineId: 'line-1',
    })
  })

  it('이전 회차의 승인은 회수할 수 없다', () => {
    const lines = [
      line(),
      line({ id: 'line-2', round: 2, approver_id: 'next', decision: 'PENDING', decided_at: null }),
    ]
    expect(approvalRecallActionFor('IN_REVIEW', lines, ME)).toBeNull()
  })
})

describe('isFinalApprovalReset', () => {
  it('완료 회차 다음에 전체 PENDING 회차가 생긴 반려 문서를 식별한다', () => {
    const lines = [
      line(),
      line({ id: 'line-2', round: 2, decision: 'PENDING', decided_at: null }),
    ]
    expect(isFinalApprovalReset('REJECTED', lines)).toBe(true)
    expect(isFinalApprovalReset('REVISION_REQUIRED', lines)).toBe(false)
  })
})
