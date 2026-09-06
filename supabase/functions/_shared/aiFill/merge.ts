// [AI 작성하기] 묶음별 결과를 하나의 봉투로 합친다.
//
// 카드 키가 묶음끼리 겹치지 않으므로(한 카드는 한 묶음에만 든다) 합치는 일은 키를 얹는 것이
// 전부다. 그래도 파일을 따로 둔 이유는 **합치면서 잃기 쉬운 것**이 있어서다 — 못 읽은 자료
// 사유(`skippedSources`)는 묶음마다 같은 줄이 반복되므로(자료는 한 벌이고 묶음만 여럿이다)
// 그대로 이으면 담당자에게 같은 문장이 여섯 번 선다.
//
// Deno API를 쓰지 않는다(works vitest가 이 판정을 직접 돌린다).
// 근거: docs/docs_planning/3_3_5_startup_ai_fill.md §8.3

import type { DraftEnvelope } from './envelope.ts'

export type { DraftEnvelope }

/** 순서를 지키며 중복을 걷는다. 먼저 나온 줄이 남는다(자료 순서가 곧 담당자가 고른 순서다). */
export function dedupe(lines: string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const line of lines) {
    if (seen.has(line)) continue
    seen.add(line)
    out.push(line)
  }
  return out
}

/**
 * 성공한 묶음의 봉투를 하나로 합친다.
 *
 * 실패한 묶음은 애초에 여기 오지 않는다 — 실패는 값이 아니라 `failedCards`로 따로 말한다.
 * 빈 목록을 넣으면 빈 봉투가 나오고, 그 판정(전부 실패)은 호출자가 한다.
 */
export function mergeEnvelopes<K extends string>(envelopes: DraftEnvelope<K>[]): DraftEnvelope<K> {
  const merged: DraftEnvelope<K> = { cards: {}, notes: {}, evidence: {} }
  for (const e of envelopes) {
    Object.assign(merged.cards, e.cards)
    Object.assign(merged.notes, e.notes)
    Object.assign(merged.evidence, e.evidence)
  }
  return merged
}
