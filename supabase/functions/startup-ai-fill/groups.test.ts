import { describe, expect, it } from 'vitest'
import { CARD_KEYS, type CardKey } from './cards.ts'
import { planGroups } from '../_shared/aiFill/groups.ts'
import { startupProfile } from './profile.ts'

/** 이 프로파일의 축. 엔진은 순서·축을 모르고 프로파일에서 받는다. */
const OPTS = { order: startupProfile.cardKeys, family: startupProfile.family }

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

describe('planGroups — 자료 조합과 탐색 축이 묶음을 정한다', () => {
  it('열두 카드가 세 자료 조합이어도 서로 다른 탐색 축은 나뉜다', () => {
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
      OPTS,
    )
    expect(groups).toHaveLength(4)
    expect(groups.map((g) => g.cards.length)).toEqual([4, 2, 2, 4])
    expect(groups[3].sourceKeys).toEqual(['c'])
  })

  it('전부 같은 자료를 읽어도 네 탐색 축으로 자동 분할한다', () => {
    const grid = Object.fromEntries(ALL.map((k) => [k, KEYS]))
    const groups = planGroups(ALL, grid, KEYS, OPTS)
    expect(groups).toHaveLength(4)
    expect(groups.map((g) => g.cards)).toEqual([
      ['basics', 'summary', 'business', 'tech'],
      ['team', 'ip'],
      ['timeline', 'traction'],
      ['revenue', 'employee', 'shareholders', 'investment'],
    ])
    expect(groups.every((g) => g.sourceKeys.join(',') === KEYS.join(','))).toBe(true)
  })

  it('같은 자료를 읽는 카드가 네 개 이하면 탐색 축이 달라도 한 요청이다', () => {
    const cards = ['team', 'timeline', 'employee', 'investment'] as CardKey[]
    const grid = Object.fromEntries(cards.map((k) => [k, ['a']]))
    expect(planGroups(cards, grid, KEYS, OPTS)).toEqual([{ cards, sourceKeys: ['a'] }])
  })

  it('같은 자료를 읽는 카드가 다섯 개부터 탐색 축으로 나눈다', () => {
    const cards = ['basics', 'tech', 'team', 'timeline', 'investment'] as CardKey[]
    const grid = Object.fromEntries(cards.map((k) => [k, ['a']]))
    expect(planGroups(cards, grid, KEYS, OPTS).map((g) => g.cards)).toEqual([
      ['basics', 'tech'],
      ['team'],
      ['timeline'],
      ['investment'],
    ])
  })

  it('배정이 아예 없으면 모든 카드가 자료 전부를 읽는다(격자 이전 요청 호환)', () => {
    const groups = planGroups(ALL, null, KEYS, OPTS)
    expect(groups).toHaveLength(4)
    expect(groups.every((g) => g.sourceKeys.join(',') === KEYS.join(','))).toBe(true)
    expect(groups.flatMap((g) => g.cards)).toEqual(ALL)
  })

  it('한 건도 배정되지 않은 카드는 요청에 들어가지 않는다', () => {
    const groups = planGroups(ALL, { business: ['a'], tech: [] }, KEYS, OPTS)
    expect(groups).toHaveLength(1)
    expect(groups[0].cards).toEqual(['business'])
  })

  it('빈 격자면 묶음이 없다 — 화면이 잠그지만 서버도 스스로 막는다', () => {
    expect(planGroups(ALL, {}, KEYS, OPTS)).toEqual([])
    expect(planGroups([], null, KEYS, OPTS)).toEqual([])
  })
})

describe('planGroups — 같은 조합은 순서가 달라도 한 묶음이다', () => {
  it('배열 순서만 다른 조합을 두 묶음으로 가르지 않는다', () => {
    // 갈리면 같은 자료를 두 번 올려 두 번 읽히게 된다 — 토큰이 두 배가 되고 답도 갈린다.
    const groups = planGroups(['business', 'tech'] as CardKey[], { business: ['a', 'b'], tech: ['b', 'a'] }, KEYS, OPTS)
    expect(groups).toHaveLength(1)
    expect(groups[0].sourceKeys).toEqual(['a', 'b'])
  })

  it('같은 탐색 축 안에서도 자료 조합이 다르면 나뉜다', () => {
    const groups = planGroups(['business', 'tech'] as CardKey[], { business: ['a'], tech: ['b'] }, KEYS, OPTS)
    expect(groups).toHaveLength(2)
    expect(groups.map((g) => g.sourceKeys)).toEqual([['a'], ['b']])
  })

  it('없는 자료 키는 버린다(클라이언트를 그대로 믿지 않는다)', () => {
    const groups = planGroups(['business'] as CardKey[], { business: ['a', '남의자료'] }, KEYS, OPTS)
    expect(groups[0].sourceKeys).toEqual(['a'])
  })

  it('있는 키가 하나도 없으면 그 카드는 빠진다', () => {
    expect(planGroups(['business'] as CardKey[], { business: ['없는키'] }, KEYS, OPTS)).toEqual([])
  })
})

describe('planGroups — 순서는 화면이 정한다', () => {
  it('체크한 차례가 아니라 화면 순서로 카드가 선다', () => {
    // 요청 순서를 그대로 쓰면 같은 조합인데 프롬프트가 달라져 실패를 재현할 수 없다.
    const groups = planGroups(['investment', 'basics', 'tech'] as CardKey[], null, KEYS, OPTS)
    expect(groups.map((group) => group.cards)).toEqual([['basics', 'tech', 'investment']])
    expect(groups.flatMap((group) => group.cards)).toEqual(['basics', 'tech', 'investment'])
  })
})
