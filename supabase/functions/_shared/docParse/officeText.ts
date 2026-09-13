// [자료 분석] 오피스 파일(xlsx·docx·pptx)에서 글자와 표를 뽑는다.
//
// 모델은 이 형식들을 받지 않는다. 그래서 **우리가 안을 열어 글자로 바꾼다.**
//
// PDF로 변환하지 않는 이유는 그럴 수 없어서다 — 진짜 변환에는 오피스 렌더링 엔진이 필요한데
// 우리에게 그것이 없고, 외부 변환 서비스를 붙이면 기업 기밀 자료가 한 군데 더 나간다. 그리고
// 애초에 PDF가 목적이 아니다. 필요한 것은 **모델이 읽을 수 있는 형태**다.
//
// 변환본을 자료 관리에 저장하지도 않는다. 저장하면 같은 내용의 파일이 둘이 되고, 원본을 고치면
// 변환본만 옛 값으로 남아 어느 쪽이 진짜인지 화면이 답하지 못한다. 대신 **분석 결과를 캐시**에
// 둔다(attachment_extracts) — 그것은 파일이 아니라 파생물이고 원본이 지워지면 함께 지워진다.
//
// **뽑히는 것은 글자뿐이라는 한계는 형식마다 무게가 다르다.** 표는 글자로 옮겨도 그대로여서
// xlsx는 손실이 거의 없고, 문서도 적다. 반면 pptx는 그림과 배치가 말을 하는 장표가 많아
// 헐거워진다 — 그 사실은 화면이 미리 말한다(모달 도움말).
//
// **여기가 브라우저와 서버가 함께 쓰는 자리다.** 파일은 브라우저 Web Worker가 이 함수를
// 부르고, 옛 경로(캐시가 없는 요청)에서는 Edge Function이 같은 함수를 부른다. 두 벌이 되면
// 파서 버전이 두 곳에서 따로 오르고, 그때 캐시가 어느 규칙으로 만들어졌는지 답할 수 없다.
//
// Deno API를 쓰지 않는다(works vitest와 브라우저가 이 파일을 직접 돌린다).
// 근거: docs/docs_planning/3_3_5_startup_ai_fill.md §2.2·§16.2

import { readZipIndex, readZipText, type ZipEntry } from './zip.ts'
import { MAX_EXTRACT_CHARS, type ExtractChunk } from './types.ts'

export const OFFICE_MIMES = {
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  /**
   * 한글 문서(HWPX) — **ZIP이라 열린다.**
   *
   * 구형 `.hwp`는 목록에 없다. 그쪽은 ZIP이 아니라 OLE 복합 문서에 자체 압축을 얹은 이진
   * 형식이라 `.xls`·`.doc`과 같은 이유로 열지 못한다. HWPX는 OWPML — `Contents/section0.xml`
   * 꼴의 XML을 묶은 ZIP이므로 우리가 이미 가진 리더로 그대로 읽힌다.
   *
   * 넣은 이유는 그 형식으로 오는 자료가 **회의록**이기 때문이다. 등기·증명서류가 사실을
   * 말한다면 회의록에는 담당자의 판단이 담기고, 그것이 초안에서 가장 비어 있던 부분이다.
   */
  hwpx: 'application/hwp+zip',
} as const

const OFFICE_MIME_SET: ReadonlySet<string> = new Set(Object.values(OFFICE_MIMES))

/** 시트 하나에서 읽을 행 수. 표가 크면 앞부분만 봐도 구조와 최근 값이 다 들어온다. */
const MAX_ROWS = 400
/** 문단을 한 조각에 몇 줄까지 담을지. 자리 표시(`문단 1-40`)를 붙일 수 있는 단위로 끊는다. */
const PARAGRAPHS_PER_CHUNK = 40

/** 모델에 그대로 못 보내고 우리가 열어야 하는 형식인가. */
export function isOfficeMime(mime: string): boolean {
  return OFFICE_MIME_SET.has(mime)
}

/** XML 엔티티를 되돌린다. `&amp;`를 마지막에 두는 것이 요점이다(먼저 풀면 이중 해제가 된다). */
function unescapeXml(s: string): string {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&amp;/g, '&')
}

