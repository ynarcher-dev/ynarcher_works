// [AI 작성하기] 분석된 조각을 두 곳에서 받아 하나의 지도로 세운다.
//
// 자료가 이미 분석돼 있으면 원본을 만지지 않는다. 그 조각이 오는 길은 둘이다 —
//   * **수정 모드**: 캐시 원장(`attachment_extracts`)의 행. 첨부 id가 곧 자료 키다.
//   * **등록 모드**: 요청에 실려 온다. 가리킬 행이 없어 저장할 자리도 없으므로, 화면이 분석
//     결과를 들고 있다가 작성 요청에 함께 싣는다.
//
// **두 길의 신뢰가 다르다.** 캐시 행은 저장될 때 이미 되세워진 것이고(material-extract),
// 요청에 실려 온 것은 지금 막 도착한 남의 말이다. 그래서 등록 모드 쪽만 여기서 다시 되세운다 —
// 검증을 저장 시점에만 두면, 저장을 거치지 않는 이 경로가 그대로 구멍이 된다.
//
// **글자로 이어 붙이지 않고 조각 그대로 넘긴다**(2026-09-06 개정). 종전에는 여기서
// `chunksToText`로 한 덩이를 만들어 넘겼는데, 그 모양에서는 예산을 넘길 때 자료를 통째로
// 버리는 수밖에 없었고 근거를 되짚을 주소도 사라졌다.
//
// Deno API를 쓰지 않는다(works vitest가 이 판정을 직접 돌린다).
// 근거: docs/docs_planning/3_3_5_startup_ai_fill.md §16.5·§16.6·§16.14

import { normalizeExtractBody } from '../docParse/sanitize.ts'
import type { ExtractChunk } from '../docParse/types.ts'

/** 캐시 원장에서 읽어 온 행 중 우리가 쓰는 부분. */
export interface ExtractRow {
  attachment_id: string
  status: string
  body: { chunks?: unknown } | null
}

/** 조각 배열이 쓸 만한가. 글자가 하나도 없는 결과는 없는 것과 같다. */
function usable(chunks: ExtractChunk[]): boolean {
  return chunks.some((c) => typeof c?.text === 'string' && c.text.trim().length > 0)
}

/**
 * 캐시 행을 자료 키 → 조각 지도로.
 *
 * **`ready`만 담는다.** `original`은 원본으로 보내라는 뜻이고 `failed`는 열지 못했다는
 * 뜻이라, 둘 다 지도에 없어야 옛 경로(원본을 그 자리에서 읽는다)로 흘러간다.
 *
 * 저장될 때 이미 되세운 값이지만 **여기서도 모양만은 다시 본다** — 원장은 우리가 쓰는 곳이나
 * 파서 버전이 바뀌며 남은 옛 행이 섞일 수 있고, 배열이 아닌 값이 조각인 척 들어오면 그 뒤의
 * 모든 판정이 조용히 빈 결과가 된다.
 */
export function extractsFromRows(rows: ExtractRow[]): Map<string, ExtractChunk[]> {
  const out = new Map<string, ExtractChunk[]>()
  for (const row of rows) {
    if (row.status !== 'ready') continue
    const chunks = row.body?.chunks
    if (!Array.isArray(chunks)) continue
    const valid = (chunks as ExtractChunk[]).filter((c) => c && typeof c === 'object' && typeof c.text === 'string')
    if (!usable(valid)) continue
    out.set(String(row.attachment_id), valid)
  }
  return out
}

/** 등록 모드에서 실려 온 분석 결과 한 건. */
export interface PendingExtract {
  name: string
  chunks: ExtractChunk[]
}

/**
 * 요청에 실려 온 분석 결과를 되세운다.
 *
 * 모양이 어긋난 줄은 **그 줄만 버린다.** 통째로 거절하지 않는 이유는 등록 모드의 자료가
 * 여러 건이고, 한 건이 이상하다고 나머지로 초안을 못 만들 이유가 없기 때문이다. 버려진
 * 자료는 배정에서 빠져 "지정한 자료를 읽지 못했다"로 담당자에게 답한다.
 */
export function readPendingExtracts(raw: unknown): Map<string, PendingExtract> {
  const out = new Map<string, PendingExtract>()
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out

  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!key || !value || typeof value !== 'object') continue
    const entry = value as { name?: unknown; body?: unknown }
    const normalized = normalizeExtractBody(entry.body)
    if ('error' in normalized) continue
    if (!usable(normalized.body.chunks)) continue
    const name = typeof entry.name === 'string' && entry.name.trim() ? entry.name.trim().slice(0, 300) : key
    out.set(key, { name, chunks: normalized.body.chunks })
  }
  return out
}
