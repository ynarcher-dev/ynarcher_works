// [자료 분석] 자료 한 건을 열어 조각으로 바꾸고 캐시 원장에 남긴다 — 대상과 무관한 뼈대.
//
// 여는 일 자체는 대상을 모른다. 첨부(`attachments`)가 다형 키를 쓰고 캐시 원장도 첨부 하나에
// 행 하나라, 이 함수가 알아야 할 것은 **누가 이 레코드를 고칠 수 있는가**뿐이고 그 답은
// 프로파일이 갖는다. 그래서 대상이 늘어도 여기는 그대로다.
//
// 세 갈래로 연다.
//   * **링크** — 서버가 가져온다(무엇을 읽었는지 우리가 알아야 하고, 사설망으로 향하는 주소를
//     막는 판정을 남에게 맡길 수 없다).
//   * **원장에 있는 파일** — 서버가 스토리지에서 연다. 브라우저는 그 바이트를 읽을 수 없다
//     (마이그레이션 20260716130300이 클라이언트 직접 다운로드를 닫았고, 남은 길인
//     `material-download`는 반출 기록을 강제한다).
//   * **등록 모드의 보류 파일** — 브라우저가 연 결과가 실려 온다. **저장하지 않는다**(가리킬
//     행이 없고, 등록을 취소하면 고아 행이 남아서도 안 된다).
//
// 그래서 **저장되는 캐시는 언제나 서버가 만든 값**이고, 캐시가 오염될 경로가 없다.
//
// 보안:
// - 인증된 내부 사용자만 호출한다.
// - 쓰기 자격을 서버가 다시 묻는다(프로파일이 정책에서 꺼낸 함수를 되묻는다).
// - 첨부 메타는 **호출자 토큰**으로 조회해 RLS를 태우고, 스토리지 바이트만 service_role로 읽는다.
// - 요청이 말하는 자료와 원장 행이 다르면 거절한다(같은 이름의 다른 파일을 그 행에 심지 못한다).
// - **감사 로그를 남기지 않는다** — 분석은 자료가 밖으로 나가는 일이 아니다. 반출 기록은
//   실제로 외부 AI로 보내는 작성 단계가 남긴다. 같은 무게로 적으면 실제 반출이 흐려진다.
// - 로그에 자료 본문을 남기지 않는다.
//
// 근거: docs/docs_planning/3_3_5_startup_ai_fill.md §16.2·§16.4·§16.11·§16.16

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { jsonResponse } from '../cors.ts'
import { supabaseAdmin } from '../supabaseAdmin.ts'
import { extractBytes, extractText, needsOriginal } from '../docParse/extract.ts'
import { normalizeExtractBody } from '../docParse/sanitize.ts'
import { PARSER_VERSION, type ExtractSummary } from '../docParse/types.ts'
import { readRequest, verifyAgainstAttachment, type AttachmentFacts } from './extractRequest.ts'
import { resolveMime } from './formats.ts'
import { MAX_SINGLE_BYTES } from './limits.ts'
// 링크를 가져오는 일과 그 크기 상한은 작성 경로가 이미 갖고 있다. 복제하지 않는 이유는
// SSRF 방어가 그 안에 있기 때문이다 — 보안 코드를 복제하면 한쪽만 고치는 날이 온다.
import { readLink } from './linkRead.ts'
import { loadRefAttachments, refTargetsOf } from './refs.ts'
import type { AiFillProfile, CallerClient } from './profile.ts'

const BUCKET = 'attachments'

/** 호출자 토큰을 그대로 실은 클라이언트 — 이 클라이언트의 조회에는 RLS가 끝까지 걸린다. */
function callerClient(token: string) {
  return createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_ANON_KEY') ?? '', {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  })
}

interface StoredResult {
  status: 'ready' | 'failed' | 'original'
  body: { chunks: unknown[] } | null
  summary: ExtractSummary | null
  reason: string | null
}

