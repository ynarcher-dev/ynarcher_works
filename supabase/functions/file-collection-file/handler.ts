// '파일받기' 모듈의 파일 입출구 — 업로드 서명(sign) · 확정(commit) · 다운로드(download).
//
// 경계(여기서 물러서지 않는 것):
// - **판정은 끝까지 호출자 토큰**으로 한다. 대상 행 조회도 RPC도 anon 키 + 호출자 JWT
//   클라이언트로 던져 RLS를 그대로 받는다. service_role은 세 가지에만 쓴다 — Storage 서명,
//   호출자 신원 lookup(users), access_logs 적재. service_role로 file_collection_files를
//   읽고 user_id만 비교하는 우회는 만들지 않는다(그 순간 RLS가 죽고 비교문이 정책이 된다).
// - **업로드는 게스트 본인만** 한다. 내부 사용자는 읽기 권한이 있어도 게스트의 업로드를
//   대신 서명하거나 확정할 수 없다 — 읽을 수 있다는 것과 그 사람인 것은 다르다.
// - **실물이 정본이다.** commit은 Storage가 말하는 object metadata(size·contentType)를 읽어
//   등록값과 대조한다. 선언만 믿으면 1바이트로 서명받고 그 자리에 무엇이든 올릴 수 있다.
// - **로그 없는 반출은 없다.** download는 access_logs 적재가 성공한 뒤에야 서명한다
//   (material-download와 같은 계약).
// - 업로드 서명은 `upsert:false`다. 같은 경로에 새 버전을 덮어쓸 수 없고, 회차마다 서버가
//   만든 새 UUID 경로가 선다.
//
// 응답에는 저장 경로·토큰을 필요한 자리(sign 본인 업로드)에만 싣고, 에러 응답에는 어떤
// 내부 경로도 싣지 않는다.
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { jsonResponse } from '../_shared/cors.ts'
import type { VerifiedGuestSession } from '../_shared/guestSession.ts'
import {
  BUCKET,
  MAX_BODY_BYTES,
  checkObjectMetadata,
  isGuestUserType,
  isSafeStorageTarget,
  parseRequestBody,
  type FileIdInput,
  type SignInput,
} from './validation.ts'

const SIGNED_URL_TTL_SEC = 60

export interface FileCollectionDeps {
  /** service_role 클라이언트 — Storage, 신원 lookup, access_logs에만 쓴다. */
  admin: () => SupabaseClient
  /** 호출자 JWT를 그대로 실은 anon 클라이언트 — RLS/RPC는 전부 이쪽으로 간다. */
  asCaller: (token: string) => SupabaseClient
  /** 게스트 커스텀 JWT 검증. 공용 구현(_shared/guestSession.ts)을 그대로 주입한다. */
  verifyGuestSession: (db: SupabaseClient, req: Request) => Promise<VerifiedGuestSession | null>
}

interface Caller {
  userId: string
  isGuest: boolean
}

/** 어떤 응답도 캐시하지 않는다(서명 URL·파일명이 중간 캐시에 남지 않게). */
function respond(body: unknown, status = 200): Response {
  const res = jsonResponse(body, status)
  res.headers.set('Cache-Control', 'no-store')
  return res
}

interface FileRow {
  id: string
  storage_bucket: string
  storage_path: string
  original_name: string
  content_type: string
  byte_size: number
  status: string
  uploaded_by: string
}

/**
 * 호출자를 app 계정으로 푼다. 입구는 둘(내부 표준 JWT / 게스트 커스텀 JWT)이지만 나오는
 * 것은 '누구인가'뿐이고, '무엇을 할 수 있는가'는 뒤따르는 호출자 토큰 질의가 답한다.
 */
async function resolveCaller(
  deps: FileCollectionDeps,
  admin: SupabaseClient,
  req: Request,
  token: string,
): Promise<Caller | null> {
  const { data: authData } = await admin.auth.getUser(token)
  if (authData?.user) {
    const { data } = await admin
      .from('users')
      .select('id, user_type, is_active')
      .eq('auth_user_id', authData.user.id)
      .is('deleted_at', null)
      .maybeSingle()
    const row = data as { id: string; user_type: string; is_active: boolean } | null
    if (!row || row.is_active === false) return null
    return { userId: row.id, isGuest: isGuestUserType(row.user_type) }
  }

  // 게스트: 서명·만료·세션판·활성 여부를 공용 구현이 본다(차단이 즉시 먹는 자리).
  const session = await deps.verifyGuestSession(admin, req)
  if (!session) return null
  if (!isGuestUserType(session.user.user_type)) return null
  return { userId: session.user.id, isGuest: true }
}

