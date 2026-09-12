import { describe, expect, it } from 'vitest'
import {
  approvalStatusLabel,
  approvalStatusTone,
  canDeleteDraft,
  canWithdrawDraft,
  isWithdrawnDraft,
  type ApprovalDraftActionContext,
} from './approvalDraftActions'
import type { ApprovalLine } from './model'
import type { ApprovalStatus } from '@/features/management/config'

const ME = 'me'

function line(partial: Partial<ApprovalLine> = {}): ApprovalLine {
  return { approver_id: 'boss', step_order: 1, decision: 'PENDING', round: 1, ...partial }
}

function ctx(partial: Partial<ApprovalDraftActionContext> = {}): ApprovalDraftActionContext {
  return {
    status: 'PENDING',
    drafterId: ME,
    lines: [line()],
    isLegacy: false,
    ...partial,
  }
}

describe('canWithdrawDraft', () => {
  it('기안자는 상신·검토·보완 중인 문서를 취소할 수 있다', () => {
    for (const status of ['PENDING', 'IN_REVIEW', 'REVISION_REQUIRED'] as ApprovalStatus[]) {
      expect(canWithdrawDraft(ctx({ status }), ME)).toBe(true)
    }
  })

  it('끝난 문서는 취소 대상이 아니다 — 최종 승인은 결재 초기화가, 반려는 종결이 답한다', () => {
    expect(canWithdrawDraft(ctx({ status: 'APPROVED' }), ME)).toBe(false)
    expect(canWithdrawDraft(ctx({ status: 'REJECTED' }), ME)).toBe(false)
  })

  it('이미 기안 단계인 문서는 되가져올 것이 없다', () => {
    expect(canWithdrawDraft(ctx({ status: 'DRAFT' }), ME)).toBe(false)
  })

  it('기안자가 아니면 취소할 수 없고, 로그인 정보가 오기 전에도 열리지 않는다', () => {
    expect(canWithdrawDraft(ctx(), 'other')).toBe(false)
    expect(canWithdrawDraft(ctx(), null)).toBe(false)
  })

  it('이관 문서는 결재선이 다른 원장에 있어 대상이 아니다', () => {
    expect(canWithdrawDraft(ctx({ isLegacy: true }), ME)).toBe(false)
  })
})

describe('canDeleteDraft', () => {
  it('기안자는 기안 단계 문서를 지울 수 있다(상신 이력이 있는 취소 문서도 같다)', () => {
    expect(canDeleteDraft(ctx({ status: 'DRAFT' }), ME)).toBe(true)
    expect(
      canDeleteDraft(
        ctx({ status: 'DRAFT', lines: [line({ round: 1, decision: 'APPROVED' }), line({ round: 2 })] }),
        ME,
      ),
    ).toBe(true)
  })

  it('흐르는 중인 문서는 먼저 취소해야 한다 — 그 통지를 건너뛰지 못한다', () => {
    expect(canDeleteDraft(ctx({ status: 'PENDING' }), ME)).toBe(false)
    expect(canDeleteDraft(ctx({ status: 'REVISION_REQUIRED' }), ME)).toBe(false)
    expect(canDeleteDraft(ctx({ status: 'APPROVED' }), ME)).toBe(false)
  })

  it('남의 기안과 이관 문서는 지울 수 없다', () => {
    expect(canDeleteDraft(ctx({ status: 'DRAFT' }), 'other')).toBe(false)
    expect(canDeleteDraft(ctx({ status: 'DRAFT', isLegacy: true }), ME)).toBe(false)
  })
})

describe('isWithdrawnDraft', () => {
  it('상신 이력을 가진 임시저장만 취소된 문서다', () => {
    expect(isWithdrawnDraft('DRAFT', [line({ round: 1 })])).toBe(false)
    expect(
      isWithdrawnDraft('DRAFT', [line({ round: 1, decision: 'APPROVED' }), line({ round: 2 })]),
    ).toBe(true)
  })

  it('회차가 쌓인 다른 경로는 임시저장으로 끝나지 않으므로 섞이지 않는다', () => {
    const twoRounds = [line({ round: 1, decision: 'APPROVED' }), line({ round: 2 })]
    // 보완 재상신
    expect(isWithdrawnDraft('PENDING', twoRounds)).toBe(false)
    expect(isWithdrawnDraft('IN_REVIEW', twoRounds)).toBe(false)
    // 최종 승인 초기화
    expect(isWithdrawnDraft('REJECTED', twoRounds)).toBe(false)
  })

  it('회차가 없는 구 데이터는 1차로 읽혀 취소로 오인되지 않는다', () => {
    expect(isWithdrawnDraft('DRAFT', [{ approver_id: 'boss', step_order: 1, decision: 'PENDING' }])).toBe(
      false,
    )
  })
})

describe('approvalStatusLabel / approvalStatusTone', () => {
  const withdrawn = [line({ round: 1, decision: 'APPROVED' }), line({ round: 2 })]

  it('취소된 문서는 임시저장이 아니라 기안 취소로 선다', () => {
    expect(approvalStatusLabel('DRAFT', withdrawn)).toBe('기안 취소')
    expect(approvalStatusTone('DRAFT', withdrawn)).toBe('warning')
  })

  it('나머지 상태는 상태 원장의 표기를 그대로 쓴다', () => {
    expect(approvalStatusLabel('DRAFT', [line()])).toBe('임시저장')
    expect(approvalStatusTone('DRAFT', [line()])).toBe('neutral')
    expect(approvalStatusLabel('APPROVED', withdrawn)).toBe('완료')
    expect(approvalStatusTone('REJECTED', withdrawn)).toBe('danger')
  })
})