/** 링크 한 건을 서버가 가져와 조각으로 만든다. */
async function extractLink(url: string): Promise<StoredResult> {
  const read = await readLink(url, MAX_SINGLE_BYTES)
  if ('message' in read) return { status: 'failed', body: null, summary: null, reason: read.message }

  const label = (() => {
    try {
      return new URL(url).hostname.replace(/^www\./, '')
    } catch {
      return url
    }
  })()

  // 구글 문서·슬라이드는 PDF로 내보내진다. 그것은 모델이 눈으로 읽는 형식이라 우리가 열지
  // 않고 작성 단계가 원본으로 보낸다(시트는 CSV로 와서 아래 글자 경로를 탄다).
  if (read.bytes && needsOriginal(read.mime)) {
    return { status: 'original', body: null, summary: null, reason: null }
  }

  const raw = read.text ?? (read.bytes ? new TextDecoder().decode(read.bytes) : '')
  const result = extractText(raw, read.mime === 'text/csv' ? 'text/csv' : 'text/plain', label)
  if (result.status === 'failed') {
    return { status: 'failed', body: null, summary: null, reason: result.reason }
  }
  const summary = { ...result.summary }
  if (read.truncated) summary.truncated = true
  return { status: 'ready', body: result.body, summary, reason: null }
}

