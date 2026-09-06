// [자료 분석] 들어온 요청을 우리 모양으로 읽고, 원장 행과 어긋나는지 본다.
//
// **이 파일이 신뢰 경계다.** 파일 분석은 브라우저가 하므로 서버는 그 결과가 정말 그 첨부에서
// 나온 것인지 알 수 없다. 그래서 여기서 묻는 것은 내용의 진위가 아니라 **말이 맞는가**다 —
// 요청이 말하는 파일 이름·형식·크기가 원장 행과 같은가, 파서 버전이 우리가 아는 값인가.
//
// 어긋나면 전부 거절한다. 부분 처리를 하지 않는 이유는 `sources.ts`가 첨부 id를 다룰 때와
// 같다 — 하나라도 어긋난 요청에서 무엇을 저장했는지가 흐려지면, 나중에 그 캐시가 무엇인지
// 답할 수 없다.
//
// Deno API를 쓰지 않는다(works vitest가 이 판정을 직접 돌린다).
// 근거: docs/docs_planning/3_3_5_startup_ai_fill.md §16.2·§16.11

import { PARSER_VERSION } from '../_shared/docParse/types.ts'

/** 브라우저가 보낸 분석 결과의 세 갈래. */
export type ClientResult =
  | { status: 'ready'; body: unknown }
  | { status: 'failed'; reason: string }
  | { status: 'original' }

export interface ExtractRequest {
  /** 수정 모드의 대상 기업. 등록 모드에는 없다(가리킬 행이 아직 없다). */
  startupId: string | null
  /** 저장 대상 첨부. 없으면 등록 모드이며 **아무것도 저장하지 않는다.** */
  attachmentId: string | null
  source: 'file' | 'link'
  parserVersion: string
  contentHash: string | null
  fileName: string
  mime: string
  byteSize: number
  /** 링크 자료의 주소(파일은 null). 내용은 서버가 가져온다. */
  url: string | null
  /**
   * 브라우저가 열어 보낸 결과. **등록 모드의 보류 파일에서만 온다.**
   *
   * 원장에 있는 첨부는 서버가 직접 연다 — 브라우저는 스토리지 바이트를 읽을 수 없기
   * 때문이다(2026-07-16에 클라이언트 직접 다운로드를 닫았고, 그 통제를 되돌리지 않는다).
   * 그 결과 **캐시에 저장되는 것은 언제나 서버가 만든 값**이고, 밖에서 들어온 값은 저장되지
   * 않는 등록 모드에만 머문다.
   */
  result: ClientResult | null
}

export interface RequestError {
  code: 'invalid_request' | 'stale_parser'
  message: string
  status: 400 | 409
}

const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '')

function readResult(raw: unknown): ClientResult | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const src = raw as Record<string, unknown>
  const status = str(src.status)
  if (status === 'ready') return { status: 'ready', body: src.body }
  if (status === 'original') return { status: 'original' }
  if (status === 'failed') {
    const reason = str(src.reason).slice(0, 500)
    return { status: 'failed', reason: reason || '자료를 분석하지 못했습니다.' }
  }
  return null
}

/**
 * 요청 한 건을 읽는다.
 *
 * **파서 버전이 다르면 409로 돌려보낸다.** 옛 화면이 열어 보낸 글자를 새 규칙의 결과인 척
 * 저장하면, 그 캐시가 어느 규칙으로 만들어졌는지 아무도 답할 수 없다. 화면은 이 답을 받으면
 * 새로고침을 안내한다(조용히 저장하고 나중에 어긋나는 것보다 낫다).
 */
export function readRequest(raw: unknown): ExtractRequest | { error: RequestError } {
  const bad = (message: string): { error: RequestError } => ({
    error: { code: 'invalid_request', message, status: 400 },
  })
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return bad('요청 형식이 올바르지 않습니다.')
  const src = raw as Record<string, unknown>

  const source = str(src.source)
  if (source !== 'file' && source !== 'link') return bad('분석할 자료의 종류가 없습니다.')

  const parserVersion = str(src.parserVersion)
  if (parserVersion !== PARSER_VERSION) {
    return {
      error: {
        code: 'stale_parser',
        message: '화면이 오래된 분석기를 쓰고 있습니다. 새로고침 후 다시 시도하세요.',
        status: 409,
      },
    }
  }

  const url = str(src.url)
  if (source === 'link' && !/^https?:\/\//i.test(url)) return bad('읽을 주소가 올바르지 않습니다.')

  const attachmentId = str(src.attachmentId) || null
  const result = readResult(src.result)
  // 저장 대상이 없는 파일(등록 모드의 보류 파일)은 브라우저가 연 결과가 함께 와야 한다.
  // 저장 대상이 있으면 서버가 스토리지에서 직접 열므로 결과를 받지 않는다.
  if (source === 'file' && !attachmentId && !result) return bad('분석 결과가 없습니다.')

  const byteSize = Number(src.byteSize)
  return {
    startupId: str(src.startupId) || null,
    attachmentId,
    source,
    parserVersion,
    contentHash: str(src.contentHash) || null,
    fileName: str(src.fileName).slice(0, 300),
    mime: str(src.mime).slice(0, 200),
    byteSize: Number.isFinite(byteSize) && byteSize >= 0 ? Math.trunc(byteSize) : 0,
    url: url || null,
    result,
  }
}

/** 원장 행에서 대조에 쓰는 부분만. */
export interface AttachmentFacts {
  targetType: string
  targetId: string
  fileName: string
  kind: 'FILE' | 'LINK'
  url: string | null
  byteSize: number | null
  /** 원장의 형식 값에서 우리가 정한 보낼 MIME(화면과 같은 규칙으로 푼 값). */
  mime: string | null
}

/**
 * 요청이 말하는 자료가 그 첨부 행과 같은 것인지 본다.
 *
 * 크기를 **같은 값으로 맞추는 것**이 요점이다. 이름과 형식만 맞추면 같은 이름의 다른 파일을
 * 분석한 결과를 그 행에 심을 수 있다. 반대로 원장에 크기가 비어 있는 옛 행은 크기로 대조할
 * 수 없으므로 그 조건만 건너뛴다(대조할 값이 없는 것과 어긋나는 것은 다르다).
 */
export function verifyAgainstAttachment(
  req: ExtractRequest,
  row: AttachmentFacts,
  startupId: string,
): string | null {
  if (row.targetType !== 'startup' || row.targetId !== startupId) {
    return '이 기업의 자료가 아닙니다.'
  }
  if (req.source === 'link' ? row.kind !== 'LINK' : row.kind !== 'FILE') {
    return '자료의 종류가 원장과 다릅니다.'
  }
  if (req.source === 'link') {
    if ((row.url ?? '') !== (req.url ?? '')) return '주소가 원장과 다릅니다.'
    return null
  }
  if (row.fileName !== req.fileName) return '파일 이름이 원장과 다릅니다.'
  if (row.mime && req.mime && row.mime !== req.mime) return '파일 형식이 원장과 다릅니다.'
  if (row.byteSize != null && row.byteSize !== req.byteSize) return '파일 크기가 원장과 다릅니다.'
  return null
}
