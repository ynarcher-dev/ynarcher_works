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
 * 읽히는데, 그것은 배포 없이 고쳐야 하는 종류의 문제다. 올리는 쪽은 막는다 — 넷을 넘겨서
 * 얻는 시간보다 429로 잃는 시간이 크다.
 */
export function readConcurrency(raw: string | undefined): number {
  const value = Number(raw)
  if (!Number.isFinite(value) || value < 1) return GROUP_CONCURRENCY
  return Math.min(Math.trunc(value), 4)
}
