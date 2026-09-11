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

/** 자료 키 → 담당자가 손대기 전의 자리. 목록 전체를 보고 한 번에 세운다(아래 defaultPlacements). */
export type AiDefaults = Record<string, AiPlacement>

/** 파일명만 보는 자리. 참조 여부는 목록을 봐야 알므로 defaultPlacements가 뒤에 얹는다. */
function placementByName(source: AiSource): AiPlacement {
  return readsByDefault(sourceKindOf(source)) ? 'read' : 'skip'
}

/** 이 자료가 **남의 원장에서 끌어온 것**인가(자료 관리 카드의 참조 덩어리에 서는 줄). */
function isReference(source: AiSource): boolean {
  return source.kind === 'attachment' && Boolean(source.origin)
}

/**
 * 담당자가 손대기 전의 자리를 목록 전체에서 한 번에 세운다.
 *
 * 규칙 둘이다.
 *   1. **기본은 파일명이 정한다**(sourceKind.ts) — 아는 종류면 읽고, 모르면 읽지 않는다.
 *   2. **참조 자료는 내린다** — 다만 자기 자료가 하나라도 있을 때만(2026-09-11).
 *
 * 2번을 넣은 이유는 그 자료가 **이미 값으로 넘어가기** 때문이다. 셀러가 가리키는 기업의 매출·
 * 주주·대표자는 담당자가 그 자료를 보고 확정해 저장한 값이고, 서버가 그것을 '이미 확인된 사실'로
 * 프롬프트에 싣는다(ma-seller-quick-review/ledger.ts). 같은 사실을 얻으려고 그 값의 출처인 PDF를
 * 다시 읽히는 것은 쪽수만큼의 값을 한 번 더 치르는 일이다.
 *
 * **자기 자료가 하나도 없으면 이 규칙을 걸지 않는다.** 전부 참조인 요청에서 전부 내리면 읽을
 * 자료가 0건이 되어 창이 아무것도 못 하는 상태로 열린다 — 스타트업에서 기업을 끌어와 셀러를
 * 만들고 그 자리에서 초안까지 만드는 것은 정상 순서이고, 그 자리에서 문을 닫아서는 안 된다.
 *
 * 어느 쪽이든 **담당자의 이동이 언제나 이긴다** — 확정 값이 닿지 않는 것(제품 라인업의 세부·
 * 투자 포인트의 근거)이 그 자료에 있으면 한 번 눌러 올리면 된다.
 */
export function defaultPlacements(sources: AiSource[]): AiDefaults {
  const hasOwn = sources.some((s) => !isReference(s))
  const out: AiDefaults = {}
  for (const s of sources) {
    out[s.key] = hasOwn && isReference(s) ? 'skip' : placementByName(s)
  }
  return out
}

/** 목록 밖의 자료를 물으면 파일명만으로 답한다 — 목록을 모르는 자리에서도 규칙이 하나여야 한다. */
function defaultOf(defaults: AiDefaults, source: AiSource): AiPlacement {
  return defaults[source.key] ?? placementByName(source)
}

export function placementOf(set: AiReadSet, defaults: AiDefaults, source: AiSource): AiPlacement {
  return set[source.key] ?? defaultOf(defaults, source)
}

/** 한 줄을 옮긴다. 기본 자리로 돌아오면 기억에서 지운다. */
export function moveSource(
  set: AiReadSet,
  defaults: AiDefaults,
  source: AiSource,
  to: AiPlacement,
): AiReadSet {
  const next = { ...set }
  if (defaultOf(defaults, source) === to) delete next[source.key]
  else next[source.key] = to
  return next
}

/** 여러 줄을 한 방향으로. '전부 올리기·내리기'가 보이는 줄에만 거는 것은 호출자의 일이다. */
export function moveAll(
  set: AiReadSet,
  defaults: AiDefaults,
  sources: AiSource[],
  to: AiPlacement,
): AiReadSet {
  return sources.reduce((acc, s) => moveSource(acc, defaults, s, to), set)
}

/** 사라진 자료의 기억을 걷는다 — 지운 파일의 자리가 남아 있으면 같은 이름의 새 파일이 그 자리를 물려받는다. */
export function pruneReadSet(set: AiReadSet, liveKeys: string[]): AiReadSet {
  const live = new Set(liveKeys)
  const next: AiReadSet = {}
  for (const [key, value] of Object.entries(set)) if (live.has(key)) next[key] = value
  return next
}

/** 두 칸으로 가른다. 순서는 원래 목록 순서 그대로다(옮겨도 줄의 차례가 바뀌지 않는다). */
export function splitSources(
  set: AiReadSet,
  defaults: AiDefaults,
  sources: AiSource[],
): { read: AiSource[]; skip: AiSource[] } {
  const read: AiSource[] = []
  const skip: AiSource[] = []
  for (const s of sources) (placementOf(set, defaults, s) === 'read' ? read : skip).push(s)
  return { read, skip }
}
