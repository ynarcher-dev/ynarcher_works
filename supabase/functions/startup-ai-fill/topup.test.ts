import { describe, expect, it } from 'vitest'
import { missingCards, planTopup } from '../_shared/aiFill/topup.ts'
import { CARD_KEYS, type CardKey } from './cards.ts'
import type { CardGroup } from '../_shared/aiFill/groups.ts'

/**
 * 보완 호출과 분석 글자 주입의 회귀 테스트.
 *
 * 여기서 지키는 것 둘 — **보완이 한 번을 넘지 않는 것**(빠진 카드가 없으면 아예 나가지 않는다)과
 * **값이 null로 온 카드를 빠진 것으로 세지 않는 것**이다. 뒤엣것을 놓치면 모든 실행이 보완
 * 호출을 한 번씩 더 하게 되고, 그 시간은 이미 손에 든 초안을 돌려주는 데서 빠진다.
 *
 * 엔진의 판정이지만 **이 프로파일의 카드 순서·묶음**으로 검증한다 — 추상 키로 바꾸면
 * "화면 순서로 선다"가 무엇을 뜻하는지 시험이 스스로 말하지 못한다.
 *
 * 근거: docs/docs_planning/3_3_5_startup_ai_fill.md §16.6·§16.10
 */

describe('빠진 카드 고르기', () => {
  it('답이 온 카드는 값이 null이어도 빠진 것이 아니다', () => {
    expect(missingCards(['business', 'revenue'], ['business', 'revenue'], [], CARD_KEYS)).toEqual([])
  })

  it('봉투에 없고 실패하지도 않은 카드만 고른다', () => {
    expect(missingCards(['business', 'revenue', 'team'], ['business'], ['team'], CARD_KEYS)).toEqual(['revenue'])
  })

  it('화면 순서로 세운다(체크한 차례에 따라 요청이 달라지지 않게)', () => {
    expect(missingCards(['revenue', 'business'], [], [], CARD_KEYS)).toEqual(['business', 'revenue'])
  })
})

describe('보완 요청 세우기', () => {
  const groups: CardGroup<CardKey>[] = [
    { cards: ['business', 'summary'], sourceKeys: ['a', 'b'] },
    { cards: ['revenue'], sourceKeys: ['c'] },
  ]

  it('빠진 카드가 없으면 요청을 세우지 않는다', () => {
    expect(planTopup([], groups)).toBeNull()
  })

  it('빠진 카드들이 걸린 묶음의 자료를 합집합으로 모은다', () => {
    expect(planTopup(['business', 'revenue'], groups)).toEqual({
      cards: ['business', 'revenue'],
      sourceKeys: ['a', 'b', 'c'],
    })
  })

  it('가리키는 자료가 없으면 부르지 않는다(근거 없이 물으면 지어낼 자리만 생긴다)', () => {
    expect(planTopup(['ip'], groups)).toBeNull()
  })
})