/** 줄 앞뒤 공백을 걷고 빈 줄을 접는다. **자르지 않는다** — 상한은 조각을 세울 때 잰다. */
function tidy(text: string): string {
  return text
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/** 태그 하나의 속성을 읽는다(따옴표 안의 값만). */
function attr(tag: string, name: string): string | null {
  const m = new RegExp(`${name}="([^"]*)"`).exec(tag)
  return m ? unescapeXml(m[1]!) : null
}

/** 빈 행·빈 열을 걷어 낸 표. 서식만 잡아 둔 빈 표가 실제로 흔하다. */
function tidyTable(rows: string[][]): string[][] {
  const trimmed = rows.map((r) => {
    const cells = [...r]
    while (cells.length > 0 && (cells[cells.length - 1] ?? '') === '') cells.pop()
    return cells
  })
  while (trimmed.length > 0 && (trimmed[trimmed.length - 1]?.length ?? 0) === 0) trimmed.pop()
  return trimmed.filter((r) => r.length > 0)
}

/** 표 하나를 글자로 편다. 쉼표가 아니라 탭인 것은 금액에 쉼표가 섞여 오기 때문이다. */
function tableToText(rows: string[][]): string {
  return rows.map((r) => r.join('\t')).join('\n')
}

// ── 워드 ───────────────────────────────────────────────────────────────

/**
 * 본문의 `<w:t>`만 모은다. 태그를 통째로 지우지 않는 이유는 필드 코드·주석 같은 것들이 함께
 * 딸려 나오기 때문이다 — 사람이 읽는 글자는 `<w:t>` 안에만 있다.
 */
function docxText(xml: string): string {
  const out: string[] = []
  const re = /<w:t[^>]*>([\s\S]*?)<\/w:t>|<w:tab\b[^>]*\/>|<w:br\b[^>]*\/>|<\/w:p>/g
  for (let m = re.exec(xml); m; m = re.exec(xml)) {
    if (m[1] !== undefined) out.push(unescapeXml(m[1]))
    else if (m[0].startsWith('<w:tab')) out.push('\t')
    else out.push('\n')
  }
  return out.join('')
}

/** 표 한 칸의 글자. 칸 안의 줄바꿈은 공백으로 눕힌다(열이 어긋나지 않게). */
function docxCell(xml: string): string {
  return docxText(xml).replace(/[\t\n\r]+/g, ' ').trim()
}

function docxTable(xml: string): string[][] {
  const rows: string[][] = []
  const rowRe = /<w:tr\b[^>]*>([\s\S]*?)<\/w:tr>/g
  for (let r = rowRe.exec(xml); r; r = rowRe.exec(xml)) {
    const cells: string[] = []
    const cellRe = /<w:tc\b[^>]*>([\s\S]*?)<\/w:tc>/g
    for (let c = cellRe.exec(r[1]!); c; c = cellRe.exec(r[1]!)) cells.push(docxCell(c[1]!))
    rows.push(cells)
  }
  return tidyTable(rows)
}

/**
 * 문서를 문단 묶음과 표로 가른다.
 *
 * **표를 문단에서 떼는 이유는 자리 표시 때문이다.** 재무·주주·고용 값은 거의 표에 있고,
 * 그것이 "문단 어딘가"가 아니라 "표 2"로 불려야 모델이 근거를 말할 수 있고 예산을 넘길 때
 * 표 단위로 골라 보낼 수 있다.
 *
 * 표 안의 표(중첩)는 다루지 않는다 — 바깥 표가 먼저 닫히는 것으로 읽혀 안쪽 표가 한 칸에
 * 눌려 담기지만, 사업계획서에서 중첩 표는 드물고 글자 자체는 잃지 않는다.
 */
function docxParts(xml: string): { paragraphs: string[]; tables: string[][][] } {
  const tables: string[][][] = []
  const outside: string[] = []
  const tblRe = /<w:tbl>[\s\S]*?<\/w:tbl>/g
  let cursor = 0
  for (let m = tblRe.exec(xml); m; m = tblRe.exec(xml)) {
    outside.push(xml.slice(cursor, m.index))
    const rows = docxTable(m[0])
    if (rows.length > 0) tables.push(rows)
    cursor = m.index + m[0].length
  }
  outside.push(xml.slice(cursor))

  const paragraphs = outside
    .map((part) => docxText(part))
    .join('\n')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)

  return { paragraphs, tables }
}

// ── 파워포인트 ─────────────────────────────────────────────────────────