/** 바이트의 SHA-256(16진). "무엇을 분석한 결과인가"의 기록으로만 쓴다. */
async function sha256Hex(bytes: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

/**
 * 원장에 있는 파일을 서버가 연다.
 *
 * 스토리지 바이트는 `service_role`로만 읽는다 — 볼 자격은 이미 앞에서 호출자 토큰으로
 * 판정했고(`material-download`와 같은 규약), 여기서 하는 일은 그 판정을 통과한 자료를
 * 여는 것뿐이다.
 */
async function openStored(
  admin: ReturnType<typeof supabaseAdmin>,
  storagePath: string | null,
  mime: string | null,
  fileName: string,
): Promise<{ result: StoredResult; hash: string | null }> {
  if (mime && needsOriginal(mime)) {
    return { result: { status: 'original', body: null, summary: null, reason: null }, hash: null }
  }
  if (!storagePath || !mime) {
    return {
      result: { status: 'failed', body: null, summary: null, reason: `열 수 없는 자료입니다: ${fileName}` },
      hash: null,
    }
  }

  const { data: blob, error } = await admin.storage.from(BUCKET).download(storagePath)
  if (error || !blob) {
    console.error('[material-extract] 스토리지 읽기 실패', error?.message)
    return {
      result: { status: 'failed', body: null, summary: null, reason: `자료를 읽지 못했습니다: ${fileName}` },
      hash: null,
    }
  }

  const bytes = await blob.arrayBuffer()
  const hash = await sha256Hex(bytes)
  const read = await extractBytes(bytes, mime, fileName)
  if (read.status === 'failed') {
    return { result: { status: 'failed', body: null, summary: null, reason: read.reason }, hash }
  }
  return { result: { status: 'ready', body: read.body, summary: read.summary, reason: null }, hash }
}

/** 자료 한 건의 분석을 끝까지 수행한다. */
export async function runMaterialExtract<K extends string, C>(
  req: Request,
  profile: AiFillProfile<K, C>,
): Promise<Response> {
  if (req.method !== 'POST') return jsonResponse({ error: 'method_not_allowed' }, 405)

  // 1) 호출자 인증(내부 사용자 전용) -------------------------------------------
  const token = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '')
  if (!token) return jsonResponse({ error: 'unauthorized' }, 401)
  const admin = supabaseAdmin()
  const { data: authData, error: authErr } = await admin.auth.getUser(token)
  if (authErr || !authData.user) return jsonResponse({ error: 'unauthorized' }, 401)
  const { data: me } = await admin
    .from('users')
    .select('id')
    .eq('auth_user_id', authData.user.id)
    .is('deleted_at', null)
    .maybeSingle()
  const appUserId = (me?.id as string | undefined) ?? null
  if (!appUserId) return jsonResponse({ error: 'unauthorized' }, 401)

  // 2) 요청 읽기 --------------------------------------------------------------
  const parsed = readRequest(await req.json().catch(() => null))
  if ('error' in parsed) {
    return jsonResponse({ error: parsed.error.code, message: parsed.error.message }, parsed.error.status)
  }
  const caller = callerClient(token)
  const asCaller = caller as unknown as CallerClient

  // 3) 쓰기 자격 재판정 — 판정식을 복제하지 않고 정책에서 꺼낸 함수를 되묻는다 -------
  const allowed = parsed.targetId
    ? await profile.canWrite(asCaller, parsed.targetId)
    : await profile.canCreate(asCaller)
  if (!allowed) {
    const message = parsed.targetId ? profile.messages.forbiddenWrite : profile.messages.forbiddenCreate
    return jsonResponse({ error: 'forbidden', message }, 403)
  }

  // 4) 저장 대상이 있으면 원장 행과 대조한다 ------------------------------------
  // 첨부 메타는 호출자 토큰으로 — RLS가 그 행을 볼 자격을 판정한다.
  let storagePath: string | null = null
  let storedMime: string | null = null
  if (parsed.attachmentId) {
    // 대상 행이 없어도 폼이 고른 연결이 있으면 참조 자료는 분석할 수 있다(등록 화면).
    // 둘 다 없으면 이 첨부가 어느 일에 딸린 것인지 답할 근거가 없다.
    if (!parsed.targetId && !parsed.linkId) {
      return jsonResponse({ error: 'invalid_request', message: '대상 레코드가 없습니다.' }, 400)
    }
    const { data: row, error: attErr } = await caller
      .from('attachments')
      .select('id, target_type, target_id, file_name, kind, url, content_type, byte_size, storage_path')
      .eq('id', parsed.attachmentId)
      .is('deleted_at', null)
      .maybeSingle()
    if (attErr) return jsonResponse({ error: 'internal_error' }, 500)
    if (!row) return jsonResponse({ error: 'invalid_request', message: '자료를 찾을 수 없습니다.' }, 400)

    storedMime = resolveMime(row.content_type as string | null, String(row.file_name))
    const facts: AttachmentFacts = {
      targetType: String(row.target_type),
      targetId: String(row.target_id),
      fileName: String(row.file_name),
      kind: row.kind === 'LINK' ? 'LINK' : 'FILE',
      url: row.url ? String(row.url) : null,
      byteSize: row.byte_size == null ? null : Number(row.byte_size),
      mime: storedMime,
    }
    // 대조 대상은 자기 레코드와 **참조로 함께 읽는 대상들**이다(2026-09-08). 참조는 그 행이
    // 자기 것이 아닐 때만 묻는다 — 대부분의 요청에서 왕복 한 번이 늘지 않고, 무엇을 참조로
    // 찾는지가 코드에서 그대로 읽힌다. 어느 대상을 함께 읽는지는 RPC가 호출자 토큰으로 답한다.
    // 등록 모드에는 자기 레코드가 없으므로 목록이 참조뿐이며, 비면 아무 자료도 통과하지 못한다.
    const self = parsed.targetId ? { type: profile.targetType, id: parsed.targetId } : null
    let targets: { type: string; id: string }[]
    if (self && facts.targetType === self.type && facts.targetId === self.id) {
      targets = [self]
    } else {
      const refs = await loadRefAttachments(caller, profile.targetType, parsed.targetId, parsed.linkId)
      targets = [...(self ? [self] : []), ...refTargetsOf(refs)]
    }
    const mismatch = verifyAgainstAttachment(parsed, facts, targets)
    if (mismatch) return jsonResponse({ error: 'invalid_request', message: mismatch }, 400)
    storagePath = row.storage_path ? String(row.storage_path) : null
  }

  // 5) 결과를 만든다 -------------------------------------------------------------
  // 링크는 서버가 가져오고, 원장에 있는 파일도 서버가 연다. 브라우저가 연 것은 등록 모드의
  // 보류 파일뿐이며 그 값은 저장되지 않는다.
  let stored: StoredResult
  let contentHash = parsed.contentHash
  if (parsed.source === 'link') {
    stored = await extractLink(parsed.url ?? '')
  } else if (parsed.attachmentId) {
    const opened = await openStored(admin, storagePath, storedMime ?? parsed.mime, parsed.fileName)
    stored = opened.result
    contentHash = opened.hash ?? contentHash
  } else if (parsed.result?.status === 'ready') {
    const normalized = normalizeExtractBody(parsed.result.body)
    if ('error' in normalized) {
      return jsonResponse({ error: 'invalid_request', message: normalized.error }, 400)
    }
    stored = { status: 'ready', body: normalized.body, summary: normalized.summary, reason: null }
  } else if (parsed.result?.status === 'original' || needsOriginal(parsed.mime)) {
    stored = { status: 'original', body: null, summary: null, reason: null }
  } else {
    const reason = parsed.result?.status === 'failed' ? parsed.result.reason : '자료를 분석하지 못했습니다.'
    stored = { status: 'failed', body: null, summary: null, reason }
  }

  // 6) 저장 — 등록 모드는 저장하지 않는다(가리킬 행이 없고, 취소하면 남아서도 안 된다) --
  const analyzedAt = new Date().toISOString()
  if (parsed.attachmentId) {
    // **실패를 성공 위에 덮지 않는다.** 새 시도가 실패했다고 이미 쓸 수 있는 글자를 지우면
    // 담당자는 되돌릴 방법이 없다(원본을 다시 열 수는 있지만 그것이 방금 실패한 일이다).
    if (stored.status === 'failed') {
      const { data: prev } = await admin
        .from('attachment_extracts')
        .select('status')
        .eq('attachment_id', parsed.attachmentId)
        .maybeSingle()
      if (prev?.status === 'ready') {
        return jsonResponse({ status: 'failed', reason: stored.reason, kept: true, analyzedAt })
      }
    }
    const { error: upErr } = await admin.from('attachment_extracts').upsert(
      {
        attachment_id: parsed.attachmentId,
        parser_version: PARSER_VERSION,
        content_hash: contentHash,
        byte_size: parsed.byteSize || null,
        mime: parsed.mime || null,
        status: stored.status,
        summary: stored.summary ?? {},
        body: stored.body,
        failed_reason: stored.reason,
        analyzed_by: appUserId,
        analyzed_at: analyzedAt,
      },
      { onConflict: 'attachment_id' },
    )
    if (upErr) {
      console.error('[material-extract] 캐시 저장 실패', upErr.message)
      return jsonResponse({ error: 'store_failed', message: '분석 결과를 저장하지 못했습니다.' }, 500)
    }
  }

  // 자료 내용은 로그에 담지 않는다. 담기는 것은 전부 수(數)와 짧은 코드다.
  console.log(
    '[material-extract] 분석',
    JSON.stringify({
      profile: profile.name,
      source: parsed.source,
      status: stored.status,
      stored: Boolean(parsed.attachmentId),
      chunks: stored.body?.chunks.length ?? 0,
      chars: stored.summary?.chars ?? 0,
    }),
  )

  return jsonResponse({
    status: stored.status,
    summary: stored.summary,
    reason: stored.reason,
    // 등록 모드는 저장할 자리가 없어 **결과를 돌려준다** — 화면이 그것을 들고 있다가 작성
    // 요청에 함께 싣는다. 저장한 경우에는 돌려주지 않는다(작성 함수가 원장에서 읽는다).
    body: parsed.attachmentId ? null : stored.body,
    analyzedAt,
  })
}
