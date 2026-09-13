// '파일받기' 모듈의 순수 입력 검증 — DB도 Storage도 부르지 않는다.
//
// 여기서 거르는 것은 **모양**뿐이고, 권한은 끝까지 RLS/RPC가 답한다(handler.ts 머리글).
// 모양 검사를 따로 떼 둔 이유는, 이 판정이 브라우저가 보낸 값 하나하나에 붙어 있어
// 경계값(0바이트·100MB+1·빈 이름·경로 문자)을 개별로 세워 두어야 하기 때문이다.

/** 전용 비공개 버킷. 기존 attachments와 섞지 않는다. */
export const BUCKET = 'file-collection'

/** 업로드 상한. sign(선언값)과 commit(실물 metadata) 양쪽에서 같은 값으로 본다. */
export const MAX_BYTE_SIZE = 100 * 1024 * 1024

/** 파일명 상한(원본 한글 이름을 그대로 보존하므로 바이트가 아니라 글자 수로 본다). */
export const MAX_FILE_NAME_LENGTH = 255

/** 요청 본문 상한 — 메타데이터만 오가는 API라 킬로바이트면 충분하다. */
export const MAX_BODY_BYTES = 8 * 1024

/**
 * 자격증명 원장이 붙는 계정 유형(= 게스트). SSOT는 DB의 `app.is_guest_user_type`이며,
 * 여기 사본은 "내부 사용자가 게스트의 업로드를 대신 확정하지 못한다"는 경계를 Edge에서도
 * 한 번 더 세우기 위한 것이다. 판정이 갈리면 DB 쪽이 정본이다.
 */
const GUEST_USER_TYPES = new Set(['external_startup', 'external_expert', 'temporary_guest'])

export function isGuestUserType(userType: string | null | undefined): boolean {
  return !!userType && GUEST_USER_TYPES.has(userType)
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_RE.test(value.trim())
}

// eslint-disable-next-line no-control-regex -- 제어문자는 파일명·경로 어느 쪽에도 통과시키지 않는다.
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/
const CONTENT_TYPE_RE = /^[A-Za-z0-9!#$%&'*+.^_`|~-]+\/[A-Za-z0-9!#$%&'*+.^_`|~-]+$/

/**
 * 원본 파일명을 보존하되 경로로 읽힐 수 있는 값은 거절한다. 저장 경로는 서버가 만든
 * UUID이므로 이 값이 경로에 들어가지는 않지만, 다운로드 응답 헤더(`download=`)로 다시
 * 나가는 값이라 제어문자·구분자를 통과시키지 않는다.
 */
export function normalizeFileName(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const name = raw.trim()
  if (!name) return null
  if (name.length > MAX_FILE_NAME_LENGTH) return null
  if (CONTROL_CHARS.test(name)) return null
  if (name.includes('/') || name.includes('\\')) return null
  // `..`를 이름 **전체**로 쓴 경우만 막는다. 부분 문자열까지 막으면 `보고서 v1..2.pdf` 같은
  // 정상 파일명이 거절되는데, 얻는 것은 없다 — 저장 경로는 서버가 만든 UUID이고 이 값은
  // 경로에 들어가지 않는다(경로 쪽 방어는 isSafeStorageTarget이 따로 유지한다).
  if (name === '.' || name === '..') return null
  return name
}

/** `type/subtype`만 받고 파라미터(`; charset=...`)는 떼어 소문자로 맞춘다. */
export function normalizeContentType(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const base = raw.split(';')[0].trim().toLowerCase()
  if (!base || base.length > 200) return null
  if (!CONTENT_TYPE_RE.test(base)) return null
  return base
}

export function normalizeByteSize(raw: unknown): number | null {
  const n = typeof raw === 'number' ? raw : Number.NaN
  if (!Number.isSafeInteger(n)) return null
  if (n < 1 || n > MAX_BYTE_SIZE) return null
  return n
}

/**
 * RPC가 돌려준 저장 위치를 한 번 더 본다. 경로를 만드는 쪽은 DB이지만, 여기서 그대로
 * service_role Storage 호출에 실리므로 버킷이 어긋나거나 상위 경로가 섞인 값은 서명하지
 * 않는다 — RPC가 언젠가 바뀌어도 이 함수가 남는 쪽이 안전하다.
 */
export function isSafeStorageTarget(bucket: unknown, path: unknown): boolean {
  if (bucket !== BUCKET) return false
  if (typeof path !== 'string') return false
  const p = path.trim()
  if (!p || p !== path) return false
  if (p.length > 512) return false
  if (p.startsWith('/') || p.includes('//')) return false
  if (p.includes('..')) return false
  if (CONTROL_CHARS.test(p)) return false
  return true
}

export type Action = 'sign' | 'commit' | 'download'

export interface SignInput {
  action: 'sign'
  responseId: string
  fileName: string
  contentType: string
  byteSize: number
}

export interface FileIdInput {
  action: 'commit' | 'download'
  fileId: string
}

export type ParsedRequest = SignInput | FileIdInput

/** 본문 파싱 결과. 실패는 응답에 그대로 실릴 코드만 돌려준다(내부 값 노출 없음). */
export type ParseResult =
  | { ok: true; value: ParsedRequest }
  | { ok: false; error: 'invalid_request' | 'unsupported_action' }

export function parseRequestBody(body: unknown): ParseResult {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { ok: false, error: 'invalid_request' }
  }
  const b = body as Record<string, unknown>
  const action = typeof b.action === 'string' ? b.action : ''

  if (action === 'sign') {
    const responseId = isUuid(b.responseId) ? b.responseId.trim() : null
    const fileName = normalizeFileName(b.fileName)
    const contentType = normalizeContentType(b.contentType)
    const byteSize = normalizeByteSize(b.byteSize)
    if (!responseId || !fileName || !contentType || byteSize === null) {
      return { ok: false, error: 'invalid_request' }
    }
    return { ok: true, value: { action: 'sign', responseId, fileName, contentType, byteSize } }
  }

  if (action === 'commit' || action === 'download') {
    if (!isUuid(b.fileId)) return { ok: false, error: 'invalid_request' }
    return { ok: true, value: { action, fileId: b.fileId.trim() } }
  }

  return { ok: false, error: 'unsupported_action' }
}

/**
 * commit 시점의 실물 대조. 선언값(sign에서 받은 값)과 Storage가 말하는 실제 object
 * metadata가 어긋나면 확정하지 않는다 — 선언만 믿으면 1바이트로 서명받고 1GB를 올리는
 * 자리가 열린다.
 */
export type ObjectCheck =
  | { ok: true; byteSize: number; contentType: string }
  | { ok: false; error: 'object_missing' | 'metadata_mismatch' | 'too_large' | 'empty_file' }

export function checkObjectMetadata(
  info: { size?: number | null; contentType?: string | null } | null,
  registered: { byteSize: number; contentType: string },
): ObjectCheck {
  if (!info) return { ok: false, error: 'object_missing' }
  const size = typeof info.size === 'number' ? info.size : null
  if (size === null || size <= 0) return { ok: false, error: 'empty_file' }
  if (size > MAX_BYTE_SIZE) return { ok: false, error: 'too_large' }
  if (size !== registered.byteSize) return { ok: false, error: 'metadata_mismatch' }
  const actualType = normalizeContentType(info.contentType)
  if (!actualType) return { ok: false, error: 'metadata_mismatch' }
  if (actualType !== normalizeContentType(registered.contentType)) {
    return { ok: false, error: 'metadata_mismatch' }
  }
  return { ok: true, byteSize: size, contentType: actualType }
}