const slideNo = (name: string) => Number(/(\d+)\.xml$/.exec(name)?.[1] ?? 0)

/** 장표 한 장의 글자. 문단(`</a:p>`)이 줄바꿈이다. */
function slideText(xml: string): string {
  const out: string[] = []
  const re = /<a:t>([\s\S]*?)<\/a:t>|<\/a:p>/g
  for (let m = re.exec(xml); m; m = re.exec(xml)) {
    if (m[1] !== undefined) out.push(unescapeXml(m[1]))
    else out.push('\n')
  }
  return out.join('').trim()
}

/** 장표 안의 표. 글자에도 함께 들어 있지만, 열 구조는 이 배열에만 남는다. */
function slideTables(xml: string): string[][][] {
  const tables: string[][][] = []
  const tblRe = /<a:tbl>[\s\S]*?<\/a:tbl>/g
  for (let t = tblRe.exec(xml); t; t = tblRe.exec(xml)) {
    const rows: string[][] = []
    const rowRe = /<a:tr\b[^>]*>([\s\S]*?)<\/a:tr>/g
    for (let r = rowRe.exec(t[0]); r; r = rowRe.exec(t[0])) {
      const cells: string[] = []
      const cellRe = /<a:tc\b[^>]*>([\s\S]*?)<\/a:tc>/g
      for (let c = cellRe.exec(r[1]!); c; c = cellRe.exec(r[1]!)) {
        cells.push(slideText(c[1]!).replace(/[\t\n\r]+/g, ' ').trim())
      }
      rows.push(cells)
    }
    const tidied = tidyTable(rows)
    if (tidied.length > 0) tables.push(tidied)
  }
  return tables
}

async function pptxChunks(buf: ArrayBuffer, index: Map<string, ZipEntry>): Promise<ExtractChunk[]> {
  const slides = [...index.keys()]
    .filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n))
    .sort((a, b) => slideNo(a) - slideNo(b))
  const out: ExtractChunk[] = []
  for (const name of slides) {
    const xml = await readZipText(buf, index.get(name)!)
    const body = xml ? slideText(xml) : ''
    // 글자가 없는 장표는 그림뿐이라는 뜻이다. 번호만 남겨 둔다 — 비어 있다는 사실도 정보다.
    out.push({
      kind: 'slide',
      location: `슬라이드 ${slideNo(name)}`,
      text: tidy(body) || '(글자 없음 — 이미지 장표)',
      tables: xml ? slideTables(xml) : [],
    })
  }
  return out
}

// ── 엑셀 ───────────────────────────────────────────────────────────────

/** 공유 문자열 표. 엑셀은 같은 글자를 여기 한 번만 두고 셀에서는 번호로 가리킨다. */
async function sharedStrings(buf: ArrayBuffer, index: Map<string, ZipEntry>): Promise<string[]> {
  const entry = index.get('xl/sharedStrings.xml')
  if (!entry) return []
  const xml = await readZipText(buf, entry)
  if (!xml) return []
  const out: string[] = []
  const si = /<si>([\s\S]*?)<\/si>/g
  for (let m = si.exec(xml); m; m = si.exec(xml)) {
    const pieces: string[] = []
    const t = /<t[^>]*>([\s\S]*?)<\/t>/g
    for (let n = t.exec(m[1]!); n; n = t.exec(m[1]!)) pieces.push(unescapeXml(n[1]!))
    out.push(pieces.join(''))
  }
  return out
}

/** 시트 이름과 실제 파일 경로를 잇는다. 이름은 workbook에, 경로는 rels에 따로 있다. */
async function sheetTargets(
  buf: ArrayBuffer,
  index: Map<string, ZipEntry>,
): Promise<{ name: string; path: string }[]> {
  const bookEntry = index.get('xl/workbook.xml')
  const relsEntry = index.get('xl/_rels/workbook.xml.rels')
  if (!bookEntry || !relsEntry) return []
  const book = await readZipText(buf, bookEntry)
  const rels = await readZipText(buf, relsEntry)
  if (!book || !rels) return []

  const target = new Map<string, string>()
  for (const tag of rels.match(/<Relationship\b[^>]*>/g) ?? []) {
    const id = attr(tag, 'Id')
    const path = attr(tag, 'Target')
    if (id && path) target.set(id, path.startsWith('/') ? path.slice(1) : `xl/${path}`)
  }
  const out: { name: string; path: string }[] = []
  for (const tag of book.match(/<sheet\b[^>]*>/g) ?? []) {
    const name = attr(tag, 'name')
    const path = target.get(attr(tag, 'r:id') ?? '')
    if (name && path) out.push({ name, path })
  }
  return out
}

