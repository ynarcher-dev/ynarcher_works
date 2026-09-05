import { describe, expect, it } from 'vitest'
import { CARD_KEYS, type CardKey } from './cards.ts'
import { planGroups } from './groups.ts'

/**
 * 묶음 분할 회귀 테스트.
 *
 * 여기서 지키는 것은 성능이 아니라 **담당자가 고른 것과 나가는 요청이 같다**는 것이다.
 * 배정이 어긋나면 재무 카드가 발표 자료를 읽고, 그 결과는 조용히 그럴듯한 숫자로 폼에 앉는다 —
 * 화면만 보고는 무엇이 틀렸는지 알 수 없는 종류의 사고다.
 *
 * 근거: docs/docs_planning/3_3_5_startup_ai_fill.md §8.3
 */

const ALL = [...CARD_KEYS]
const KEYS = ['a', 'b', 'c']

describe('planGroups — 자료 조합이 묶음을 정한다', () => {
  it('열두 카드가 세 조합이면 세 묶음이다', () => {
    const groups = planGroups(
      ALL,
      {
        basics: ['a'],
        summary: ['a'],
        business: ['a'],
        tech: ['a'],
        team: ['a'],
        ip: ['a'],
        timeline: ['b'],
        traction: ['b'],
        revenue: ['c'],
        employee: ['c'],
        shareholders: ['c'],
        investment: ['c'],
      },
      KEYS,
    )
    expect(groups).toHaveLength(3)
    expect(groups.map((g) => g.cards.length)).toEqual([6, 2, 4])
    expect(groups[2].sourceKeys).toEqual(['c'])
  })

  it('전부 같은 자료를 읽으면 한 요청이다(종전과 같은 동작)', () => {
    const grid = Object.fromEntries(ALL.map((k) => [k, KEYS]))
    const groups = planGroups(ALL, grid, KEYS)
    expect(groups).toHaveLength(1)
    expect(groups[0].cards).toEqual(ALL)
  })

  it('배정이 아예 없으면 모든 카드가 자료 전부를 읽는다(격자 이전 요청 호환)', () => {
    const groups = planGroups(ALL, null, KEYS)
    expect(groups).toHaveLength(1)
    expect(groups[0].sourceKeys).toEqual(KEYS)
    expect(groups[0].cards).toEqual(ALL)
  })

  it('한 건도 배정되지 않은 카드는 요청에 들어가지 않는다', () => {
    const groups = planGroups(ALL, { business: ['a'], tech: [] }, KEYS)
    expect(groups).toHaveLength(1)
    expect(groups[0].cards).toEqual(['business'])
  })

  it('빈 격자면 묶음이 없다 — 화면이 잠그지만 서버도 스스로 막는다', () => {
    expect(planGroups(ALL, {}, KEYS)).toEqual([])
    expect(planGroups([], null, KEYS)).toEqual([])
  })
})

describe('planGroups — 같은 조합은 순서가 달라도 한 묶음이다', () => {
  it('배열 순서만 다른 조합을 두 묶음으로 가르지 않는다', () => {
    // 갈리면 같은 자료를 두 번 올려 두 번 읽히게 된다 — 토큰이 두 배가 되고 답도 갈린다.
    const groups = planGroups(['business', 'tech'] as CardKey[], { business: ['a', 'b'], tech: ['b', 'a'] }, KEYS)
    expect(groups).toHaveLength(1)
    expect(groups[0].sourceKeys).toEqual(['a', 'b'])
  })

  it('없는 자료 키는 버린다(클라이언트를 그대로 믿지 않는다)', () => {
    const groups = planGroups(['business'] as CardKey[], { business: ['a', '남의자료'] }, KEYS)
    expect(groups[0].sourceKeys).toEqual(['a'])
  })

  it('있는 키가 하나도 없으면 그 카드는 빠진다', () => {
    expect(planGroups(['business'] as CardKey[], { business: ['없는키'] }, KEYS)).toEqual([])
  })
})

describe('planGroups — 순서는 화면이 정한다', () => {
  it('체크한 차례가 아니라 화면 순서로 카드가 선다', () => {
    // 요청 순서를 그대로 쓰면 같은 조합인데 프롬프트가 달라져 실패를 재현할 수 없다.
    const groups = planGroups(['investment', 'basics', 'tech'] as CardKey[], null, KEYS)
    expect(groups[0].cards).toEqual(['basics', 'tech', 'investment'])
  })
})
