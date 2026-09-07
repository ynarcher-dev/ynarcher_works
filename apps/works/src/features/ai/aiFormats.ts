import { isLinkMaterial, type Material } from '@/features/networks/materialHooks'

/**
 * 'AI 작성하기'가 읽을 수 있는 형식 — 화면 쪽 판정.
 *
 * 서버(`supabase/functions/startup-ai-fill/formats.ts`)와 **같은 목록**이어야 한다. 어긋나면
 * 화면에서는 고를 수 있는데 서버가 거절하거나, 읽을 수 있는 자료가 회색으로 잠긴다. 런타임이
 * 달라(Deno / 브라우저 번들) 한 모듈을 공유할 수 없으므로 목록을 두 곳에 두되,
 * `startupAiFormats.test.ts`가 두 목록이 같은지 확인한다.
 *
 * 근거: docs/docs_planning/3_3_5_startup_ai_fill.md §2.1
 */

/** 확장자 → 보낼 MIME. 서버 EXTENSION_MIMES와 한 벌이다. */
export const AI_EXTENSION_MIMES: Record<string, string> = {
  pdf: 'application/pdf',
  // 서버가 압축을 풀어 글자로 바꿔 보내는 것들. 구형(.xls·.doc·.ppt)은 ZIP이 아니라 못 연다.
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
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

/** 서버 SUPPORTED_MIMES + 오피스 3종과 한 벌(둘 다 resolveMime이 통과시키는 값이다). */
export const AI_SUPPORTED_MIMES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
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
] as const

/** 담당자에게 보여 줄 지원 형식 안내. 서버 SUPPORTED_HINT와 같은 문구다. */
export const AI_SUPPORTED_HINT =
  'PDF · 이미지(PNG·JPG·WEBP·BMP) · 오피스(XLSX·DOCX·PPTX) · 텍스트(TXT·MD·CSV·HTML·XML·RTF·JSON)'

function extensionOf(fileName: string): string {
  return /\.([a-z0-9]+)$/i.exec(fileName)?.[1]?.toLowerCase() ?? ''
}

/** MIME 문자열의 앞부분(파라미터 제거). `text/csv; charset=utf-8` → `text/csv`. */
function baseMime(contentType: string | null | undefined): string {
  return (contentType ?? '').split(';')[0]?.trim().toLowerCase() ?? ''
}

/** 보낼 MIME을 정한다. 못 보내면 null. 서버 resolveMime과 같은 규칙이다. */
export function resolveAiMime(contentType: string | null | undefined, fileName: string): string | null {
  const byExt = AI_EXTENSION_MIMES[extensionOf(fileName)]
  if (byExt) return byExt
  const ct = baseMime(contentType)
  if ((AI_SUPPORTED_MIMES as readonly string[]).includes(ct)) return ct
  if (ct === 'image/jpg') return 'image/jpeg'
  if (ct === 'text/markdown' || ct === 'text/md') return 'text/plain'
  if (ct === 'application/xml') return 'text/xml'
  return null
}

/**
 * 이 자료를 AI가 읽을 수 있는가.
 *
 * **링크는 언제나 읽을 수 있는 것으로 본다.** 무엇이 돌아올지는 서버가 가져와 봐야 알고,
 * 미리 회색으로 잠그면 담당자는 열어 보지도 못한 채 "이 링크는 안 되는가 보다"로 읽는다.
 * 실제로 못 읽은 링크는 실행 뒤 결과 안내가 이유와 함께 말한다.
 */
export function isAiReadable(m: Material): boolean {
  if (isLinkMaterial(m)) return true
  return resolveAiMime(m.content_type, m.file_name) !== null
}

/** 글자로만 이해되는 형식인가(PDF·이미지가 아닌 것). 화면이 한계를 안내할 때 쓴다. */
export function isTextOnlyAiMime(mime: string): boolean {
  return !(mime === 'application/pdf' || mime.startsWith('image/'))
}
