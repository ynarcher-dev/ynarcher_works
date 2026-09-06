// [AI 작성하기] 카드를 요청 묶음으로 가른다 — 작은 일은 합치고 큰 일만 탐색 축으로 나눈다.
//
// 담당자는 카드마다 읽을 자료를 지정하고 버튼은 한 번 누른다. 서버는 먼저 같은 자료 조합의
// 카드를 모은다. 그 일이 네 카드 이하면 한 요청으로 끝내고, 다섯 카드 이상일 때만 탐색 축으로
// 가른다. 소수 카드까지 축마다 나누면 같은 큰 PDF를 여러 번 훑느라 오히려 시간 초과가 난다.
//
// 두 축은 서로 다른 일을 한다.
//   * 자료 조합: 카드가 쓰지 않을 자료를 빼서 잡음을 줄인다.
//   * 탐색 축: 같은 자료를 읽어도 기업 개요와 재무표처럼 찾는 방식이 다른 일을 나눠 회수율과
//     출력 여유를 지킨다. 서로 맞물리는 카드(매출·고용·주주·투자)는 한 축에 남긴다.
//
// Deno API를 쓰지 않는다(works vitest가 이 판정을 직접 돌린다).
// 근거: docs/docs_planning/3_3_5_startup_ai_fill.md §4.2·§8.3

import { CARD_KEYS, type CardKey } from './cards.ts'

/** 카드 키 → 그 카드가 읽을 자료 키 목록. 화면의 격자가 그대로 실려 온다. */
export type Assignments = Record<string, string[]>

/** 한 번의 모델 요청이 될 묶음. */
export interface CardGroup {
  /** 이 요청이 채울 카드. 화면 순서(기본 2 → 역량 4 → 실적 6)로 선다. */
  cards: CardKey[]
  /** 이 요청이 읽을 자료 키. `allKeys` 순서를 그대로 물려받는다. */
  sourceKeys: string[]
}

/** 같은 자료를 읽더라도 한 요청에 함께 맡길 수 있는 카드 묶음. */
const EXTRACTION_FAMILY: Record<CardKey, 'overview' | 'organization' | 'growth' | 'capital'> = {
  basics: 'overview',
  summary: 'overview',
  business: 'overview',
  tech: 'overview',
  team: 'organization',
  ip: 'organization',
  timeline: 'growth',
  traction: 'growth',
  revenue: 'capital',
  employee: 'capital',
  shareholders: 'capital',
  investment: 'capital',
}

/** 이 수까지는 문서를 한 번만 읽는 편이 출력 여유보다 이득이다. */
export const SINGLE_REQUEST_MAX_CARDS = 4

/**
 * 카드와 배정을 묶음으로 가른다.
 *
 * @param cards 담당자가 고른 카드(요청 순서는 무시하고 화면 순서로 다시 세운다).
 * @param assignments 카드별 자료 배정. **없으면 모든 카드가 자료 전부를 읽는다** — 격자
 *   이전의 화면이 보낸 요청도 자료 선택은 그대로 호환한다.
 * @param allKeys 실제로 읽을 수 있는 자료의 키. 배정에 적힌 값 중 여기 없는 것은 버린다
 *   (클라이언트가 보낸 값을 그대로 믿지 않는다).
 *
 * 한 건도 배정되지 않은 카드는 **작성 대상이 아니다.** 별도의 카드 체크박스를 두지 않는
 * 화면의 규칙이 여기서 강제된다 — 읽을 것이 없는 카드에 모델을 부르면 근거 없는 값을
 * 지어낼 자리만 만든다.
 */
export function planGroups(
  cards: CardKey[],
  assignments: Assignments | null | undefined,
  allKeys: string[],
): CardGroup[] {
  // 카드 순서는 요청 순서가 아니라 화면 순서로 고정한다(프롬프트 조립과 같은 이유 —
  // 같은 조합인데 체크한 차례에 따라 요청이 달라지면 실패를 재현할 수 없다).
  const ordered = CARD_KEYS.filter((k) => cards.includes(k))
  const sourceBuckets = new Map<string, CardGroup>()

  for (const card of ordered) {
    // **되돌아갈 자리는 요청 단위이지 카드 단위가 아니다.** 배정이 아예 오지 않았으면 옛
    // 화면이므로 모든 카드가 자료 전부를 읽는다. 하지만 배정이 왔는데 그 안에 이 카드가
    // 없다면 그것은 "고르지 않았다"이지 "전부"가 아니다 — 카드마다 되돌아가면, 배정이 한 줄
    // 빠졌을 때 그 카드만 조용히 자료 전부를 읽어 담당자가 빼 둔 자료까지 근거로 삼는다.
    const wanted = new Set(assignments ? (assignments[card] ?? []) : allKeys)
    // 키 순서를 allKeys에서 물려받아 조합의 지문을 정규화한다. 배열 순서만 다른 같은 조합이
    // 두 묶음으로 갈리면 같은 자료를 두 번 읽히게 된다.
    const keys = allKeys.filter((k) => wanted.has(k))
    if (keys.length === 0) continue

    const sig = keys.join('\u0000')
    const found = sourceBuckets.get(sig)
    if (found) found.cards.push(card)
    else sourceBuckets.set(sig, { cards: [card], sourceKeys: keys })
  }

  const planned: CardGroup[] = []
  for (const sourceGroup of sourceBuckets.values()) {
    if (sourceGroup.cards.length <= SINGLE_REQUEST_MAX_CARDS) {
      planned.push(sourceGroup)
      continue
    }

    // 카드가 많을 때만 탐색 축을 지문에 더한다. 열두 카드 전체 선택은 여전히 네 요청으로
    // 나뉘지만, 팀·연혁·고용·투자 네 카드처럼 작은 요청은 같은 문서를 한 번만 읽는다.
    const familyBuckets = new Map<string, CardGroup>()
    for (const card of sourceGroup.cards) {
      const family = EXTRACTION_FAMILY[card]
      const found = familyBuckets.get(family)
      if (found) found.cards.push(card)
      else familyBuckets.set(family, { cards: [card], sourceKeys: sourceGroup.sourceKeys })
    }
    planned.push(...familyBuckets.values())
  }

  return planned
}
