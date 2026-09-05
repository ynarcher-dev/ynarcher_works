import { describe, expect, it } from 'vitest'
import { maxRound, returnTargetsFor, stampLinesForRound, type RoundLine } from './stampRounds'

const ME = 'me'

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

const nameOf = (id: string | null) => (id ? `이름:${id}` : '-')

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

  it('목적지 없는 되돌림은 처음부터라고 적는다', () => {
    const lines = [line({ id: 'a', step_order: 1, decision: 'REJECTED' })]
    expect(stampLinesForRound(lines, 1)[0]?.note).toBe('→ 처음부터')
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

describe('returnTargetsFor', () => {
  it('같은 구분에서 이미 승인한 앞 순번만 되돌릴 수 있다', () => {
    const lines = [
      line({ id: 'a', approver_id: 'a', step_order: 1, decision: 'APPROVED' }),
      line({ id: 'b', approver_id: 'b', step_order: 2, decision: 'APPROVED' }),
      line({ id: 'me', approver_id: ME, step_order: 3 }),
      // 아직 처리하지 않은 뒤 순번 — 되돌림이 아니라 건너뛰기라 목록에 서지 않는다.
      line({ id: 'd', approver_id: 'd', step_order: 4 }),
      // 다른 구분 — 합의 줄은 '다시 받기' 체크박스가 담당한다.
      line({ id: 'g', approver_id: 'g', step_order: 1, decision: 'APPROVED', kind: 'AGREEMENT' }),
    ]
    const targets = returnTargetsFor(lines, 1, 'APPROVAL', 3, nameOf)

    expect(targets).toEqual([
      { stepOrder: 1, seq: 1, name: '이름:a' },
      { stepOrder: 2, seq: 2, name: '이름:b' },
    ])
  })

  it('지난 회차의 행은 되돌릴 자리로 서지 않는다', () => {
    const lines = [
      line({ id: 'a1', approver_id: 'a', step_order: 1, decision: 'APPROVED', round: 1 }),
      line({ id: 'me', approver_id: ME, step_order: 2, round: 2 }),
    ]
    expect(returnTargetsFor(lines, 2, 'APPROVAL', 2, nameOf)).toEqual([])
  })

  it('내가 첫 순번이면 되돌릴 곳이 없다', () => {
    const lines = [line({ id: 'me', approver_id: ME, step_order: 1 })]
    expect(returnTargetsFor(lines, 1, 'APPROVAL', 1, nameOf)).toEqual([])
  })
})
