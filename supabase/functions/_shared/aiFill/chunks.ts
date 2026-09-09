// [AI 작성하기] 자료를 **조각 단위**로 다룬다 — 모델에 넣는 최소 단위이자 근거의 주소.
//
// 종전에는 분석된 자료를 조각 배열에서 문자열 하나로 이어 붙여(`chunksToText`) 자료 한 건이
// 곧 한 덩이였다. 그 모양에서는 두 가지를 할 수 없다.
//   * **예산을 넘길 때 줄여 보내기.** 덩이는 쪼갤 수 없으니 자료를 통째로 버리는 수밖에 없었고,
//     담당자는 왜 그 자료가 초안에 반영되지 않았는지 알 수 없었다.
//   * **근거를 검증하기.** 모델이 "p.47"이라 적어도 그 문자열이 실제 자리인지 물어볼 대상이
//     우리에게 없었다.
//
// 그래서 조각마다 **이 요청 안에서만 통하는 짧은 id**를 붙인다. `s2#5`는 두 번째 자료의 여섯
// 번째 조각이다. 짧은 이유는 조각마다 프롬프트에 실리기 때문이고(첨부 uuid를 그대로 쓰면
// 조각 300개에 36자씩 든다), 요청 안에서만 통해도 되는 이유는 **파일명과 자리는 모델이 아니라
// 서버가 붙이기** 때문이다 — 모델은 자기가 본 조각을 가리키기만 하면 된다.
//
// 원본 그대로 보내는 자료(PDF·이미지)에는 조각이 없다. 그래도 자료 자체에는 id를 준다(`s2`) —
// 그래야 모델이 "이 문서에서 봤다"고 말할 수 있고, 우리는 그것을 **검증할 수 없는 근거**로
// 갈라 세울 수 있다. 검증하지 못하는 것과 지어낸 것은 다르다.
//
// Deno API를 쓰지 않는다(works vitest가 이 판정을 직접 돌린다).
// 근거: docs/docs_planning/3_3_5_startup_ai_fill.md §16.14

import type { ExtractChunk } from '../docParse/types.ts'
import type { SourceKind } from '../docParse/sourceKind.ts'
import { sourceHeader } from './sourceKinds.ts'

/** 한 요청이 다루는 자료 한 건의 표시. 조각이 없어도(원본 경로) 자리는 있다. */
export interface SourceRef {
  /** 모델에 보이는 짧은 id(`s1`). 요청 안에서만 통한다. */
  id: string
  /** 격자·배정이 쓰는 자료 키(첨부 uuid 또는 화면이 만든 키). */
  key: string
  name: string
  /** 감사·링크가 가리킬 첨부 행. 등록 모드 보류 자료는 null. */
  attachmentId: string | null
  /**
   * 파일명으로 판정한 자료 종류(재무제표·IR…). 모델에 꼬리표로 붙는다(sourceKinds.ts).
   *
   * 격자를 걷은 뒤(2026-09-09) 모든 카드가 같은 자료를 읽으므로, 확정 숫자를 어느 자료에서
   * 읽을지는 자료를 빼는 것이 아니라 이 꼬리표가 가른다.
   */
  kind: SourceKind
  /**
   * 이 자료의 근거를 원문과 대조할 수 있는가.
   *
   * 조각으로 세운 자료만 참이다. 원본을 그대로 보낸 자료는 우리 손에 글자가 없어 대조할
   * 대상이 없으므로 거짓이고, 그 자료를 가리킨 근거는 '미검증'으로 남는다.
   */
  verifiable: boolean
}

/** 모델에 넣는 최소 단위. */
export interface SourceChunk {
  /** 모델에 보이는 짧은 id(`s1#3`). */
  id: string
  source: SourceRef
  kind: string
  /** 사람이 읽는 자리(`시트: 손익`·`슬라이드 8`). 응답에 이 값을 **서버가** 붙인다. */
  location: string
  text: string
}

/** 근거를 되짚을 때 쓰는 이번 요청의 지도. 요청마다 다르다(본 것만 가리킬 수 있어야 한다). */
export interface ChunkIndex {
  chunks: Map<string, SourceChunk>
  sources: Map<string, SourceRef>
}

/** 자료 순번(0부터)으로 자료 id를 만든다. */
export function sourceId(index: number): string {
  return `s${index + 1}`
}

