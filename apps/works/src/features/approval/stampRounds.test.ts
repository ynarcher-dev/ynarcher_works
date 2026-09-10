import { describe, expect, it } from 'vitest'
import { maxRound, stampLinesForRound, type RoundLine } from './stampRounds'

function line(partial: Partial<RoundLine> & { id: string }): RoundLine {
  return {
    approver_id: 'u1',
    step_order: 1,
    decision: 'PENDING',
    kind: 'APPROVAL',
    round: 1,
    comment: null,
    decided_at: null,
    return_to_step: null,
    return_via_drafter: null,
    ...partial,
  }
}

describe('maxRound', () => {
  it('가장 큰 회차가 현재 회차다', () => {
    expect(maxRound([line({ id: 'a', round: 1 }), line({ id: 'b', round: 3 })])).toBe(3)
  })

  it('결재선이 없으면 1차다', () => {
    expect(maxRound([])).toBe(1)
  })
})

describe('stampLinesForRound', () => {
  // 되돌림이 건너뛴 자리를 비워 두면 결재선에 구멍이 생겨 누가 봤는지를 표가 답하지 못한다.
  it('건너뛴 앞 순번은 지난 회차의 승인 도장으로 그 자리에 선다', () => {
    const lines = [
      line({ id: 'a1', approver_id: 'a', step_order: 1, decision: 'APPROVED', round: 1 }),
      line({ id: 'b1', approver_id: 'b', step_order: 2, decision: 'APPROVED', round: 1 }),
      line({ id: 'c1', approver_id: 'c', step_order: 3, decision: 'REJECTED', round: 1 }),
      // 2차는 2번부터 다시 — 1번은 복제되지 않았다.
      line({ id: 'b2', approver_id: 'b', step_order: 2, round: 2 }),
      line({ id: 'c2', approver_id: 'c', step_order: 3, round: 2 }),
    ]
    const stamps = stampLinesForRound(lines, 2)

    expect(stamps.map((s) => s.id)).toEqual(['a1', 'b2', 'c2'])
    // 자리(순번)는 유지된다 — 건너뛴 사람이 표에서 사라지면 뒤 순번이 앞당겨진다.
    expect(stamps.map((s) => s.seq)).toEqual([1, 2, 3])
    expect(stamps[0]).toMatchObject({ carriedFromRound: 1, note: '1차 승인' })
    expect(stamps[1]?.carriedFromRound).toBe(null)
  })

  it('같은 자리가 여러 회차에 걸쳐 승인됐으면 가장 최근 것 하나만 넘어온다', () => {
    const lines = [
      line({ id: 'a1', approver_id: 'a', step_order: 1, decision: 'APPROVED', round: 1 }),
      line({ id: 'a2', approver_id: 'a', step_order: 1, decision: 'APPROVED', round: 2 }),
      line({ id: 'b3', approver_id: 'b', step_order: 2, round: 3 }),
    ]
    const stamps = stampLinesForRound(lines, 3)

    expect(stamps.map((s) => s.id)).toEqual(['a2', 'b3'])
    expect(stamps[0]?.note).toBe('2차 승인')
  })

  it('되돌린 도장에는 어디로 되돌렸는지가 적힌다', () => {
    const lines = [
      line({ id: 'a', step_order: 1, decision: 'APPROVED' }),
      line({ id: 'b', step_order: 2, decision: 'APPROVED' }),
      line({ id: 'c', step_order: 3, decision: 'REJECTED', return_to_step: 2 }),
    ]
    expect(stampLinesForRound(lines, 1)[2]?.note).toBe('→ 2번부터')
  })

  it('기안자를 거치지 않는 되돌림은 반송으로 적는다', () => {
    const lines = [
      line({ id: 'a', step_order: 1, decision: 'APPROVED' }),
      line({
        id: 'b',
        step_order: 2,
        decision: 'REJECTED',
        return_to_step: 1,
        return_via_drafter: false,
      }),
    ]
    expect(stampLinesForRound(lines, 1)[1]?.note).toBe('반송 → 1번부터')
  })

  it('새 흐름의 반려는 결재 종료로 적는다', () => {
    const lines = [line({ id: 'a', step_order: 1, decision: 'REJECTED' })]
    expect(stampLinesForRound(lines, 1)[0]?.note).toBe('결재 종료')
  })

  it('보완 요청은 별도 안내 문구 없이 노란 도장 상태로 전달한다', () => {
    const lines = [line({ id: 'a', decision: 'REVISION_REQUESTED', comment: '금액 수정' })]
    expect(stampLinesForRound(lines, 1)[0]).toMatchObject({
      decision: 'REVISION_REQUESTED',
      note: null,
      comment: '금액 수정',
    })
  })

  // 순번은 저장된 step_order가 아니라 정렬 후의 자리다 — 임시저장을 고치며 중간이 빠지면
  // 원장 값에 구멍이 생기는데, 사람이 읽는 순번에 2·4가 남으면 없는 3번을 찾게 된다.
  it('step_order에 구멍이 있어도 목적지는 표에 선 순번으로 적는다', () => {
    const lines = [
      line({ id: 'a', step_order: 2, decision: 'APPROVED' }),
      line({ id: 'b', step_order: 5, decision: 'REJECTED', return_to_step: 2 }),
    ]
    expect(stampLinesForRound(lines, 1)[1]?.note).toBe('→ 1번부터')
  })
})
