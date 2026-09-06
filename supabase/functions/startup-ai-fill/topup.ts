// [AI 작성하기] 봉투에서 빠진 카드만 한 번 더 묻는다.
//
// **"실패한 카드"와 "빠진 카드"는 다르다.** 실패는 요청이 죽은 것이라 다시 부르면 같은
// 이유로 또 죽을 수 있고(그래서 재시도는 요청 안에서 이미 했다), 빠진 것은 요청은 성공했는데
// 모델이 그 카드를 봉투에 담지 않은 것이다. 뒤엣것은 출력이 길어질 때 실제로 일어나며, 같은
// 자료로 그 카드만 물으면 대개 답이 온다.
//
// **한 번만 더 묻는다.** 두 번째 보완이 답을 주는 경우는 드물고, 그 시간은 이미 손에 든
// 초안을 담당자에게 돌려주는 데 쓰는 편이 낫다. 그래도 비면 그 카드는 값 없이 남고, 화면은
// "자료에서 찾지 못했다"가 아니라 그대로 둔 카드로 말한다(병합이 기존 값을 지키므로 안전하다).
//
// 값이 `null`로 온 카드는 **빠진 것이 아니다** — 모델이 읽고 근거가 없다고 답한 것이라 다시
// 물어도 같은 답이다. 그 둘을 뭉치면 모든 실행이 보완 호출을 한 번씩 더 하게 된다.
//
// Deno API를 쓰지 않는다(works vitest가 이 판정을 직접 돌린다).
// 근거: docs/docs_planning/3_3_5_startup_ai_fill.md §16.6

import { CARD_KEYS, type CardKey } from './cards.ts'
import type { CardGroup } from './groups.ts'

/**
 * 답이 오지 않은 카드를 고른다.
 *
 * @param asked 이번 실행에서 물은 카드 전부.
 * @param answered 봉투에 **키가 있는** 카드(값이 null이어도 답한 것이다).
 * @param failed 요청 자체가 죽어 묻지 못한 카드.
 */
export function missingCards(asked: CardKey[], answered: string[], failed: CardKey[]): CardKey[] {
  const has = new Set(answered)
  const dead = new Set(failed)
  return CARD_KEYS.filter((k) => asked.includes(k) && !has.has(k) && !dead.has(k))
}

/**
 * 보완 요청 하나를 세운다. 자료는 **그 카드들에 배정됐던 것의 합집합**이다.
 *
 * 합집합인 이유는 빠진 카드가 여러 묶음에 걸쳐 있을 수 있어서다. 자료가 이미 조각으로 손에
 * 있으므로(새로 내려받지 않는다) 합쳐도 드는 것은 입력 토큰뿐이고, 나눠서 두 번 부르면
 * 보완이 '한 번'이라는 규칙이 깨진다.
 */
export function planTopup(missing: CardKey[], groups: CardGroup[]): CardGroup | null {
  if (missing.length === 0) return null
  const keys = new Set<string>()
  for (const g of groups) {
    if (!g.cards.some((c) => missing.includes(c))) continue
    for (const k of g.sourceKeys) keys.add(k)
  }
  if (keys.size === 0) return null
  return { cards: missing, sourceKeys: [...keys] }
}