/** 추출 조각을 이번 요청의 조각으로 세운다. 순번은 배열 순서 그대로다(파서가 결정적이다). */
export function toSourceChunks(source: SourceRef, chunks: ExtractChunk[]): SourceChunk[] {
  const out: SourceChunk[] = []
  for (const [i, c] of chunks.entries()) {
    const text = typeof c?.text === 'string' ? c.text : ''
    if (!text.trim()) continue
    out.push({
      id: `${source.id}#${i + 1}`,
      source,
      kind: typeof c?.kind === 'string' ? c.kind : 'text',
      location: typeof c?.location === 'string' ? c.location : '',
      text,
    })
  }
  return out
}

/**
 * 조각 하나를 모델이 보는 모양으로.
 *
 * 머리글에 id와 자리를 함께 적는 이유는 둘이 다른 일을 하기 때문이다 — id는 **되짚을 주소**,
 * 자리는 모델이 문맥을 잡는 **읽을거리**다. 자리만 있으면 되짚을 수 없고, id만 있으면 모델이
 * 이 조각이 어디쯤인지 모른 채 값을 뽑는다.
 */
export function renderChunk(chunk: SourceChunk): string {
  const head = chunk.location ? `[${chunk.id} | ${chunk.location}]` : `[${chunk.id}]`
  return `${head}\n${chunk.text}`
}

/** 조각들을 한 자료분의 글로. 자료명이 맨 앞에 한 번 선다. */
export function renderSource(source: SourceRef, chunks: SourceChunk[]): string {
  return [sourceHeader(source), ...chunks.map(renderChunk)].join('\n\n')
}

const encoder = new TextEncoder()

/** 조각 하나가 요청에서 차지할 바이트(머리글 포함 — 예산은 실제로 실리는 값으로 센다). */
export function chunkBytes(chunk: SourceChunk): number {
  return encoder.encode(renderChunk(chunk)).length + 2
}

/** 예산 안에서 조각을 고른 결과. */
export interface ChunkSelection {
  kept: SourceChunk[]
  /** 예산에 밀려 빠진 조각 수. 0이면 전부 담겼다. */
  dropped: number
  bytes: number
}

/**
 * 예산 안에서 조각을 고른다.
 *
 * **예산 안에 들면 아무것도 고르지 않는다** — 이 기능이 채우는 카드 상당수는 "연도별 매출
 * 전부·투자 내역 전부"라, 고르는 순간 빠짐없이 뽑는다는 계약이 흔들린다. 그래서 선별은
 * 회수를 높이는 수단이 아니라 **버리는 것을 줄이는 수단**으로만 돈다. 종전에는 같은 자리에서
 * 자료를 통째로 버렸다.
 *
 * 골라야 할 때의 순서는 `rank`가 정하고, 담고 나면 **다시 문서 순서로 되돌린다** — 모델이 읽는
 * 순서가 문서 순서여야 앞뒤 문맥이 이어지고, 같은 조합이 언제나 같은 요청이 된다.
 */
export function selectChunks(
  chunks: SourceChunk[],
  budgetBytes: number,
  rank?: (chunk: SourceChunk) => number,
): ChunkSelection {
  const sizes = new Map<string, number>()
  let total = 0
  for (const c of chunks) {
    const size = chunkBytes(c)
    sizes.set(c.id, size)
    total += size
  }
  if (total <= budgetBytes) return { kept: chunks, dropped: 0, bytes: total }

  const order = new Map(chunks.map((c, i) => [c.id, i]))
  const queue = rank
    ? [...chunks].sort((a, b) => rank(b) - rank(a) || (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0))
    : chunks
  const kept: SourceChunk[] = []
  let used = 0
  for (const c of queue) {
    const size = sizes.get(c.id) ?? 0
    if (used + size > budgetBytes) continue
    kept.push(c)
    used += size
  }
  kept.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0))
  return { kept, dropped: chunks.length - kept.length, bytes: used }
}

/** 고른 조각으로 이번 요청의 지도를 세운다. **본 것만 담는다** — 근거는 본 것만 가리킬 수 있다. */
export function buildIndex(sources: SourceRef[], chunks: SourceChunk[]): ChunkIndex {
  return {
    chunks: new Map(chunks.map((c) => [c.id, c])),
    sources: new Map(sources.map((s) => [s.id, s])),
  }
}
