// [AI 작성하기] 요청에서 값을 읽는 규칙 — 클라이언트가 보낸 것을 그대로 믿지 않는다.
//
// index에서 뗀 이유는 줄 수가 아니라 **검증할 수 있는 자리로 옮기기 위해서**다. 여기 담긴
// 세 판정은 잘못되면 조용히 틀린다 — 모르는 카드 키가 통과하면 프롬프트가 깨지고, 배정을
// 잘못 읽으면 고르지 않은 자료가 모델에 들어간다.
//
// Deno API를 쓰지 않는다(works vitest가 이 판정을 직접 돌린다).
// 근거: docs/docs_planning/3_3_5_startup_ai_fill.md §8.1

import { isCardKey, type CardKey } from './cards.ts'
import type { Assignments } from './groups.ts'
import { GROUP_CONCURRENCY } from './limits.ts'

/** 요청에서 카드 키 목록을 읽는다. 알 수 없는 값은 버린다(클라이언트를 그대로 믿지 않는다). */
export function readCards(raw: unknown): CardKey[] {
  const list = Array.isArray(raw) ? raw : []
  return list.filter(isCardKey) as CardKey[]
}

/**
 * 카드별 자료 배정(격자)을 읽는다.
 *
 * **객체가 아예 오지 않았을 때만 null이고, 그때는 모든 카드가 자료 전부를 읽는다** — 격자
 * 이전의 화면이 보낸 요청도 그대로 돌아야 하고, 그때의 동작이 한 요청이었다.
 *
 * 객체가 왔는데 쓸 수 있는 줄이 하나도 없으면 **빈 배정**을 돌려준다(null이 아니다). 둘을
 * 가르지 않으면 "격자를 보냈는데 전부 걸러진" 요청이 "격자를 안 보낸" 요청과 같아져, 아무것도
 * 고르지 않았는데 자료 전부를 읽는 일이 된다. 빈 배정은 묶음 0개가 되어 400으로 막힌다.
 */
export function readAssignments(raw: unknown): Assignments | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const out: Assignments = {}
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!isCardKey(key) || !Array.isArray(value)) continue
    out[key] = value.map((v) => String(v)).filter(Boolean)
  }
  return out
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