/** `B3` → 열 번호 1(0부터). 행마다 빠진 칸을 채워야 열이 어긋나지 않는다. */
function columnIndex(ref: string): number {
  const letters = /^([A-Z]+)/.exec(ref.toUpperCase())?.[1] ?? ''
  let n = 0
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64)
  return n - 1
}

function cellValue(tag: string, inner: string, shared: string[]): string {
  const type = attr(tag, 't')
  if (type === 'inlineStr') {
    const pieces: string[] = []
    const t = /<t[^>]*>([\s\S]*?)<\/t>/g
    for (let m = t.exec(inner); m; m = t.exec(inner)) pieces.push(unescapeXml(m[1]!))
    return pieces.join('')
  }
  const raw = /<v>([\s\S]*?)<\/v>/.exec(inner)?.[1]
  if (raw == null) return ''
  if (type === 's') return shared[Number(raw)] ?? ''
  return unescapeXml(raw)
}

/** 행 하나의 칸들. 빠진 칸을 채워 넣는 것이 이 함수의 일이다. */
function rowCells(inner: string, shared: string[]): string[] {
  const cells: string[] = []
  const cellRe = /<c\b([^>]*?)\/>|<c\b([^>]*?)>([\s\S]*?)<\/c>/g
  for (let c = cellRe.exec(inner); c; c = cellRe.exec(inner)) {
    const tag = c[1] ?? c[2] ?? ''
    const value = c[3] == null ? '' : cellValue(tag, c[3], shared)
    const at = columnIndex(attr(tag, 'r') ?? '')
    const i = at >= 0 ? at : cells.length
    while (cells.length < i) cells.push('')
    cells[i] = value.replace(/[\t\n\r]+/g, ' ').trim()
  }
  return cells
}

/**
 * 시트 하나를 행·열 배열로. **앞 `MAX_ROWS`줄만** 본다(자료 분석용 — 앞부분만 봐도 구조와
 * 최근 값이 들어온다). 상한은 원본 행 기준이고, 그중 빈 줄은 `tidyTable`이 걷어 낸다.
 */
function sheetRows(xml: string, shared: string[]): string[][] {
  const rows: string[][] = []
  const rowRe = /<row\b[^>]*>([\s\S]*?)<\/row>/g
  for (let r = rowRe.exec(xml); r && rows.length < MAX_ROWS; r = rowRe.exec(xml)) {
    rows.push(rowCells(r[1]!, shared))
  }
  return tidyTable(rows)
}

/** 뒤쪽 빈 칸을 걷는다(`tidyTable`과 같은 규칙). 다 비면 길이 0 — 내용이 없는 줄이다. */
function trimTrailingEmpty(cells: string[]): string[] {
  const out = [...cells]
  while (out.length > 0 && (out[out.length - 1] ?? '') === '') out.pop()
  return out
}

/**
 * 시트 하나를 **내용 있는 줄 기준**으로 읽는다. `maxRows`를 넘으면 `{ overflow: true }`.
 *
 * 원본 행이 아니라 **내용 있는 줄을 세는 것**이 요점이다. 원본 행으로 세고 나서 빈 줄을 걷어
 * 내면, 상한 근처에 빈 줄이 섞인 파일에서 걷어 낸 만큼 결과가 상한 아래로 내려와 **넘치지
 * 않은 것으로 읽힌다** — 그러면 상한 뒤의 줄은 읽히지도 않은 채 조용히 사라진다. 명단에서는
 * 그 줄이 곧 만들어지지 않은 계정이고, 아무도 그 사실을 모른다.
 *
 * 넘친 순간 곧바로 돌아온다 — 시트 끝까지 훑지 않으므로 기억과 시간이 상한에 묶인다.
 */
function sheetRowsCapped(
  xml: string,
  shared: string[],
  maxRows: number,
): string[][] | { overflow: true } {
  const rows: string[][] = []
  const rowRe = /<row\b[^>]*>([\s\S]*?)<\/row>/g
  for (let r = rowRe.exec(xml); r; r = rowRe.exec(xml)) {
    const cells = trimTrailingEmpty(rowCells(r[1]!, shared))
    // 빈 줄은 세지 않는다(`tidyTable`이 어차피 걷어 내는 줄이다).
    if (cells.length === 0) continue
    if (rows.length >= maxRows) return { overflow: true }
    rows.push(cells)
  }
  return rows
}

