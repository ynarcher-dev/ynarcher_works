import { describe, expect, it } from 'vitest'
import type { Evidence } from './evidence.ts'
import { dedupe, mergeEnvelopes } from './merge.ts'

/**
 * 묶음 합치기의 회귀 테스트.
 *
 * 여기서 지키는 것 둘 — **카드와 함께 오는 것을 잃지 않는 것**과 **같은 줄을 여러 번 세우지
 * 않는 것**이다. 경고(notes)와 근거(evidence)를 카드와 함께 옮기지 않으면 담당자가 확인할 줄이
 * 사라지고, 못 읽은 자료 사유는 묶음마다 같은 문장이라 그대로 이으면 여섯 번 선다.
 *
 * 근거: docs/docs_planning/3_3_5_startup_ai_fill.md §8.3
 */

const evidence = (fileName: string, location: string): Evidence => ({
  verified: true,
  fileName,
  location,
  quote: '매출액 1,200,000,000',
  attachmentId: 'A1',
})

describe('mergeEnvelopes', () => {
  it('카드·경고·근거를 함께 옮긴다', () => {
    const merged = mergeEnvelopes([
      {
        cards: { business: { oneLiner: 'A' } },
        notes: { business: ['경고1'] },
        evidence: { business: [evidence('IR.pdf', 'p.1')] },
      },
      { cards: { revenue: { revenue: [] } }, notes: {}, evidence: { revenue: [evidence('재무.xlsx', '시트: 손익')] } },
    ])
    expect(Object.keys(merged.cards)).toEqual(['business', 'revenue'])
    expect(merged.notes).toEqual({ business: ['경고1'] })
    expect(merged.evidence.revenue?.[0].location).toBe('시트: 손익')
  })

  it('빈 목록이면 빈 봉투다(전부 실패했다는 판정은 호출자가 한다)', () => {
    expect(mergeEnvelopes([])).toEqual({ cards: {}, notes: {}, evidence: {} })
  })
})

describe('dedupe', () => {
  it('순서를 지키며 먼저 나온 줄을 남긴다', () => {
    expect(dedupe(['가', '나', '가', '다'])).toEqual(['가', '나', '다'])
  })
})
