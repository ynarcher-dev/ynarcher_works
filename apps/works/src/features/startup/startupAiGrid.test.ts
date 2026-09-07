import { describe, expect, it } from 'vitest'
import { AI_CARDS, AI_CARD_KEYS } from '@/features/startup/startupAiCards'
import {
  cellCount,
  cellOn,
  cardCountFor,
  gridCards,
  gridSourceKeys,
  pruneGrid,
  toggleCard,
  toggleCardGroup,
  toggleCell,
  toggleGrid,
  toggleSource,
  type AiGrid,
} from '@/features/startup/startupAiGrid'

/**
 * 격자 상태 회귀 테스트.
 *
 * 여기서 지키는 것은 **화면이 보여 준 것과 서버로 가는 배정이 같다**는 것이다. 어긋나면
 * 재무 카드가 담당자가 빼 둔 발표 자료를 읽고, 그 결과는 그럴듯한 숫자로 조용히 폼에 앉는다.
 *
 * 근거: docs/docs_planning/3_3_5_startup_ai_fill.md §4.2
 */

const KEYS = ['a', 'b', 'c']
const CARDS = [...AI_CARD_KEYS]

describe('카드 탐색 묶음', () => {
  it('서버가 나눠 읽는 네 묶음과 같은 카드 구성이다', () => {
    const keysOf = (group: (typeof AI_CARDS)[number]['group']) =>
      AI_CARDS.filter((card) => card.group === group).map((card) => card.key)

    expect(keysOf('overview')).toEqual(['basics', 'summary', 'business', 'tech'])
    expect(keysOf('organization')).toEqual(['team', 'ip'])
    expect(keysOf('growth')).toEqual(['timeline', 'traction'])
    expect(keysOf('capital')).toEqual(['revenue', 'employee', 'shareholders', 'investment'])
  })
})

describe('칸·줄·열 토글', () => {
  it('칸 하나를 켰다 끈다', () => {
    const on = toggleCell({}, 'business', 'a')
    expect(cellOn(on, 'business', 'a')).toBe(true)
    expect(cellOn(toggleCell(on, 'business', 'a'), 'business', 'a')).toBe(false)
  })

  it('줄은 켜져 있으면 끄고, 꺼져 있으면 전부 켠다', () => {
    const half: AiGrid = { business: ['a'] }
    expect(toggleCard(half, 'business', KEYS).business).toEqual([])
    expect(toggleCard({}, 'business', KEYS).business).toEqual(KEYS)
  })

  it('열은 모든 카드에서 함께 켜지고 함께 꺼진다', () => {
    const on = toggleSource({}, 'b', CARDS)
    expect(cardCountFor(on, 'b', CARDS)).toBe(CARDS.length)
    expect(cardCountFor(toggleSource(on, 'b', CARDS), 'b', CARDS)).toBe(0)
  })

  it('카드 묶음은 묶음 안의 카드만 함께 켜고 끈다', () => {
    const group = ['basics', 'summary', 'business', 'tech'] as const
    const on = toggleCardGroup({}, [...group], KEYS)
    expect(on.basics).toEqual(KEYS)
    expect(on.tech).toEqual(KEYS)
    expect(on.team).toBeUndefined()

    const off = toggleCardGroup({ ...on, team: ['a'] }, [...group], KEYS)
    expect(off.basics).toEqual([])
    expect(off.tech).toEqual([])
    expect(off.team).toEqual(['a'])
  })

  it('열을 끌 때 다른 열의 칸은 남는다', () => {
    const grid = toggleSource(toggleSource({}, 'a', CARDS), 'b', CARDS)
    const off = toggleSource(grid, 'a', CARDS)
    expect(cardCountFor(off, 'a', CARDS)).toBe(0)
    expect(cardCountFor(off, 'b', CARDS)).toBe(CARDS.length)
  })

  it('전체 토글은 빈 격자를 다 채우고 채워진 격자를 비운다', () => {
    const full = toggleGrid({}, CARDS, KEYS)
    expect(cellCount(full)).toBe(CARDS.length * KEYS.length)
    expect(toggleGrid(full, CARDS, KEYS)).toEqual({})
    // 절반만 켜진 상태에서 누르면 비운다("켜져 있으면 끈다"가 규칙이다).
    expect(toggleGrid({ business: ['a'] }, CARDS, KEYS)).toEqual({})
  })
})

describe('격자에서 요청을 뽑는다', () => {
  it('한 칸이라도 켜진 카드만 작성 대상이다', () => {
    expect(gridCards({ business: ['a'], tech: [], team: undefined })).toEqual(['business'])
  })

  it('작성 대상은 체크한 차례가 아니라 화면 순서로 선다', () => {
    // 순서가 흔들리면 같은 조합인데 서버가 다른 프롬프트를 만든다.
    const grid: AiGrid = { investment: ['a'], basics: ['a'], tech: ['a'] }
    expect(gridCards(grid)).toEqual(['basics', 'tech', 'investment'])
  })

  it('자료는 카드가 몇이든 한 번만 센다(한 번 올려 함께 쓴다)', () => {
    const grid: AiGrid = { business: ['a', 'b'], tech: ['b'], team: ['a'] }
    expect(gridSourceKeys(grid).sort()).toEqual(['a', 'b'])
  })

  it('빈 격자는 카드도 자료도 없다', () => {
    expect(gridCards({})).toEqual([])
    expect(gridSourceKeys({})).toEqual([])
    expect(cellCount({})).toBe(0)
  })
})

describe('pruneGrid — 사라진 자료를 걷는다', () => {
  it('없는 자료를 가리키는 칸을 지운다', () => {
    // 남겨 두면 줄 머리가 3건이라 말하는데 실제로 읽는 것은 둘이 된다.
    const pruned = pruneGrid({ business: ['a', '지워진자료'], tech: ['지워진자료'] }, ['a'])
    expect(pruned.business).toEqual(['a'])
    expect(pruned.tech).toBeUndefined()
    expect(gridCards(pruned)).toEqual(['business'])
  })

  it('전부 사라지면 빈 격자다', () => {
    expect(pruneGrid({ business: ['x'] }, ['a'])).toEqual({})
  })
})
