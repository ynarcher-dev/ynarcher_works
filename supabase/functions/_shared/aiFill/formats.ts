// [AI 작성하기] 모델이 읽을 수 있는 형식과, 확장자에서 그 형식을 알아내는 규칙.
//
// 형식은 두 갈래다. **모델이 그대로 받는 것**(PDF·이미지·글자 계열)은 Gemini 공식 목록
// 그대로이며 우리가 임의로 늘리지 않는다 — 목록에 없는 것을 보내면 요청이 통째로 400으로
// 죽어, 고른 자료 열넷 중 하나 때문에 나머지 열셋도 못 읽는다. **우리가 열어서 읽는 것**
// (xlsx·docx·pptx)은 모델에 그대로 보내지 않고 서버가 압축을 풀어 글자로 바꿔 보낸다
// (officeText.ts). 두 갈래를 한 표에 두지 않는 이유는 보내는 방식이 다르기 때문이다.
//
// **PDF와 이미지만 '본다'는 사실이 이 파일의 전제다.** 나머지 형식은 글자만 뽑혀 들어가고, 문서를 화면에
// 그린 모습(표 괘선·차트·레이아웃)은 모델에 닿지 않는다. 그래서 표가 그림으로 들어간 문서를
// 텍스트 형식으로 넣으면 조용히 빈 결과가 나온다 — 화면이 그 사실을 미리 말해야 한다.
//
// 확장자로도 판정하는 이유는 `content_type`이 비어 있거나 틀린 행이 실제로 있기 때문이다.
// 업로드는 브라우저가 준 값을 그대로 적는데, 브라우저는 형식을 모르면 빈 값이나
// `application/octet-stream`을 준다.
//
// Deno API를 쓰지 않는다(works vitest가 이 판정을 직접 돌린다).
// 근거: docs/docs_planning/3_3_5_startup_ai_fill.md §2.1·§9

import { isOfficeMime, OFFICE_MIMES } from '../docParse/officeText.ts'

/** 모델이 그대로 받는 MIME. 이 목록 밖은 그대로 보내지 않는다. */
const SUPPORTED_MIMES = new Set([
  'application/pdf',
  'application/json',
  'text/plain',
  'text/csv',
  'text/html',
  'text/xml',
  'text/rtf',
  'text/css',
  'text/javascript',
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/bmp',
])

/**
 * 확장자 → 보낼 MIME.
 *
 * 마크다운이 `text/plain`인 것이 이 표에서 가장 중요한 줄이다. 문서에는 마크다운이 지원
 * 목록에 있다고 적혀 있지만 실제로는 거부되며, 내용이 어차피 글자라 평문으로 보내면 그만이다.
 * 확장자를 보고 우리가 바꿔 주지 않으면 담당자는 이유를 알 수 없는 실패를 본다.
 */
const EXTENSION_MIMES: Record<string, string> = {
  pdf: 'application/pdf',
  // 우리가 열어서 읽는 것들. 구형(.xls·.doc·.ppt)은 ZIP이 아니라 다른 이진 형식이라 못 연다.
  xlsx: OFFICE_MIMES.xlsx,
  docx: OFFICE_MIMES.docx,
  pptx: OFFICE_MIMES.pptx,
  // 글자만 담긴 것들 — 평문으로 보낸다.
  txt: 'text/plain',
  md: 'text/plain',
  markdown: 'text/plain',
  log: 'text/plain',
  tsv: 'text/plain',
  csv: 'text/csv',
  html: 'text/html',
  htm: 'text/html',
  xml: 'text/xml',
  rtf: 'text/rtf',
  json: 'application/json',
  css: 'text/css',
  js: 'text/javascript',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  bmp: 'image/bmp',
}

/** 담당자에게 보여 줄 지원 형식 안내(화면과 서버가 같은 문구를 쓴다). */
export const SUPPORTED_HINT =
  'PDF · 이미지(PNG·JPG·WEBP·BMP) · 오피스(XLSX·DOCX·PPTX) · 텍스트(TXT·MD·CSV·HTML·XML·RTF·JSON)'

function extensionOf(fileName: string): string {
  return /\.([a-z0-9]+)$/i.exec(fileName)?.[1]?.toLowerCase() ?? ''
}

/**
 * 이 자료를 모델에 보낼 수 있는가. 보낼 수 있으면 **보낼 MIME**을, 아니면 null을 돌려준다.
 *
 * 확장자를 먼저 본다. 저장된 `content_type`보다 파일 이름이 더 자주 맞기 때문이다 — 이름은
 * 사람이 붙이고 형식 값은 브라우저가 추측한다. 이름에서 알 수 없을 때만 저장된 값을 믿는다.
 */
export function resolveMime(contentType: string | null | undefined, fileName: string): string | null {
  const byExt = EXTENSION_MIMES[extensionOf(fileName)]
  if (byExt) return byExt
  const ct = (contentType ?? '').split(';')[0].trim().toLowerCase()
  if (SUPPORTED_MIMES.has(ct) || isOfficeMime(ct)) return ct
  // 별칭 몇 가지 — 같은 것을 다르게 적는 값들이라 목록을 늘리는 것이 아니다.
  if (ct === 'image/jpg') return 'image/jpeg'
  if (ct === 'text/markdown' || ct === 'text/md') return 'text/plain'
  if (ct === 'application/xml') return 'text/xml'
  return null
}

/** 글자로만 이해되는 형식인가(PDF·이미지가 아닌 것). 화면이 한계를 안내할 때 쓴다. */
export function isTextOnlyMime(mime: string): boolean {
  return !(mime === 'application/pdf' || mime.startsWith('image/'))
}
