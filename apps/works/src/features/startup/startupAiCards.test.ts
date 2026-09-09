import { describe, expect, it } from 'vitest'
import {
  CARD_KEYS as SERVER_CARD_KEYS,
  CARD_LABELS as SERVER_CARD_LABELS,
  CARD_SHAPE as SERVER_CARD_SHAPE,
} from '../../../../../supabase/functions/startup-ai-fill/cards.ts'
import { AI_CARDS, AI_CARD_KEYS, AI_CARD_LABEL } from '@/features/startup/startupAiCards'

/**
 * 카드 목록은 화면과 서버가 한 벌이다.
 *
 * 서버 `cards.ts`의 머리 주석이 오래전부터 "works 쪽 vitest가 두 목록이 같은지 확인한다"고
 * 적고 있었는데 **그 시험이 실제로는 없었다**(M&A 퀵 리뷰에만 있었다). 카드를 12종에서 15종으로
 * 가르면서 그 빈자리가 실제 위험이 됐으므로 여기서 채운다 — 어긋나면 화면이 보낸 카드 키를
 * 서버가 조용히 걸러 내고(모르는 키는 버린다) 담당자에게는 "그 카드만 빈 채로 왔다"로 보인다.
 * 오류가 나지 않으므로 시험이 아니면 드러날 자리가 없다.
 *
 * 순서까지 보는 이유는 그것이 곧 **요청 순서**이기 때문이다 — 갈리면 같은 조합인데 서버가
 * 다른 프롬프트를 만든다.
 */
describe('카드 목록은 화면과 서버가 한 벌이다', () => {
  it('키와 순서가 서버 cards.ts와 같다', () => {
    expect([...AI_CARD_KEYS]).toEqual([...SERVER_CARD_KEYS])
  })

  it('라벨도 같다 — 결과 안내가 서버 오류 메시지와 다른 이름을 부르지 않는다', () => {
    expect(AI_CARD_LABEL).toEqual(SERVER_CARD_LABELS)
  })

  it('카드 정의의 순서도 키 목록과 같다(격자·프롬프트가 이 순서를 함께 쓴다)', () => {
    expect(AI_CARDS.map((c) => c.key)).toEqual([...AI_CARD_KEYS])
  })

  it('목록형 카드에는 건수를 세는 함수가 있다 — 배지가 "3건"을 말할 근거다', () => {
    // 서버의 shape이 목록('array')인 카드는 화면에서도 건수를 셀 수 있어야 한다. 없으면
    // 배지가 값이 있다는 사실만 말하고 얼마나 있는지는 답하지 못한다.
    const listCards = AI_CARDS.filter((c) => SERVER_CARD_SHAPE[c.key] === 'array')
    expect(listCards.length).toBeGreaterThan(0)
    for (const card of listCards) expect(card.count, card.key).toBeTypeOf('function')
  })
})
