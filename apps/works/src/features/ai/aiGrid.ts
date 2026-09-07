/**
 * 'AI 작성하기' 격자의 상태 — **카드마다 읽을 자료**.
 *
 * 종전에는 두 목록이었다: 읽을 자료 하나와 작성할 카드 하나. 두 목록은 "무엇을 읽는가"와
 * "무엇을 쓰는가"를 따로 물었고, 그 답을 잇는 일(어느 자료가 어느 카드의 근거인가)은 아무
 * 데서도 하지 않았다 — 고른 자료 전부가 고른 카드 전부에 들어갔다. 그래서 재무 카드에 IR
 * 자료 40쪽이 함께 들어가 확정 재무 대신 목표 매출이 들어오는 일을 막을 자리가 없었다.
 *
 * 격자는 그 둘을 한 번에 묻는다. 칸 하나가 "이 카드가 이 자료를 읽는다"이고, **한 칸도 켜지지
 * 않은 카드는 작성 대상이 아니다** — 그래서 카드 체크박스를 따로 두지 않는다(같은 값을 묻는
 * 컨트롤을 둘 두지 않는다).
 *
 * **이름은 화면의 축이 아니라 도메인을 가리킨다**(`toggleCard` / `toggleSource`). 축은 실제로
 * 한 번 뒤집혔고(카드가 행이었다가 열이 됐다) 그때 `toggleRow`라는 이름이 통째로 거짓이 됐다.
 * 무엇이 위아래로 서는지는 화면이 정할 일이고, 이 파일이 아는 것은 카드와 자료뿐이다.
 *
 * **카드 목록을 들지 않는다**(2026-09-07). 종전에는 스타트업의 열두 카드를 모듈 안에서 직접
 * 읽어 `cellCount`·`gridCards`·`pruneGrid`가 그 목록으로 훑었다. 대상이 둘이 되면 그 세 함수가
 * 언제나 스타트업 카드로만 세게 되므로(M&A 셀러의 칸은 세지 않는다) 목록은 인자로 받는다 —
 * 순서가 곧 요청 순서라 **화면 순서 그대로** 넘겨야 한다.
 *
 * 서버의 묶음 판정(`groups.ts`)과 짝이라 규칙이 어긋나면 담당자가 고른 것과 다른 요청이
 * 나가므로, 여기 규칙은 테스트가 지킨다.
 *
 * 근거: docs/docs_planning/3_3_5_startup_ai_fill.md §4.2
 */

/** 카드 키 → 그 카드가 읽을 자료 키. 값이 없거나 빈 배열이면 작성 대상이 아니다. */
export type AiGrid<K extends string = string> = Partial<Record<K, string[]>>

/** 그 카드가 읽는 자료. 없으면 빈 배열(호출부가 매번 `?? []`를 적지 않도록). */
export function sourcesOf<K extends string>(grid: AiGrid<K>, card: K): string[] {
  return grid[card] ?? []
}

/** 칸 하나가 켜져 있는가. */
export function cellOn<K extends string>(grid: AiGrid<K>, card: K, key: string): boolean {
  return sourcesOf(grid, card).includes(key)
}

/** 그 자료를 읽는 카드 수. 자료 줄의 체크 상태와 건수 표시가 함께 읽는다. */
export function cardCountFor<K extends string>(grid: AiGrid<K>, key: string, cards: K[]): number {
  return cards.filter((c) => cellOn(grid, c, key)).length
}

/** 켜진 칸의 총 수. 실행 버튼의 잠금과 "몇 칸 골랐는지" 표시가 읽는다. */
export function cellCount<K extends string>(grid: AiGrid<K>, cards: readonly K[]): number {
  return cards.reduce((sum, c) => sum + sourcesOf(grid, c).length, 0)
}

/**
 * 작성 대상 카드 — 한 칸이라도 켜진 카드.
 *
 * **화면 순서로 세운다.** 담당자가 체크한 차례로 세우면 같은 조합인데 요청이 달라져, 실패했을
 * 때 같은 요청을 다시 만들 수 없다. 그래서 `cards`는 화면 순서 그대로 와야 한다.
 */
