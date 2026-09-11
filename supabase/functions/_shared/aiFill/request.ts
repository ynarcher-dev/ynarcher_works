// [AI 작성하기] 요청에서 값을 읽는 규칙 — 클라이언트가 보낸 것을 그대로 믿지 않는다.
//
// 진입점에서 뗀 이유는 줄 수가 아니라 **검증할 수 있는 자리로 옮기기 위해서**다. 여기 담긴
// 판정은 잘못되면 조용히 틀린다 — 모르는 카드 키가 통과하면 프롬프트가 깨진다.
//
// 카드별 자료 배정(`assignments`)은 2026-09-09에 격자와 함께 걷었다. 자료는 한 벌이고 화면이
// 상 칸에 세운 것만 요청에 실려 오므로, 서버가 배정을 다시 읽을 자리가 없다.
//
// 카드 키의 목록을 상수로 갖지 않고 판정 함수를 받는 것이 요점이다. 대상마다 카드가 다르므로
// 여기서 목록을 알면 프로파일이 둘로 갈린다.
//
// Deno API를 쓰지 않는다(works vitest가 이 판정을 직접 돌린다).
// 근거: docs/docs_planning/3_3_5_startup_ai_fill.md §8.1

import { GROUP_CONCURRENCY } from './limits.ts'

/** 요청에서 카드 키 목록을 읽는다. 알 수 없는 값은 버린다(클라이언트를 그대로 믿지 않는다). */
export function readCards<K extends string>(raw: unknown, isCardKey: (v: unknown) => v is K): K[] {
  const list = Array.isArray(raw) ? raw : []
  return list.filter(isCardKey)
}

/**
 * 동시에 보낼 요청 수.
 *
 * 값은 코드가 갖되 **시크릿으로 내릴 수 있게** 둔다. 요율 티어가 낮은 키에서는 셋도 몰림으로
 * 읽히는데, 그것은 배포 없이 고쳐야 하는 종류의 문제다. 올리는 쪽의 상한은 **묶음 수의 최대**다
 * (STARTUP 다섯 축, 2026-09-11) — 묶음이 줄을 서면 뒤에 선 것이 예산을 잃고(넷째 묶음이 앞 둘이
 * 끝난 뒤 51초만 들고 나가 헤지도 못 세웠다), 그보다 올려서 얻는 것은 없다.
 */
export const MAX_CONCURRENCY = 5

export function readConcurrency(raw: string | undefined): number {
  const value = Number(raw)
  if (!Number.isFinite(value) || value < 1) return GROUP_CONCURRENCY
  return Math.min(Math.trunc(value), MAX_CONCURRENCY)
}

/**
 * 모델이 답하기 전에 **속으로 생각하는 깊이**.
 *
 * 이 축을 연 이유는 비용과 시간 둘 다다. 생각은 **출력 요금으로 청구되고**(입력의 다섯 배)
 * 실측에서 한 요청이 생각에만 26,969토큰·84초를 쓴 날이 있었다 — 그 한 건이 전체 상한(125초)을
 * 먹어 같은 실행의 다른 카드가 시간 초과로 빠졌다. 자료에서 값을 옮겨 적는 일에 그만한 궁리는
 * 필요하지 않다.
 */
export type ThinkingLevel = 'low' | 'medium' | 'high'

const THINKING_LEVELS: ReadonlySet<string> = new Set<ThinkingLevel>(['low', 'medium', 'high'])

/**
 * 생각 깊이를 시크릿에서 읽는다. **기본값은 `low`**이고 값이 이상하면 기본값으로 떨어진다.
 *
 * 기본을 낮게 두는 것은 이 기능이 하는 일이 추론이 아니라 **옮겨 적기**이기 때문이다. 다만
 * 코드에 박지 않고 시크릿으로 여는 이유는 품질이 실제로 떨어지는 날 **재배포 없이** 되돌려야
 * 하기 때문이다(요율 상한을 `GEMINI_MAX_CONCURRENCY`로 조이는 것과 같은 규약).
 *
 * **끄는 값은 두지 않는다** — 공급자가 Flash 계열의 전면 해제를 받지 않으므로, 없는 값을
 * 선택지로 두면 그것을 고른 날 요청이 통째로 거절된다.
 */
export function readThinkingLevel(raw: string | undefined): ThinkingLevel {
  const value = (raw ?? '').trim().toLowerCase()
  return THINKING_LEVELS.has(value) ? (value as ThinkingLevel) : 'low'
}