async function xlsxChunks(buf: ArrayBuffer, index: Map<string, ZipEntry>): Promise<ExtractChunk[]> {
  const shared = await sharedStrings(buf, index)
  const sheets = await sheetTargets(buf, index)
  const out: ExtractChunk[] = []
  for (const sheet of sheets) {
    const entry = index.get(sheet.path)
    if (!entry) continue
    const xml = await readZipText(buf, entry)
    const rows = xml ? sheetRows(xml, shared) : []
    // 빈 시트는 세우지 않는다 — 서식만 잡아 둔 빈 시트가 실제로 흔하고, 이름만 나열되면
    // 모델이 그 이름을 근거로 없는 값을 지어낼 자리가 된다.
    if (rows.length === 0) continue
    out.push({ kind: 'sheet', location: `시트: ${sheet.name}`, text: tableToText(rows), tables: [rows] })
  }
  return out
}

/** 값이 있는 첫 시트의 표 전체. `xlsxFirstSheetGrid`의 성공 결과. */
export interface XlsxGrid {
  sheetName: string
  /** 첫 줄이 헤더인 표. 상한 안이면 **자르지 않은 전체**다. */
  rows: string[][]
}

/**
 * 값이 있는 **첫 시트의 표를 통째로** 읽는다 — 원장 대용량 업로드가 쓰는 자리다.
 *
 * 조각 API(`officeChunks`)와 가르는 이유는 **자른 결과를 쓸 수 없기 때문**이다. 자료 분석은
 * 앞 400줄만 읽어도 "무엇이 적힌 문서인가"에 답하지만, 명단 업로드에서 401번째 줄이 사라지면
 * 그 사람의 계정이 만들어지지 않고 **아무도 그 사실을 모른다.** 게다가 목록 안 중복 판정은
 * 전체를 봐야 성립해서, 잘린 채로는 401번째 줄과 겹치는 3번째 줄이 멀쩡한 줄로 통과한다.
 *
 * 그래서 상한을 넘으면 **잘라 주지 않고 `{ overflow: true }`로 거절한다.** 호출부는 파일을
 * 나눠 올리게 안내해야 하며, 일부만 처리해서는 안 된다.
 *
 * 상한은 `sheetRowsCapped`가 **내용 있는 줄로** 재며, 자료 분석의 `MAX_ROWS`와는 무관하다.
 */
export async function xlsxFirstSheetGrid(
  buf: ArrayBuffer,
  maxRows: number,
): Promise<XlsxGrid | { overflow: true } | { message: string }> {
  const index = readZipIndex(buf)
  if (!index) return { message: '열 수 없는 파일입니다(암호가 걸렸거나 손상된 문서).' }

  const shared = await sharedStrings(buf, index)
  const sheets = await sheetTargets(buf, index)
  for (const sheet of sheets) {
    const entry = index.get(sheet.path)
    if (!entry) continue
    const xml = await readZipText(buf, entry)
    if (!xml) continue
    const rows = sheetRowsCapped(xml, shared, maxRows)
    if (!Array.isArray(rows)) return rows
    // 빈 시트는 건너뛴다 — 서식만 잡아 둔 빈 시트가 실제로 흔하다.
    if (rows.length === 0) continue
    return { sheetName: sheet.name, rows }
  }
  return { message: '시트에서 읽을 내용이 없습니다.' }
}

// ── 한글(HWPX) ─────────────────────────────────────────────────────────
//
// OWPML은 워드와 닮았다 — 문단이 `<hp:p>`, 글자가 `<hp:t>`, 표가 `<hp:tbl>`/`<hp:tr>`/`<hp:tc>`다.
// 그래서 구조를 가르는 방식(표를 문단에서 떼고 각각 조각으로 세운다)을 워드에서 그대로 가져온다.
//
// 접두사를 고정하지 않고 `(?:\w+:)?`로 받는 것이 워드와 갈리는 유일한 지점이다. 표준은 `hp:`이지만
// 한컴 버전에 따라 다른 접두사로 저장되는 파일이 있고, 접두사 하나가 어긋나면 오류가 아니라
// **빈 결과**가 나온다 — 담당자는 왜 아무것도 안 채워졌는지 알 수 없다. 형식은 이미 MIME으로
// 갈라져 있으므로 여기서 접두사를 느슨하게 받아도 다른 형식의 태그를 집을 일이 없다.

