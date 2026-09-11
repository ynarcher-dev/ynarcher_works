import { describe, expect, it } from 'vitest'
import { CARD_KEYS, type CardKey } from './cards.ts'
import { planGroups } from '../_shared/aiFill/groups.ts'
import { startupProfile } from './profile.ts'

/** 이 프로파일의 축. 엔진은 순서·축을 모르고 프로파일에서 받는다. */
const OPTS = { order: startupProfile.cardKeys, family: startupProfile.family }

/**
 * 묶음 분할 회귀 테스트.
 *
 * 자료가 한 벌이 된 뒤(2026-09-09) 여기서 지키는 것은 둘 — **소수 카드는 한 요청**이고(같은 큰
 * PDF를 여러 번 훑지 않는다), **다수 카드는 탐색 축으로 갈리되 자료는 모든 묶음이 같다**(그래야
 * 컨텍스트 캐시 하나로 묶인다).
 *
 * 근거: docs/docs_planning/3_3_7_ai_fill_visual_read.md §6
 */

const ALL = [...CARD_KEYS]
const KEYS = ['a', 'b', 'c']

describe('planGroups — 탐색 축이 묶음을 정하고 자료는 한 벌이다', () => {
  it('열다섯 카드는 다섯 탐색 축으로 나뉘고 모든 묶음이 같은 자료를 든다', () => {
    // 2026-09-09에 카드가 셋 갈려 15개가 됐지만 축은 넷 그대로였다 — 갈린 카드가 갈리기 전의
    // 축을 물려받으므로 묶음 수가 아니라 묶음 안의 카드만 늘었다. 2026-09-11에 자본 축을
    // 결산·소유로 갈라 다섯이 됐다(다섯 장짜리 묶음이 실행 넷 중 셋에서 90초를 넘겼다).
    const groups = planGroups(ALL, KEYS, OPTS)
    expect(groups.map((g) => g.cards)).toEqual([
      ['basics', 'summary', 'business', 'tech'],
      ['team', 'ip', 'cert'],
      ['timeline', 'traction', 'customers'],
      ['revenue', 'finance'],
      ['employee', 'shareholders', 'investment'],
    ])
    expect(groups.every((g) => g.sourceKeys.join(',') === KEYS.join(','))).toBe(true)
  })

  it('카드가 네 개 이하면 탐색 축이 달라도 한 요청이다', () => {
    const cards = ['team', 'timeline', 'employee', 'investment'] as CardKey[]
    expect(planGroups(cards, KEYS, OPTS)).toEqual([{ cards, sourceKeys: KEYS }])
  })

  it('카드가 다섯 개부터 탐색 축으로 나눈다', () => {
    const cards = ['basics', 'tech', 'team', 'timeline', 'investment'] as CardKey[]
    expect(planGroups(cards, KEYS, OPTS).map((g) => g.cards)).toEqual([
      ['basics', 'tech'],
      ['team'],
      ['timeline'],
      ['investment'],
    ])
  })

  it('읽을 자료가 없으면 묶음이 없다 — 화면이 잠그지만 서버도 스스로 막는다', () => {
    expect(planGroups(ALL, [], OPTS)).toEqual([])
    expect(planGroups([], KEYS, OPTS)).toEqual([])
  })

  it('모르는 카드 키는 무시한다(클라이언트를 그대로 믿지 않는다)', () => {
    expect(planGroups(['business', 'nope' as CardKey], KEYS, OPTS)).toEqual([
      { cards: ['business'], sourceKeys: KEYS },
    ])
  })
})

describe('planGroups — 순서는 화면이 정한다', () => {
  it('체크한 차례가 아니라 화면 순서로 카드가 선다', () => {
    // 요청 순서를 그대로 쓰면 같은 조합인데 프롬프트가 달라져 실패를 재현할 수 없다.
    const groups = planGroups(['investment', 'basics', 'tech'] as CardKey[], KEYS, OPTS)
    expect(groups.map((group) => group.cards)).toEqual([['basics', 'tech', 'investment']])
  })

  it('돌려준 자료 목록은 사본이다 — 묶음이 원본 배열을 공유해 고치지 못한다', () => {
    const keys = ['a', 'b']
    const groups = planGroups(['business'] as CardKey[], keys, OPTS)
    groups[0].sourceKeys.push('c')
    expect(keys).toEqual(['a', 'b'])
  })
})
