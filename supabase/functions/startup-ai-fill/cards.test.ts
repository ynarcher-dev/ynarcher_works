import { describe, expect, it } from 'vitest'
import { CARD_KEYS, CARD_LABELS } from './cards.ts'
import { AI_CARD_KEYS, AI_CARD_LABEL } from '@/features/startup/startupAiCards'

/**
 * 화면과 서버의 카드 목록이 같은지 본다.
 *
 * 런타임이 달라(브라우저 / Deno) 모듈을 공유할 수 없으므로 목록이 두 곳에 있다. 어긋나면
 * 화면에서 고른 카드를 서버가 버리거나(체크했는데 아무 일도 안 일어남), 서버가 채운 카드를
 * 화면이 못 읽는다 — 둘 다 조용히 일어나 담당자는 원인을 알 수 없다.
 *
 * **순서까지 같아야 한다.** 프롬프트의 카드 순서를 화면 순서로 고정한 것이 이 목록이라,
 * 순서가 어긋나면 같은 조합인데 프롬프트가 달라진다.
 */
describe('카드 목록은 화면과 서버가 한 벌이다', () => {
  it('키와 순서가 같다', () => {
    expect([...CARD_KEYS]).toEqual([...AI_CARD_KEYS])
  })

  it('라벨이 같다', () => {
    for (const key of CARD_KEYS) {
      expect(CARD_LABELS[key], key).toBe(AI_CARD_LABEL[key as keyof typeof AI_CARD_LABEL])
    }
  })
})
