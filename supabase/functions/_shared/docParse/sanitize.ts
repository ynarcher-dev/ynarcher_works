// [자료 분석] 밖에서 들어온 분석 결과를 우리 모양으로 되세운다.
//
// **브라우저가 보낸 분석 결과는 신뢰할 수 없는 입력이다.** 파일을 브라우저가 열게 한 대가로,
// 서버는 그 결과가 정말 그 첨부에서 나온 것인지 알 수 없다. 조작된 요청은 첨부와 무관한
// 글자를 그 첨부의 이름으로 심을 수 있고, 그 글자는 다음에 그 기업을 여는 **다른 담당자의
// 초안**이 된다.
//
// 그래서 이 파일이 하는 일은 검사가 아니라 **되세우기**다 — 들어온 값을 그대로 두고 참/거짓만
// 답하는 대신, 우리가 아는 모양만 남기고 나머지는 버린 새 값을 만든다. 검사만 하면 통과한
// 값 안에 우리가 물어보지 않은 칸이 그대로 살아 원장에 들어간다.
//
// 여기서 막지 못하는 것은 하나다 — **내용이 진짜 그 파일에서 나왔는가.** 그것은 원본을 다시
// 열어야 알 수 있고, 그러면 브라우저에서 여는 뜻이 없어진다. 대신 캐시를 "검증된 원장"이
// 아니라 **사람이 확인해야 하는 초안의 재료**로만 쓴다(원장에 닿는 길은 폼 → RLS 하나다).
//
// Deno API를 쓰지 않는다(works vitest가 이 판정을 직접 돌린다).
// 근거: docs/docs_planning/3_3_5_startup_ai_fill.md §16.2·§16.11

import {
  MAX_BODY_CHARS,
  MAX_CHUNK_CHARS,
  MAX_CHUNKS,
  MAX_TABLE_COLS,
  MAX_TABLE_ROWS,
  MAX_TABLES_PER_CHUNK,
  type ChunkKind,
  type ExtractBody,
  type ExtractChunk,
  type ExtractSummary,
} from './types.ts'
import { summarize } from './extract.ts'

const KINDS: ReadonlySet<string> = new Set<ChunkKind>([
  'sheet',
  'paragraph',
  'table',
  'slide',
  'text',
  'link',
])

/** 자리 표시 한 줄의 상한. 여기에 문서 한 쪽을 담아 상한을 우회하지 못하게 한다. */
const MAX_LOCATION_CHARS = 200

/**
 * 줄바꿈(10)과 탭(9)만 남기고 나머지 C0 제어문자와 DEL(127)을 걷는다.
 *
 * 정규식 문자열 대신 코드포인트로 세는 이유는 **읽는 사람이 범위를 눈으로 확인할 수 있게**
 * 하기 위해서다. 제어문자 범위를 정규식 이스케이프로 적으면 한 글자만 어긋나도 통과하는
 * 값이 생기는데, 그 어긋남은 눈으로 잡히지 않는다.
 */
function stripControl(raw: string): string {
  let out = ''
  for (const ch of raw) {
    const code = ch.codePointAt(0) ?? 0
    if (code === 9 || code === 10) out += ch
    else if (code < 32 || code === 127) continue
    else out += ch
  }
  return out
}

/**
 * 글자에서 위험한 것을 걷는다.
 *
 * **제어문자**는 저장·전송에서 값을 끊거나 로그를 어지럽힌다. **태그**는 두 가지 이유로
 * 걷는다 — 추출된 문서 글자에는 원래 없어야 하는 것이고, 남겨 두면 나중에 이 값을 화면에
 * 그리는 코드가 생기는 날 그것이 곧 구멍이 된다. 대가는 `a<b` 같은 진짜 부등호가 사라지는
 * 것인데, 사업계획서에서 그 손실은 태그를 통과시키는 위험보다 싸다.
 */
export function sanitizeText(raw: string): string {
  return stripControl(raw)
    .replace(/<[^>]{0,200}>/g, ' ')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function asString(v: unknown): string {
  return typeof v === 'string' ? v : ''
}

function normalizeTable(raw: unknown): string[][] | null {
  if (!Array.isArray(raw)) return null
  const rows: string[][] = []
  for (const row of raw.slice(0, MAX_TABLE_ROWS)) {
    if (!Array.isArray(row)) continue
    rows.push(row.slice(0, MAX_TABLE_COLS).map((cell) => sanitizeText(asString(cell)).slice(0, 2_000)))
  }
  return rows.length > 0 ? rows : null
}

function normalizeChunk(raw: unknown): ExtractChunk | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const src = raw as Record<string, unknown>
  const kind = asString(src.kind)
  if (!KINDS.has(kind)) return null

  const location = sanitizeText(asString(src.location)).slice(0, MAX_LOCATION_CHARS)
  const text = sanitizeText(asString(src.text)).slice(0, MAX_CHUNK_CHARS)
  const tables: string[][][] = []
  if (Array.isArray(src.tables)) {
    for (const t of src.tables.slice(0, MAX_TABLES_PER_CHUNK)) {
      const rows = normalizeTable(t)
      if (rows) tables.push(rows)
    }
  }
  // 자리 표시도 내용도 없는 조각은 담지 않는다 — 개수만 채우는 값이 상한을 먹는다.
  if (text.length === 0 && tables.length === 0) return null
  return { kind: kind as ChunkKind, location: location || '본문', text, tables }
}

export type NormalizedExtract =
  | { body: ExtractBody; summary: ExtractSummary }
  | { error: string }

/**
 * 밖에서 들어온 본문을 우리 모양으로 되세운다.
 *
 * 상한을 **넘겼다고 통째로 거절하지 않고 앞에서 끊는 것**이 규칙이다. 큰 자료를 고른 것은
 * 담당자의 잘못이 아니고, 앞부분만으로도 초안은 만들어진다. 대신 잘렸다는 사실을 요약이
 * 말한다. 반대로 **모양이 어긋난 것은 거절한다** — 그것은 크기가 아니라 계약의 문제다.
 */
export function normalizeExtractBody(raw: unknown): NormalizedExtract {
  const chunksRaw =
    raw && typeof raw === 'object' && Array.isArray((raw as { chunks?: unknown }).chunks)
      ? ((raw as { chunks: unknown[] }).chunks)
      : null
  if (!chunksRaw) return { error: '분석 결과의 모양이 올바르지 않습니다.' }

  const chunks: ExtractChunk[] = []
  let used = 0
  for (const item of chunksRaw.slice(0, MAX_CHUNKS)) {
    if (used >= MAX_BODY_CHARS) break
    const chunk = normalizeChunk(item)
    if (!chunk) continue
    chunks.push(chunk)
    used += chunk.text.length
  }
  if (chunks.length === 0) return { error: '분석 결과에 읽을 글자가 없습니다.' }

  const summary = summarize(chunks)
  // 상한에 걸려 앞에서 끊었으면 그 사실을 요약이 들고 간다(화면이 그대로 말한다).
  if (chunksRaw.length > chunks.length || used >= MAX_BODY_CHARS) summary.truncated = true
  return { body: { chunks }, summary }
}
