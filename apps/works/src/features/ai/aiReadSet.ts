import { classifySourceKind, readsByDefault, type SourceKind } from '@docparse/sourceKind.ts'
import type { AiSource } from '@/features/ai/aiFillClient'

/**
 * 'AI 작성하기'의 자료 배치 — **읽을 자료(상)와 읽지 않을 자료(하)** 두 칸 사이의 이동.
 *
 * 종전의 카드×자료 격자를 이 둘로 바꿨다(2026-09-09 사용자 결정). 격자가 물었던 "어느 자료가
 * 어느 카드의 근거인가"는 담당자가 매번 열넷×열둘을 훑어야 답할 수 있는 물음이었고, 그 답이
 * 카드마다 갈리면 서버는 자료 조합마다 요청을 갈라 같은 자료를 여러 번 읽혔다. 지금 묻는 것은
 * 하나 — **이번에 AI가 읽을 자료가 무엇인가**다. 그 한 벌을 모든 카드가 함께 읽는다.
 *
 * **기본 자리는 파일명이 정하고 담당자의 이동이 언제나 이긴다.** 그래서 상태로 드는 것은 전체
 * 배치가 아니라 **기본값과 다른 줄만**(override)이다 — 자료가 새로 올라오면 그 줄은 자기 기본
 * 자리에 서고, 담당자가 옮긴 줄만 기억한다. 기본 자리로 되돌린 줄은 기억에서 지운다(같은 사실을
 * 두 곳에 적지 않는다).
 *
 * **저장하지 않는다.** 진입 버튼이 세션 동안 들고 있을 뿐이다(격자 시절과 같다). 첨부 행에
 * 적는 것은 참조 자료(남의 원장 행)에 이 화면이 값을 쓰는 일이 되어 미뤘다 — 기획서 열린 이슈.
 *
 * 근거: docs/docs_planning/3_3_7_ai_fill_visual_read.md §4
 */

export type AiPlacement = 'read' | 'skip'

/** 자료 키 → 담당자가 옮긴 자리. 기본 자리에 있는 줄은 여기 없다. */
export type AiReadSet = Record<string, AiPlacement>

/** 종류 판정에 쓰는 이름 — 링크는 주소(서버와 같은 규칙, parts.ts). */
function kindName(source: AiSource): string {
  if (source.kind === 'link') return source.url
  if (source.kind === 'attachment' && source.url) return source.url
  return source.name
}

/** 이 자료의 종류(파일명 판정). 줄의 회색 꼬리표와 서버의 프롬프트 꼬리표가 같은 값을 쓴다. */
export function sourceKindOf(source: AiSource): SourceKind {
  return classifySourceKind(kindName(source))
}

/** 담당자가 손대기 전의 자리. 모르면 읽지 않는 쪽이다(sourceKind.ts). */
export function defaultPlacement(source: AiSource): AiPlacement {
  return readsByDefault(sourceKindOf(source)) ? 'read' : 'skip'
}

export function placementOf(set: AiReadSet, source: AiSource): AiPlacement {
  return set[source.key] ?? defaultPlacement(source)
}

/** 한 줄을 옮긴다. 기본 자리로 돌아오면 기억에서 지운다. */
export function moveSource(set: AiReadSet, source: AiSource, to: AiPlacement): AiReadSet {
  const next = { ...set }
  if (defaultPlacement(source) === to) delete next[source.key]
  else next[source.key] = to
  return next
}

/** 여러 줄을 한 방향으로. '전부 올리기·내리기'가 보이는 줄에만 거는 것은 호출자의 일이다. */
export function moveAll(set: AiReadSet, sources: AiSource[], to: AiPlacement): AiReadSet {
  return sources.reduce((acc, s) => moveSource(acc, s, to), set)
}

/** 사라진 자료의 기억을 걷는다 — 지운 파일의 자리가 남아 있으면 같은 이름의 새 파일이 그 자리를 물려받는다. */
export function pruneReadSet(set: AiReadSet, liveKeys: string[]): AiReadSet {
  const live = new Set(liveKeys)
  const next: AiReadSet = {}
  for (const [key, value] of Object.entries(set)) if (live.has(key)) next[key] = value
  return next
}

/** 두 칸으로 가른다. 순서는 원래 목록 순서 그대로다(옮겨도 줄의 차례가 바뀌지 않는다). */
export function splitSources(set: AiReadSet, sources: AiSource[]): { read: AiSource[]; skip: AiSource[] } {
  const read: AiSource[] = []
  const skip: AiSource[] = []
  for (const s of sources) (placementOf(set, s) === 'read' ? read : skip).push(s)
  return { read, skip }
}