export function gridCards<K extends string>(grid: AiGrid<K>, cards: readonly K[]): K[] {
  return cards.filter((c) => sourcesOf(grid, c).length > 0)
}

/** 켜진 칸이 가리키는 자료 전부(중복 없이). 자료는 카드가 몇이든 **한 번만** 올라간다. */
export function gridSourceKeys<K extends string>(grid: AiGrid<K>, cards: readonly K[]): string[] {
  const seen = new Set<string>()
  for (const card of cards) for (const key of sourcesOf(grid, card)) seen.add(key)
  return [...seen]
}

/** 칸 하나를 뒤집는다. */
export function toggleCell<K extends string>(grid: AiGrid<K>, card: K, key: string): AiGrid<K> {
  const keys = sourcesOf(grid, card)
  const next = keys.includes(key) ? keys.filter((k) => k !== key) : [...keys, key]
  return { ...grid, [card]: next }
}

/**
 * 카드 하나가 자료 전부를 읽게 하거나 아무것도 읽지 않게 한다.
 *
 * **켜져 있으면 끈다**가 규칙이다. 절반만 켜진 카드에서 누르면 꺼지고, 다시 누르면 전부
 * 켜진다 — 한 번에 어느 쪽으로 갈지 헷갈릴 자리가 있지만, 지금 상태를 보고 누르는 것이라
 * "켜진 것을 끈다"가 언제나 맞는 말이 된다. 몇 칸이 켜졌는지는 건수 표시가 답한다.
 */
export function toggleCard<K extends string>(grid: AiGrid<K>, card: K, allKeys: string[]): AiGrid<K> {
  return { ...grid, [card]: sourcesOf(grid, card).length > 0 ? [] : [...allKeys] }
}

/** 카드 묶음 전체를 켜거나 끈다. 일부만 켜져 있어도 한 번 누르면 묶음을 비운다. */
export function toggleCardGroup<K extends string>(
  grid: AiGrid<K>,
  cards: K[],
  allKeys: string[],
): AiGrid<K> {
  const on = cards.some((card) => sourcesOf(grid, card).length > 0)
  const next: AiGrid<K> = { ...grid }
  for (const card of cards) next[card] = on ? [] : [...allKeys]
  return next
}

/** 자료 하나를 모든 카드에서 켜거나 끈다. 규칙은 카드 쪽과 같다. */
export function toggleSource<K extends string>(
  grid: AiGrid<K>,
  key: string,
  cards: K[],
): AiGrid<K> {
  const on = cardCountFor(grid, key, cards) > 0
  const next: AiGrid<K> = { ...grid }
  for (const card of cards) {
    const keys = sourcesOf(next, card)
    next[card] = on ? keys.filter((k) => k !== key) : keys.includes(key) ? keys : [...keys, key]
  }
  return next
}

/** 격자 전체를 켜거나 끈다. 창을 빈 채로 여는 규칙이 있어 "한 번에 켜기"가 여기 있어야 한다. */
export function toggleGrid<K extends string>(
  grid: AiGrid<K>,
  cards: K[],
  allKeys: string[],
): AiGrid<K> {
  if (cellCount(grid, cards) > 0) return {}
  const next: AiGrid<K> = {}
  for (const card of cards) next[card] = [...allKeys]
  return next
}

/**
 * 사라진 자료를 격자에서 걷는다.
 *
 * 담당자가 실행 뒤에 자료를 지우거나 더할 수 있고, 그 사이 격자는 옛 키를 쥔 채 남는다.
 * 없는 자료를 가리키는 배정을 그대로 보내면 서버가 버리므로 결과는 같지만, **화면의 건수가
 * 거짓을 말하게 된다** — 3건이라 적혀 있는데 실제로 읽는 것은 둘이다.
 */
export function pruneGrid<K extends string>(
  grid: AiGrid<K>,
  validKeys: string[],
  cards: readonly K[],
): AiGrid<K> {
  const valid = new Set(validKeys)
  const next: AiGrid<K> = {}
  for (const card of cards) {
    const keys = sourcesOf(grid, card).filter((k) => valid.has(k))
    if (keys.length > 0) next[card] = keys
  }
  return next
}