/** 구역 파일 이름 → 번호. `Contents/section0.xml`의 0. */
const sectionNo = (name: string) => Number(/section(\d+)\.xml$/i.exec(name)?.[1] ?? 0)

/** 문단·글자만 모은다. 문단 끝(`</hp:p>`)과 줄바꿈이 줄을 가른다. */
function hwpxText(xml: string): string {
  const out: string[] = []
  const re = /<(?:\w+:)?t\b[^>]*>([\s\S]*?)<\/(?:\w+:)?t>|<(?:\w+:)?tab\b[^>]*\/?>|<\/(?:\w+:)?p>/g
  for (let m = re.exec(xml); m; m = re.exec(xml)) {
    if (m[1] !== undefined) out.push(unescapeXml(m[1]))
    else if (/tab/.test(m[0])) out.push('\t')
    else out.push('\n')
  }
  return out.join('')
}

/** 표 한 칸의 글자. 칸 안의 줄바꿈은 공백으로 눕힌다(열이 어긋나지 않게). */
function hwpxCell(xml: string): string {
  return hwpxText(xml).replace(/[\t\n\r]+/g, ' ').trim()
}

function hwpxTable(xml: string): string[][] {
  const rows: string[][] = []
  const rowRe = /<(?:\w+:)?tr\b[^>]*>([\s\S]*?)<\/(?:\w+:)?tr>/g
  for (let r = rowRe.exec(xml); r; r = rowRe.exec(xml)) {
    const cells: string[] = []
    const cellRe = /<(?:\w+:)?tc\b[^>]*>([\s\S]*?)<\/(?:\w+:)?tc>/g
    for (let c = cellRe.exec(r[1]!); c; c = cellRe.exec(r[1]!)) cells.push(hwpxCell(c[1]!))
    rows.push(cells)
  }
  return tidyTable(rows)
}

/** 구역 하나를 문단 묶음과 표로 가른다(워드의 `docxParts`와 같은 규칙). */
function hwpxParts(xml: string): { paragraphs: string[]; tables: string[][][] } {
  const tables: string[][][] = []
  const outside: string[] = []
  const tblRe = /<(?:\w+:)?tbl\b[^>]*>[\s\S]*?<\/(?:\w+:)?tbl>/g
  let cursor = 0
  for (let m = tblRe.exec(xml); m; m = tblRe.exec(xml)) {
    outside.push(xml.slice(cursor, m.index))
    const rows = hwpxTable(m[0])
    if (rows.length > 0) tables.push(rows)
    cursor = m.index + m[0].length
  }
  outside.push(xml.slice(cursor))

  const paragraphs = outside
    .map((part) => hwpxText(part))
    .join('\n')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)

  return { paragraphs, tables }
}

/**
 * 구역을 번호 순으로 이어 읽는다.
 *
 * 구역마다 조각을 나누지 않고 문단을 통째로 이어 붙이는 것은 **구역이 사람에게는 자리가
 * 아니기 때문**이다. 워드의 '문단 1-40'은 읽는 사람이 되짚을 수 있는 말이지만 '구역 2'는
 * 한글이 편집 설정(용지·단)을 가르는 단위라, 근거로 적혀도 문서에서 그 자리를 찾을 수 없다.
 */
async function hwpxChunks(buf: ArrayBuffer, index: Map<string, ZipEntry>): Promise<ExtractChunk[]> {
  const sections = [...index.keys()]
    .filter((n) => /(^|\/)section\d+\.xml$/i.test(n))
    .sort((a, b) => sectionNo(a) - sectionNo(b))

  const paragraphs: string[] = []
  const tables: string[][][] = []
  for (const name of sections) {
    const xml = await readZipText(buf, index.get(name)!)
    if (!xml) continue
    const part = hwpxParts(xml)
    paragraphs.push(...part.paragraphs)
    tables.push(...part.tables)
  }

  const out: ExtractChunk[] = []
  for (let i = 0; i < paragraphs.length; i += PARAGRAPHS_PER_CHUNK) {
    const slice = paragraphs.slice(i, i + PARAGRAPHS_PER_CHUNK)
    out.push({
      kind: 'paragraph',
      location: `문단 ${i + 1}-${i + slice.length}`,
      text: tidy(slice.join('\n')),
      tables: [],
    })
  }
  for (const [i, rows] of tables.entries()) {
    out.push({ kind: 'table', location: `표 ${i + 1}`, text: tableToText(rows), tables: [rows] })
  }
  return out
}

