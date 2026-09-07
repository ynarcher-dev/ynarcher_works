import { extractBytes } from '@docparse/extract.ts'
import type { ExtractResult } from '@docparse/types.ts'

/**
 * 자료 분석 작업자 — 파일 하나를 열어 조각으로 만든다.
 *
 * **화면 스레드에서 하지 않는 이유**는 큰 XLSX·PPTX의 압축 해제와 XML 훑기가 수 초를 먹기
 * 때문이다. 그 일을 화면에서 하면 모달이 굳고, 굳은 화면은 진척을 말하지 못한다 — 담당자는
 * 브라우저가 죽은 것으로 읽는다.
 *
 * **서버에서 하지 않는 이유**는 Edge Function이 요청당 CPU 2초이기 때문이다(3_3_5 §16.2).
 *
 * 이 파일은 `new Worker(new URL(...), { type: 'module' })`로만 불린다. 그래서 파서가 첫 화면
 * 번들에 실리지 않고, AI 작성 모달에서 분석을 누르는 순간에 받아진다.
 *
 * 근거: docs/docs_planning/3_3_5_startup_ai_fill.md §16.2·§16.3
 */

export interface DocParseRequest {
  /** 어느 자료의 답인지. 화면의 자료 키를 그대로 돌려준다. */
  key: string
  bytes: ArrayBuffer
  mime: string
  fileName: string
}

export interface DocParseResponse {
  key: string
  result: ExtractResult
}

/**
 * 작업자 전역. DOM 타입과 겹치지 않게 필요한 두 개만 좁혀 쓴다 — `WebWorker` 라이브러리를
 * 켜면 앱 전체의 `self` 타입이 바뀐다.
 */
const ctx = self as unknown as {
  onmessage: ((event: MessageEvent<DocParseRequest>) => void) | null
  postMessage: (message: DocParseResponse) => void
}

ctx.onmessage = async (event) => {
  const { key, bytes, mime, fileName } = event.data
  try {
    ctx.postMessage({ key, result: await extractBytes(bytes, mime, fileName) })
  } catch (e) {
    // 파서가 던지는 일은 없어야 하지만, 던지면 그 자료 한 건만 실패로 답한다 — 작업자가
    // 조용히 죽으면 화면은 영원히 '분석 중'에 머문다.
    ctx.postMessage({
      key,
      result: { status: 'failed', reason: `자료를 여는 중 오류가 발생했습니다: ${fileName}` },
    })
    console.error('[docParseWorker] 분석 예외', e instanceof Error ? e.message : e)
  }
}
