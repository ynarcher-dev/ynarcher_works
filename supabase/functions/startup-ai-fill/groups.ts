// [AI 작성하기] 카드를 요청 묶음으로 가른다 — 같은 자료를 읽는 카드끼리 한 번에.
//
// 담당자는 카드마다 읽을 자료를 지정하고 버튼은 한 번 누른다. 그 지정이 곧 묶음의 정의다 —
// **자료 조합이 같은 카드끼리 한 요청**이 되고, 조합이 다른 수만큼만 요청이 나간다.
//
// 카드 종류로 묶음을 고정하지 않는 이유는 셋이다.
//   * 고정 묶음은 **자료를 묶음마다 다시 읽힌다.** 재무제표를 역량 묶음에도 보내면 입력
//     토큰이 묶음 수만큼 늘고, 그 자료는 그 카드가 쓰지도 않는다.
//   * 나누는 목적이 **잡음 제거**이기 때문이다. 재무 카드에 IR 자료 40쪽이 함께 들어가면
//     모델이 확정 재무 대신 발표 자료의 목표 매출을 집어 온다. 무엇이 잡음인지는 카드 종류가
//     아니라 그 기업이 낸 자료가 정하므로 코드가 미리 답할 수 없다.
//   * 조합이 같으면 한 요청에 남으므로 **카드 간 일관성**(매출과 고용의 같은 연도 값)이 그
//     안에서는 그대로 지켜진다. 전부 같은 자료를 읽히면 지금과 똑같이 한 요청이다.
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

/**
 * 카드와 배정을 묶음으로 가른다.
 *
 * @param cards 담당자가 고른 카드(요청 순서는 무시하고 화면 순서로 다시 세운다).
 * @param assignments 카드별 자료 배정. **없으면 모든 카드가 자료 전부를 읽는다** — 격자
 *   이전의 화면이 보낸 요청도 그대로 돌아야 하고, 그때의 동작은 한 요청이었다.
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
  const buckets = new Map<string, CardGroup>()

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
    const found = buckets.get(sig)
    if (found) found.cards.push(card)
    else buckets.set(sig, { cards: [card], sourceKeys: keys })
  }

  return [...buckets.values()]
}