async function handleSign(
  caller: Caller,
  asCaller: SupabaseClient,
  admin: SupabaseClient,
  input: SignInput,
): Promise<Response> {
  // 업로드는 배정받은 게스트 본인의 행위다. 내부 사용자는 여기서 끊는다(DB도 같은 판정).
  if (!caller.isGuest) return respond({ error: 'forbidden' }, 403)

  const { data, error } = await asCaller.rpc('file_collection_register_upload', {
    p_response_id: input.responseId,
    p_original_name: input.fileName,
    p_content_type: input.contentType,
    p_byte_size: input.byteSize,
  })
  if (error) return respond({ error: 'register_denied' }, 403)
  const row = (Array.isArray(data) ? data[0] : null) as
    | { file_id: string; storage_bucket: string; storage_path: string }
    | null
    | undefined
  if (!row?.file_id) return respond({ error: 'register_denied' }, 403)
  if (!isSafeStorageTarget(row.storage_bucket, row.storage_path)) {
    return respond({ error: 'internal_error' }, 500)
  }

  const { data: signed, error: signErr } = await admin.storage
    .from(BUCKET)
    .createSignedUploadUrl(row.storage_path, { upsert: false })
  if (signErr || !signed) {
    // 등록은 이미 PENDING으로 남았다. UI가 그 사실을 정직히 다룰 수 있도록 fileId를 함께
    // 돌려준다 — 숨기면 화면에는 아무 일도 없었는데 원장에만 줄이 하나 남는다.
    return respond(
      { error: 'sign_failed', fileId: row.file_id, message: '업로드 주소를 발급하지 못했습니다.' },
      500,
    )
  }

  return respond({
    fileId: row.file_id,
    bucket: BUCKET,
    path: signed.path,
    token: signed.token,
    signedUrl: signed.signedUrl,
  })
}

async function handleCommit(
  caller: Caller,
  asCaller: SupabaseClient,
  admin: SupabaseClient,
  input: FileIdInput,
): Promise<Response> {
  if (!caller.isGuest) return respond({ error: 'forbidden' }, 403)

  // 대상 메타는 호출자 토큰으로 읽는다 — 남의 줄은 RLS가 빈 결과로 답한다.
  const { data, error } = await asCaller
    .from('file_collection_files')
    .select(
      'id, storage_bucket, storage_path, original_name, content_type, byte_size, status, uploaded_by',
    )
    .eq('id', input.fileId)
    .is('deleted_at', null)
    .maybeSingle()
  if (error) return respond({ error: 'internal_error' }, 500)
  const file = data as FileRow | null
  if (!file) return respond({ error: 'forbidden' }, 403)
  // 읽을 수 있다는 사실이 '본인'을 뜻하지는 않는다. 확정은 올린 사람만 한다.
  if (file.uploaded_by !== caller.userId) return respond({ error: 'forbidden' }, 403)
  if (!isSafeStorageTarget(file.storage_bucket, file.storage_path)) {
    return respond({ error: 'internal_error' }, 500)
  }

  if (file.status === 'PENDING') {
    const { data: info } = await admin.storage.from(BUCKET).info(file.storage_path)
    const check = checkObjectMetadata(
      info ? { size: info.size, contentType: info.contentType } : null,
      { byteSize: file.byte_size, contentType: file.content_type },
    )
    if (!check.ok) {
      const status = check.error === 'object_missing' ? 404 : 400
      return respond({ error: check.error }, status)
    }
  } else if (file.status !== 'READY') {
    // 삭제·반려 등 우리가 모르는 상태에서 확정으로 넘어가지 않는다.
    return respond({ error: 'invalid_state' }, 409)
  }
  // READY는 실물 대조를 되풀이하지 않고 그대로 RPC로 간다. 확정 응답이 유실된 뒤의 재시도가
  // 실패하면 안 되기 때문이다 — 다만 그냥 200을 돌려주는 것이 아니라, 본인 확인과 경로 방어를
  // 지난 뒤 DB에 다시 물어 권한을 재검증한다(DB가 배정 유효성을 본 뒤 멱등하게 답한다).

  // 회차·모듈 마감·배정 취소의 재검증은 DB가 한다(Edge 검사만으로 확정하지 않는다).
  // 크기·형식은 DB가 storage.objects에서 직접 읽으므로 인자는 파일 id 하나뿐이다.
  const { error: commitErr } = await asCaller.rpc('file_collection_commit_upload', {
    p_file_id: file.id,
  })
  if (commitErr) return respond({ error: 'commit_denied' }, 403)

  return respond({ fileId: file.id })
}

