// [AI 작성하기] 오피스 파일(xlsx·docx·pptx)에서 글자와 표를 뽑는다.
//
// 모델은 이 형식들을 받지 않는다. 그래서 **우리가 안을 열어 글자로 바꿔 보낸다.**
//
// PDF로 변환하지 않는 이유는 그럴 수 없어서다 — 진짜 변환에는 오피스 렌더링 엔진이 필요한데
// Edge Function은 프로그램을 실행할 수 없고, 외부 변환 서비스를 붙이면 기업 기밀 자료가 한
// 군데 더 나간다. 그리고 애초에 PDF가 목적이 아니다. 필요한 것은 **모델이 읽을 수 있는 형태**다.
//
// 변환본을 자료 관리에 저장하지도 않는다. 저장하면 같은 내용의 파일이 둘이 되고, 원본을 고치면
// 변환본만 옛 값으로 남아 어느 쪽이 진짜인지 화면이 답하지 못한다. 읽을 때 그 자리에서 바꾼다.
//
// **뽑히는 것은 글자뿐이라는 한계는 형식마다 무게가 다르다.** 표는 글자로 옮겨도 그대로여서
// xlsx는 손실이 거의 없고, 문서도 적다. 반면 pptx는 그림과 배치가 말을 하는 장표가 많아
// 헐거워진다 — 그 사실은 화면이 미리 말한다(모달 도움말).
//
// Deno API를 쓰지 않는다(works vitest가 이 파일을 직접 돌린다).
// 근거: docs/docs_planning/3_3_5_startup_ai_fill.md §2.2

import { readZipIndex, readZipText, type ZipEntry } from './zip.ts'

export const OFFICE_MIMES = {
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
} as const

const OFFICE_MIME_SET: ReadonlySet<string> = new Set(Object.values(OFFICE_MIMES))

/** 시트 하나에서 읽을 행 수. 표가 크면 앞부분만 봐도 구조와 최근 값이 다 들어온다. */
const MAX_ROWS = 400
/** 한 파일에서 뽑을 글자 수. 글자 예산(limits.ts)에 닿기 전에 파일 스스로 멈춘다. */
const MAX_CHARS = 200_000

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

/** 줄 앞뒤 공백을 걷고 빈 줄을 접는다. 상한을 넘으면 앞부분만 남긴다. */
function tidy(text: string): string {
  const out = text
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
  return out.length > MAX_CHARS ? `${out.slice(0, MAX_CHARS)}\n[이하 생략 — 내용이 길어 앞부분만 읽었습니다]` : out
}

/** 태그 하나의 속성을 읽는다(따옴표 안의 값만). */
function attr(tag: string, name: string): string | null {
  const m = new RegExp(`${name}="([^"]*)"`).exec(tag)
  return m ? unescapeXml(m[1]!) : null
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

async function pptxText(buf: ArrayBuffer, index: Map<string, ZipEntry>): Promise<string> {
  const slides = [...index.keys()]
    .filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n))
    .sort((a, b) => slideNo(a) - slideNo(b))
  const parts: string[] = []
  for (const name of slides) {
    const xml = await readZipText(buf, index.get(name)!)
    const body = xml ? slideText(xml) : ''
    // 글자가 없는 장표는 그림뿐이라는 뜻이다. 번호만 남겨 둔다 — 비어 있다는 사실도 정보다.
    parts.push(`[슬라이드 ${slideNo(name)}]\n${body || '(글자 없음 — 이미지 장표)'}`)
  }
  return parts.join('\n\n')
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

/** 시트 하나를 탭으로 나눈 표로. 쉼표가 아니라 탭인 것은 금액에 쉼표가 섞여 오기 때문이다. */
function sheetRows(xml: string, shared: string[]): string {
  const lines: string[] = []
  const rowRe = /<row\b[^>]*>([\s\S]*?)<\/row>/g
  for (let r = rowRe.exec(xml); r && lines.length < MAX_ROWS; r = rowRe.exec(xml)) {
    const cells: string[] = []
    const cellRe = /<c\b([^>]*?)\/>|<c\b([^>]*?)>([\s\S]*?)<\/c>/g
    for (let c = cellRe.exec(r[1]!); c; c = cellRe.exec(r[1]!)) {
      const tag = c[1] ?? c[2] ?? ''
      const value = c[3] == null ? '' : cellValue(tag, c[3], shared)
      const at = columnIndex(attr(tag, 'r') ?? '')
      const i = at >= 0 ? at : cells.length
      while (cells.length < i) cells.push('')
      cells[i] = value.replace(/[\t\n\r]+/g, ' ').trim()
    }
    while (cells.length > 0 && cells[cells.length - 1] === '') cells.pop()
    if (cells.length > 0) lines.push(cells.join('\t'))
  }
  return lines.join('\n')
}

async function xlsxText(buf: ArrayBuffer, index: Map<string, ZipEntry>): Promise<string> {
  const shared = await sharedStrings(buf, index)
  const sheets = await sheetTargets(buf, index)
  const parts: string[] = []
  for (const sheet of sheets) {
    const entry = index.get(sheet.path)
    if (!entry) continue
    const xml = await readZipText(buf, entry)
    const body = xml ? sheetRows(xml, shared) : ''
    // 빈 시트는 세우지 않는다 — 서식만 잡아 둔 빈 시트가 실제로 흔하고, 이름만 나열되면
    // 모델이 그 이름을 근거로 없는 값을 지어낼 자리가 된다.
    if (body) parts.push(`[시트: ${sheet.name}]\n${body}`)
  }
  return parts.join('\n\n')
}

// ── 진입점 ─────────────────────────────────────────────────────────────

/**
 * 오피스 파일에서 글자를 뽑는다. 실패는 사람이 읽을 문구로 돌려준다 — 담당자가 고칠 수 있는
 * 문제(암호가 걸린 파일·손상된 파일)이므로 원인을 말해야 다음 행동이 정해진다.
 */
export async function officeText(
  buf: ArrayBuffer,
  mime: string,
  fileName: string,
): Promise<string | { message: string }> {
  const index = readZipIndex(buf)
  // 암호가 걸린 파일은 ZIP 구조 자체가 다르게 잠겨 여기서 걸린다.
  if (!index) return { message: `열 수 없는 파일입니다(암호가 걸렸거나 손상된 문서): ${fileName}` }

  let text = ''
  if (mime === OFFICE_MIMES.docx) {
    const entry = index.get('word/document.xml')
    const xml = entry ? await readZipText(buf, entry) : null
    text = xml ? docxText(xml) : ''
  } else if (mime === OFFICE_MIMES.pptx) {
    text = await pptxText(buf, index)
  } else if (mime === OFFICE_MIMES.xlsx) {
    text = await xlsxText(buf, index)
  }

  const tidied = tidy(text)
  if (tidied.length < 10) {
    return { message: `읽을 글자가 없습니다(그림만 있는 문서일 수 있습니다): ${fileName}` }
  }
  return tidied
}
