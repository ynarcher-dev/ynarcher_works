// [자료 분석] 글자만 담긴 파일(TXT·CSV·JSON·HTML·XML·RTF)을 조각으로 나눈다.
//
// 이 형식들은 모델이 그대로 받기도 한다. 그런데도 우리가 여는 이유는 둘이다 —
//   * **자리 표시가 생긴다.** 20만 자짜리 텍스트가 통째 한 덩이로 들어가면 모델이 근거를
//     "그 파일 어딘가"로밖에 말하지 못한다. 도막마다 번호를 붙이면 evidence가 자리를 답한다.
//   * **CSV는 표다.** 쉼표로 이어진 글자가 아니라 행·열이며, 그 구조를 여기서 살려 두면
//     예산을 넘길 때 표 단위로 고를 수 있고 2차에서 값을 직접 읽는 일도 여기에 붙는다.
//
// HTML에서 태그를 걷는 것은 **스크립트·스타일이 입력 예산의 대부분을 먹기 때문**이다. 본문이
// 뒤로 밀리면 모델이 정작 읽어야 할 것을 못 읽는다(linkRead가 바깥 페이지에 하는 일과 같다).
//
// Deno API를 쓰지 않는다(works vitest와 브라우저가 이 파일을 직접 돌린다).
// 근거: docs/docs_planning/3_3_5_startup_ai_fill.md §16.2

import { MAX_EXTRACT_CHARS, TEXT_CHUNK_CHARS, type ExtractChunk } from './types.ts'

/** 태그를 걷어야 하는 형식인가. */
function isMarkup(mime: string): boolean {
  return mime === 'text/html' || mime === 'text/xml' || mime === 'application/xml'
}

/** 흔한 이름 있는 엔티티와 숫자 엔티티를 되돌린다. */
function decodeEntities(s: string): string {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&amp;/g, '&')
}

/** 마크업에서 사람이 읽는 글자만 남긴다. */
export function markupToText(raw: string): string {
  return decodeEntities(
    raw
      .replace(/<script\b[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style\b[\s\S]*?<\/style>/gi, ' ')
      .replace(/<!--[\s\S]*?-->/g, ' ')
      // 블록이 끝나는 자리는 줄바꿈으로 남긴다 — 문단이 한 줄로 뭉치면 사람도 모델도 못 읽는다.
      .replace(/<\/(p|div|li|tr|h[1-6]|section|article|br)\s*>/gi, '\n')
      .replace(/<br\b[^>]*\/?>/gi, '\n')
      .replace(/<[^>]+>/g, ' '),
  )
    .replace(/[ \t ]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/**
 * CSV 한 장을 행·열로 읽는다.
 *
 * 따옴표 안의 쉼표·줄바꿈을 지키는 것이 이 함수의 전부다. 그것을 지키지 않으면 금액에 섞인
 * 쉼표(`1,200`)에서 열이 하나씩 밀려, 표가 있는데도 값이 엉뚱한 열에 붙는다.
 */
export function parseCsv(raw: string, delimiter = ','): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let quoted = false

  for (let i = 0; i < raw.length; i += 1) {
    const ch = raw[i]
    if (quoted) {
      if (ch === '"') {
        if (raw[i + 1] === '"') {
          cell += '"'
          i += 1
        } else quoted = false
      } else cell += ch
      continue
    }
    if (ch === '"') quoted = true
    else if (ch === delimiter) {
      row.push(cell)
      cell = ''
    } else if (ch === '\n') {
      row.push(cell)
      rows.push(row)
      row = []
      cell = ''
    } else if (ch !== '\r') cell += ch
  }
  row.push(cell)
  rows.push(row)

  return rows
    .map((r) => r.map((c) => c.trim()))
    .filter((r) => r.some((c) => c.length > 0))
}

/** 글자를 도막으로 끊는다. 줄 한복판을 자르지 않는다 — 표의 마지막 줄이 반쪽으로 남는다. */
function splitByLines(text: string, size: number): string[] {
  const out: string[] = []
  let buf = ''
  for (const line of text.split('\n')) {
    if (buf.length > 0 && buf.length + line.length + 1 > size) {
      out.push(buf)
      buf = ''
    }
    buf = buf.length === 0 ? line : `${buf}\n${line}`
  }
  if (buf.trim().length > 0) out.push(buf)
  return out
}

/**
 * 글자 계열 파일 하나를 조각으로.
 *
 * `fileName`을 받지 않는 것은 자리 표시가 파일 안의 위치를 말해야 하기 때문이다 — 어느
 * 파일인지는 캐시 행이 이미 안다(같은 사실을 두 곳에 적지 않는다).
 */
export function textChunks(raw: string, mime: string): ExtractChunk[] {
  if (mime === 'text/csv') {
    const rows = parseCsv(raw)
    if (rows.length > 0) {
      const text = rows.map((r) => r.join('\t')).join('\n').slice(0, MAX_EXTRACT_CHARS)
      return [{ kind: 'sheet', location: '표', text, tables: [rows] }]
    }
  }

  const body = (isMarkup(mime) ? markupToText(raw) : raw).slice(0, MAX_EXTRACT_CHARS)
  const parts = splitByLines(body.trim(), TEXT_CHUNK_CHARS)
  if (parts.length === 0) return []
  if (parts.length === 1) return [{ kind: 'text', location: '본문', text: parts[0]!, tables: [] }]
  return parts.map((text, i) => ({
    kind: 'text' as const,
    location: `본문 ${i + 1}/${parts.length}`,
    text,
    tables: [],
  }))
}
