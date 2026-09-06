// [자료 분석] 자료 한 건을 조각으로 여는 진입점 — 브라우저와 서버가 함께 쓴다.
//
// **무엇을 열고 무엇을 열지 않는지가 여기서 갈린다.**
//   * 열 수 있는 것: 오피스 3종과 글자 계열(TXT·CSV·JSON·HTML·XML·RTF).
//   * **열지 않는 것: PDF와 이미지.** 이 둘은 모델이 눈으로 보듯 읽으므로 원본 그대로 보낸다.
//     장표 PDF는 표와 숫자가 시각 배치로 들어 있어, 글자만 뽑으면 행·열이 흐트러져 초안이
//     지금보다 나빠진다. 전환은 실제 사업계획서로 원본 경로와 나란히 비교한 뒤에 정한다.
//
// **OCR은 없다.** Edge Function은 요청당 CPU가 2초라 wasm OCR이 돌지 못하고, 브라우저에서도
// 무게에 비해 얻는 것이 적다. 스캔본은 지금처럼 모델이 원본을 보고 읽는다.
//
// Deno API를 쓰지 않는다(works vitest와 브라우저가 이 파일을 직접 돌린다).
// 근거: docs/docs_planning/3_3_5_startup_ai_fill.md §16.2

import { isOfficeMime, officeChunks } from './officeText.ts'
import { textChunks } from './textParse.ts'
import {
  countChars,
  isExtractableMime,
  MAX_EXTRACT_CHARS,
  needsOriginal,
  type ExtractChunk,
  type ExtractResult,
  type ExtractSummary,
} from './types.ts'

// 판정 자체는 `types.ts`가 갖는다(화면이 파서를 끌고 오지 않고 상태를 그릴 수 있어야 한다).
// 여기서 다시 내보내는 것은 **여는 쪽에서 부르는 이름이 여기이기 때문**이다.
export { isExtractableMime, needsOriginal }

/** 조각들에서 화면이 세울 건수를 뽑는다. */
export function summarize(chunks: ExtractChunk[]): ExtractSummary {
  const count = (kind: ExtractChunk['kind']) => chunks.filter((c) => c.kind === kind).length
  const chars = countChars(chunks)
  const tables = chunks.reduce((sum, c) => sum + c.tables.length, 0)
  const summary: ExtractSummary = { chars }
  if (count('sheet') > 0) summary.sheets = count('sheet')
  if (count('paragraph') > 0) summary.paragraphs = count('paragraph')
  if (count('slide') > 0) summary.slides = count('slide')
  if (tables > 0) summary.tables = tables
  // 상한에 닿았으면 앞부분만 담긴 것이다. 조용히 자르면 왜 초안이 부실한지 알 수 없다.
  if (chars >= MAX_EXTRACT_CHARS) summary.truncated = true
  return summary
}

/** 조각 목록을 결과 봉투로. 읽을 글자가 없으면 실패로 답한다(빈 성공을 만들지 않는다). */
export function toResult(chunks: ExtractChunk[], fileName: string): ExtractResult {
  const usable = chunks.filter((c) => c.text.trim().length > 0 || c.tables.length > 0)
  // 표가 있으면 글자가 짧아도 읽은 것이다(officeText의 같은 판정과 한 벌).
  const hasTable = usable.some((c) => c.tables.length > 0)
  if (usable.length === 0 || (!hasTable && countChars(usable) < 10)) {
    return { status: 'failed', reason: `읽을 글자가 없습니다(그림만 있는 문서일 수 있습니다): ${fileName}` }
  }
  return { status: 'ready', body: { chunks: usable }, summary: summarize(usable) }
}

/**
 * 자료 한 건을 연다.
 *
 * 실패는 던지지 않고 **사유가 담긴 값**으로 돌려준다 — 다섯 중 하나가 암호 걸린 파일이라고
 * 나머지 넷까지 분석하지 못할 이유가 없고, 대부분 담당자가 고칠 수 있는 문제라 사유가
 * 화면에 그대로 서야 한다.
 */
export async function extractBytes(
  bytes: ArrayBuffer,
  mime: string,
  fileName: string,
): Promise<ExtractResult> {
  if (needsOriginal(mime)) {
    return { status: 'failed', reason: `이 형식은 원본 그대로 분석합니다: ${fileName}` }
  }

  if (isOfficeMime(mime)) {
    const read = await officeChunks(bytes, mime, fileName)
    if (!Array.isArray(read)) return { status: 'failed', reason: read.message }
    return toResult(read, fileName)
  }

  // 글자 계열. 깨진 바이트는 대체 문자로 눕히고 계속한다 — 인코딩이 어긋난 파일도 대개
  // 상당 부분은 읽히고, 통째로 버리면 담당자는 왜 못 읽었는지 알 수 없다.
  const raw = new TextDecoder('utf-8').decode(bytes)
  return toResult(textChunks(raw, mime), fileName)
}

/**
 * 이미 글자로 손에 있는 것(링크 본문)을 조각으로. 서버의 링크 경로가 쓴다.
 *
 * 자리 표시 앞에 `label`(주소)을 세우는 것은 링크가 **파일과 달리 이름으로 구별되지 않기**
 * 때문이다 — 링크 셋을 한 카드에 붙이면 `본문 1/3`만으로는 어느 주소의 앞부분인지 모른다.
 */
export function extractText(raw: string, mime: string, label: string): ExtractResult {
  const chunks = textChunks(raw, mime).map((c) => ({
    ...c,
    kind: 'link' as const,
    location: c.location === '본문' ? label : `${label} · ${c.location}`,
  }))
  return toResult(chunks, label)
}
