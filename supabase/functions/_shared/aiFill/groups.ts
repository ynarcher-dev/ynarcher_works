// [AI 작성하기] 카드를 요청 묶음으로 가른다 — 작은 일은 합치고 큰 일만 탐색 축으로 나눈다.
//
// 담당자가 고르는 것은 **읽을 자료 한 벌과 작성할 카드**다(2026-09-09 개정 — 카드마다 자료를
// 배정하던 격자를 걷었다). 그래서 모든 묶음이 같은 자료를 읽고, 묶음을 가르는 축은 탐색 축
// 하나뿐이다. 카드가 네 개 이하면 한 요청으로 끝내고, 다섯 개 이상일 때만 탐색 축으로 가른다.
// 소수 카드까지 축마다 나누면 같은 큰 PDF를 여러 번 훑느라 오히려 시간 초과가 난다.
//
// **탐색 축을 없애지 않는 이유**는 그대로다. 축을 합치면 한 요청의 출력이 길어져 답이 잘리고
// (`finishReason: MAX_TOKENS`) 카드별 탐색이 얕아진다. 다만 자료가 한 벌이 된 뒤로 축마다 같은
// 자료를 다시 싣는 비용은 **컨텍스트 캐시**가 접는다(run.ts) — 격자 시절에는 묶음마다 자료
// 조합이 달라 캐시 하나로 묶을 수 없었고, 그것이 이 개정에서 격자를 걷은 두 이유 중 하나다.
//
// Deno API를 쓰지 않는다(works vitest가 이 판정을 직접 돌린다).
// 근거: docs/docs_planning/3_3_7_ai_fill_visual_read.md §6

/** 한 번의 모델 요청이 될 묶음. */
export interface CardGroup<K extends string = string> {
  /** 이 요청이 채울 카드. 프로파일이 정한 화면 순서로 선다. */
  cards: K[]
  /** 이 요청이 읽을 자료 키. 지금은 모든 묶음이 같은 목록을 든다. */
  sourceKeys: string[]
}

/** 이 수까지는 문서를 한 번만 읽는 편이 출력 여유보다 이득이다. */
export const SINGLE_REQUEST_MAX_CARDS = 4

export interface PlanOptions<K extends string> {
  /** 카드 키를 화면 순서로 담은 목록. 요청 순서를 쓰지 않는 근거다. */
  order: readonly K[]
  /** 카드 → 탐색 축. 서로 맞물리는 카드는 같은 축에 둔다. */
  family: Record<K, string>
  /** 이 수를 넘을 때만 탐색 축으로 가른다. */
  singleMax?: number
}

/**
 * 카드를 묶음으로 가른다. 자료는 한 벌이라 묶음마다 같다.
 *
 * @param cards 담당자가 고른 카드(요청 순서는 무시하고 화면 순서로 다시 세운다).
 * @param sourceKeys 실제로 읽을 자료의 키. 비어 있으면 묶음이 없다 — 읽을 것이 없는 카드에
 *   모델을 부르면 근거 없는 값을 지어낼 자리만 만든다.
 */
export function planGroups<K extends string>(
  cards: K[],
  sourceKeys: string[],
  opts: PlanOptions<K>,
): CardGroup<K>[] {
  if (sourceKeys.length === 0) return []
  // 카드 순서는 요청 순서가 아니라 화면 순서로 고정한다(프롬프트 조립과 같은 이유 —
  // 같은 조합인데 체크한 차례에 따라 요청이 달라지면 실패를 재현할 수 없다).
  const ordered = opts.order.filter((k) => cards.includes(k))
  if (ordered.length === 0) return []
  const singleMax = opts.singleMax ?? SINGLE_REQUEST_MAX_CARDS

  // 묶음마다 사본을 든다 — 한 배열을 나눠 쥐면 어느 묶음의 수정이 다른 묶음에 번진다.
  if (ordered.length <= singleMax) return [{ cards: ordered, sourceKeys: [...sourceKeys] }]

  // 카드가 많을 때만 탐색 축으로 가른다. 열두 카드 전체 선택은 네 요청으로 나뉘지만,
  // 팀·연혁·고용·투자 네 카드처럼 작은 요청은 같은 문서를 한 번만 읽는다.
  const buckets = new Map<string, CardGroup<K>>()
  for (const card of ordered) {
    const family = opts.family[card]
    const found = buckets.get(family)
    if (found) found.cards.push(card)
    else buckets.set(family, { cards: [card], sourceKeys: [...sourceKeys] })
  }
  return [...buckets.values()]
}