// ── 진입점 ─────────────────────────────────────────────────────────────

async function docxChunks(buf: ArrayBuffer, index: Map<string, ZipEntry>): Promise<ExtractChunk[]> {
  const entry = index.get('word/document.xml')
  const xml = entry ? await readZipText(buf, entry) : null
  if (!xml) return []
  const { paragraphs, tables } = docxParts(xml)

  const out: ExtractChunk[] = []
  for (let i = 0; i < paragraphs.length; i += PARAGRAPHS_PER_CHUNK) {
    const slice = paragraphs.slice(i, i + PARAGRAPHS_PER_CHUNK)
    out.push({
      kind: 'paragraph',
      location: `문단 ${i + 1}-${i + slice.length}`,
      text: tidy(slice.join('\n')),
      tables: [],
    })
  }
  for (const [i, rows] of tables.entries()) {
    out.push({ kind: 'table', location: `표 ${i + 1}`, text: tableToText(rows), tables: [rows] })
  }
  return out
}

/**
 * 오피스 파일을 조각으로 연다. 실패는 사람이 읽을 문구로 돌려준다 — 담당자가 고칠 수 있는
 * 문제(암호가 걸린 파일·손상된 파일)이므로 원인을 말해야 다음 행동이 정해진다.
 */
export async function officeChunks(
  buf: ArrayBuffer,
  mime: string,
  fileName: string,
): Promise<ExtractChunk[] | { message: string }> {
  const index = readZipIndex(buf)
  // 암호가 걸린 파일은 ZIP 구조 자체가 다르게 잠겨 여기서 걸린다.
  if (!index) return { message: `열 수 없는 파일입니다(암호가 걸렸거나 손상된 문서): ${fileName}` }

  let chunks: ExtractChunk[] = []
  if (mime === OFFICE_MIMES.docx) chunks = await docxChunks(buf, index)
  else if (mime === OFFICE_MIMES.pptx) chunks = await pptxChunks(buf, index)
  else if (mime === OFFICE_MIMES.xlsx) chunks = await xlsxChunks(buf, index)
  else if (mime === OFFICE_MIMES.hwpx) chunks = await hwpxChunks(buf, index)

  // 상한은 조각 단위로 자른다. 글자 한복판에서 끊으면 표의 마지막 행이 반쪽으로 남아,
  // 모델이 그 반쪽을 값으로 읽는다.
  const capped: ExtractChunk[] = []
  let used = 0
  for (const c of chunks) {
    if (used >= MAX_EXTRACT_CHARS) break
    capped.push(c)
    used += c.text.length
  }

  // "읽을 것이 없다"의 판정에 **표를 함께 센다.** 글자 수만 보면 `1 / -320` 두 칸짜리 재무
  // 요약처럼 짧지만 값이 다 들어 있는 시트가 그림 문서로 몰려 통째로 버려진다.
  const total = capped.reduce((sum, c) => sum + c.text.trim().length, 0)
  const hasTable = capped.some((c) => c.tables.length > 0)
  if (!hasTable && total < 10) {
    return { message: `읽을 글자가 없습니다(그림만 있는 문서일 수 있습니다): ${fileName}` }
  }
  return capped
}

/**
 * 옛 경로(캐시 없이 그 자리에서 읽는 요청)가 쓰는 글자 API.
 *
 * 조각 API 위에 얹어 둔다 — 두 경로가 **같은 규칙으로 뽑은 같은 글자**를 봐야 캐시가 있을
 * 때와 없을 때의 초안이 달라지지 않는다.
 */
export async function officeText(
  buf: ArrayBuffer,
  mime: string,
  fileName: string,
): Promise<string | { message: string }> {
  const read = await officeChunks(buf, mime, fileName)
  if (!Array.isArray(read)) return read
  return read
    .map((c) => `[${c.location}]\n${c.text}`)
    .join('\n\n')
    .trim()
}
