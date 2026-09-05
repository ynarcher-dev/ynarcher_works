import { describe, expect, it } from 'vitest'
import { dedupe, mergeEnvelopes } from './merge.ts'

/**
 * 묶음 결과 합치기의 회귀 테스트.
 *
 * 카드 키가 겹치지 않으므로 합치는 일 자체는 단순하지만, **잃기 쉬운 것**이 둘 있다 —
 * 경고(notes)와 근거(evidence)를 카드와 함께 옮기지 않으면 담당자가 확인할 줄이 사라지고,
 * 못 읽은 자료 사유는 묶음마다 반복돼 같은 문장이 여섯 번 선다.
 */

describe('mergeEnvelopes', () => {
  it('묶음별 카드·경고·근거를 한 봉투로 모은다', () => {
    const merged = mergeEnvelopes([
      { cards: { business: { oneLiner: 'A' } }, notes: { business: ['경고1'] }, evidence: { business: ['p.1'] } },
      { cards: { revenue: { revenue: [] } }, notes: {}, evidence: { revenue: ['p.9'] } },
    ])
    expect(Object.keys(merged.cards)).toEqual(['business', 'revenue'])
    expect(merged.notes).toEqual({ business: ['경고1'] })
    expect(merged.evidence).toEqual({ business: ['p.1'], revenue: ['p.9'] })
  })

  it('빈 목록은 빈 봉투다(전부 실패했다는 판정은 호출자가 한다)', () => {
    expect(mergeEnvelopes([])).toEqual({ cards: {}, notes: {}, evidence: {} })
  })
})

describe('dedupe', () => {
  it('같은 줄을 한 번만 남기고 순서를 지킨다', () => {
    // 자료는 한 벌이고 묶음만 여럿이라, 못 읽은 사유는 묶음 수만큼 반복돼 들어온다.
    expect(dedupe(['A가 비공개입니다.', 'B를 못 읽었습니다.', 'A가 비공개입니다.'])).toEqual([
      'A가 비공개입니다.',
      'B를 못 읽었습니다.',
    ])
  })

  it('빈 목록은 빈 목록이다', () => {
    expect(dedupe([])).toEqual([])
  })
})