async function handleDownload(
  caller: Caller,
  asCaller: SupabaseClient,
  admin: SupabaseClient,
  input: FileIdInput,
): Promise<Response> {
  const { data, error } = await asCaller.rpc('file_collection_authorize_download', {
    p_file_id: input.fileId,
  })
  if (error) return respond({ error: 'forbidden' }, 403)
  const row = (Array.isArray(data) ? data[0] : null) as
    | { storage_bucket: string; storage_path: string; original_name: string }
    | null
    | undefined
  if (!row?.storage_path) return respond({ error: 'forbidden' }, 403)
  if (!isSafeStorageTarget(row.storage_bucket, row.storage_path)) {
    return respond({ error: 'internal_error' }, 500)
  }

  // 로그가 먼저다. 남기지 못하면 서명하지 않는다.
  const { error: logErr } = await admin.from('access_logs').insert({
    user_id: caller.userId,
    resource_type: 'file_collection_download',
    resource_id: input.fileId,
    reason: `파일받기 다운로드: ${row.original_name}`,
  })
  if (logErr) {
    return respond({ error: 'log_failed', message: '다운로드 기록을 남기지 못했습니다.' }, 500)
  }

  const { data: signed, error: signErr } = await admin.storage
    .from(BUCKET)
    .createSignedUrl(row.storage_path, SIGNED_URL_TTL_SEC, { download: row.original_name })
  if (signErr || !signed) return respond({ error: 'sign_failed' }, 500)

  return respond({ url: signed.signedUrl, fileName: row.original_name })
}

/**
 * 본문을 상한까지만 읽는다. `req.text()`는 Content-Length를 속인(또는 chunked로 생략한)
 * 요청에서 끝까지 메모리에 쌓으므로, 헤더 사전 검사만으로는 막을 수 없다. 상한을 넘는
 * 순간 스트림을 취소해 나머지를 받지 않는다. 상한은 **UTF-8 바이트** 기준이다 —
 * `string.length`는 코드 단위 수라 한글 본문에서 실제 바이트와 세 배까지 어긋난다.
 */
async function readBoundedBody(req: Request): Promise<{ ok: true; text: string } | { ok: false }> {
  const body = req.body
  if (!body) return { ok: true, text: '' }
  const reader = body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      if (!value) continue
      total += value.byteLength
      if (total > MAX_BODY_BYTES) {
        await reader.cancel().catch(() => {})
        return { ok: false }
      }
      chunks.push(value)
    }
  } finally {
    reader.releaseLock()
  }
  const merged = new Uint8Array(total)
  let at = 0
  for (const c of chunks) {
    merged.set(c, at)
    at += c.byteLength
  }
  // 깨진 UTF-8은 치환 문자가 되어 아래 JSON.parse에서 400으로 떨어진다.
  return { ok: true, text: new TextDecoder().decode(merged) }
}

/**
 * 배선을 주입받는 핸들러 본체. index.ts는 실제 클라이언트를, 테스트는 대역을 넣어 같은
 * 순서(인증 → 검증 → RLS 판정 → 로그 → 서명)를 그대로 지나게 한다.
 */
export function createFileCollectionHandler(deps: FileCollectionDeps) {
  return async (req: Request): Promise<Response> => {
    if (req.method !== 'POST') return respond({ error: 'method_not_allowed' }, 405)

    try {
      // `Bearer <token>` 한 가지 모양만 받는다. 접두사를 느슨하게 떼면 `Basic ...`의
      // 나머지나 헤더 전체가 토큰으로 재해석되어, 다른 인증 수단의 값이 우리 검증기로 들어간다.
      const authHeader = req.headers.get('Authorization') ?? ''
      const bearer = /^Bearer +([^\s]+)$/.exec(authHeader)
      const token = bearer?.[1] ?? ''
      if (!token) return respond({ error: 'unauthorized' }, 401)

      const declared = Number(req.headers.get('content-length') ?? '0')
      if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) {
        return respond({ error: 'payload_too_large' }, 413)
      }
      const read = await readBoundedBody(req)
      if (!read.ok) return respond({ error: 'payload_too_large' }, 413)

      let body: unknown = null
      try {
        body = JSON.parse(read.text || 'null')
      } catch {
        return respond({ error: 'invalid_request' }, 400)
      }
      const parsed = parseRequestBody(body)
      if (!parsed.ok) return respond({ error: parsed.error }, 400)

      const admin = deps.admin()
      const caller = await resolveCaller(deps, admin, req, token)
      if (!caller) return respond({ error: 'unauthorized' }, 401)
      const asCaller = deps.asCaller(token)

      if (parsed.value.action === 'sign') {
        return await handleSign(caller, asCaller, admin, parsed.value)
      }
      if (parsed.value.action === 'commit') {
        return await handleCommit(caller, asCaller, admin, parsed.value)
      }
      return await handleDownload(caller, asCaller, admin, parsed.value)
    } catch (e) {
      if (e instanceof Error && e.message === 'jwt_secret_missing') {
        return respond({ error: 'jwt_secret_missing' }, 500)
      }
      return respond({ error: 'internal_error' }, 500)
    }
  }
}
