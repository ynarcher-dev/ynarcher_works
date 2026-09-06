// [STARTUP 자료 분석] 자료 한 건을 분석 상태로 만들고 캐시에 남긴다.
//
// 요청: POST { startupId?, attachmentId?, source: 'file'|'link', parserVersion, fileName, mime,
//              byteSize, contentHash?, url?, result? }
// 응답: { status: 'ready'|'failed'|'original', summary?, reason?, body?, analyzedAt }
//
// **왜 별도 함수인가.** 분석은 작성과 다른 일이다 — 분석은 우리 쪽에서 끝나고 밖으로 나가는
// 것이 없으며(그래서 반출 기록도 없다), 작성은 자료가 외부 AI로 나가는 일이다. 두 일을 한
// 함수에 두면 "언제 자료가 밖으로 나가는가"를 코드에서도 화면에서도 가릴 수 없다.
//
// **일은 자료가 어디에 있는가가 나눈다.**
//   * 원장에 있는 파일: **서버가 연다.** 브라우저는 스토리지 바이트를 읽을 수 없다 —
//     2026-07-16에 클라이언트 직접 다운로드를 닫아 다운로드는 `material-download` 하나만
//     남았고, 그 경로는 반출 기록을 강제한다. 분석하려고 그 문을 다시 열 수는 없고, 분석을
//     반출로 적으면 실제 반출 건수가 흐려진다. 서버가 여는 편이 둘 다 피한다.
//   * 아직 원장에 없는 파일(등록 모드): **브라우저 Web Worker가 연다.** 바이트가 이미 거기
//     있어 올릴 이유가 없고, 등록을 취소하면 아무것도 남지 않아야 한다.
//   * 링크: **서버가 가져온다.** 바깥 사이트는 CORS로 브라우저에 본문을 내주지 않고, 사설망을
//     막는 SSRF 방어(`_shared/urlFetch.ts`)를 브라우저에서 쓸 수 없다.
//   * PDF·이미지: 열지 않는다. 모델이 눈으로 보듯 읽는 형식이라 원본 그대로 보내며, 그 사실을
//     `original`로 적어 둔다. **pdf.js·OCR은 어디서도 하지 않는다** — Edge Function은 요청당
//     CPU가 2초이고, 장표 PDF는 글자로 바꾸면 표의 행·열이 흐트러져 초안이 더 나빠진다.
//
// **그래서 캐시에 저장되는 값은 언제나 서버가 만든 것이다.** 브라우저가 연 결과는 저장하지
// 않는 등록 모드에만 머물고, 그 값도 우리 모양으로 되세운 뒤에 쓴다. 남의 말이 다른 담당자의
// 초안 재료가 되는 길이 애초에 없다.
//
// 한 요청이 자료 한 건만 여는 것이 CPU 여유의 근거이기도 하다 — 종전에는 작성 한 번이 고른
// 자료 전부를 그 자리에서 열었다.
//
// 보안:
// - 인증된 **내부 사용자**만 호출한다(게스트 토큰 거부). WORKS 전용 기능이다.
// - 쓰기 자격을 서버가 다시 묻는다. 수정은 `can_write_startup`, 등록은 `can_create_startup` —
//   판정식을 여기 복제하지 않고 정책에서 꺼낸 함수를 되묻는다(startup-ai-fill과 같은 규약).
// - **브라우저가 보낸 결과는 신뢰할 수 없는 입력이다.** 요청이 말하는 이름·형식·크기가 원장
//   행과 같은지 대조하고(request.ts), 본문은 우리 모양으로 되세운다(sanitize.ts). 어긋나면
//   전부 거절한다.
// - 첨부 메타는 **호출자 토큰**으로 조회해 RLS를 그대로 태운다. service_role은 캐시 UPSERT에만.
// - 캐시 원장에는 클라이언트 쓰기 정책이 없다(Default Deny) — 이 함수가 유일한 관문이다.
// - **감사 로그를 남기지 않는다.** 분석은 반출이 아니다. 자료가 밖으로 나가는 것은 작성
//   단계뿐이고 거기서 파일마다 access_logs를 적재한다(3_3_5 §16.7).
// - 등록 모드(attachmentId 없음)는 **아무것도 저장하지 않는다.** 결과를 돌려주고 끝낸다.
// 근거: docs/docs_planning/3_3_5_startup_ai_fill.md §16.2·§16.4·§16.11

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { jsonResponse, withCors } from '../_shared/cors.ts'
import { supabaseAdmin } from '../_shared/supabaseAdmin.ts'
import { extractBytes, extractText, needsOriginal } from '../_shared/docParse/extract.ts'
import { normalizeExtractBody } from '../_shared/docParse/sanitize.ts'
import { textChunks } from '../_shared/docParse/textParse.ts'
import { PARSER_VERSION, type ExtractSummary } from '../_shared/docParse/types.ts'
// 링크를 가져오는 일과 그 크기 상한은 작성 함수가 이미 갖고 있다. 복제하지 않는 이유는
// SSRF 방어가 그 안에 있기 때문이다 — 보안 코드를 복제하면 한쪽만 고치는 날이 온다.
import { readLink } from '../startup-ai-fill/linkRead.ts'
import { MAX_SINGLE_BYTES } from '../startup-ai-fill/limits.ts'
import { resolveMime } from '../startup-ai-fill/formats.ts'
import { readRequest, verifyAgainstAttachment, type AttachmentFacts } from './request.ts'

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
    console.error('[startup-material-extract] 스토리지 읽기 실패', error?.message)
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

Deno.serve(
  withCors(async (req: Request): Promise<Response> => {
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
    const asCaller = callerClient(token)

    // 3) 쓰기 자격 재판정 — 판정식을 복제하지 않고 정책에서 꺼낸 함수를 되묻는다 -------
    if (parsed.startupId) {
      const { data: writable, error: gateErr } = await asCaller.rpc('can_write_startup', {
        p_id: parsed.startupId,
      })
      if (gateErr) {
        console.error('[startup-material-extract] 권한 판정 실패', gateErr.message)
        return jsonResponse({ error: 'internal_error' }, 500)
      }
      if (writable !== true) {
        return jsonResponse({ error: 'forbidden', message: '이 기업의 정보를 수정할 권한이 없습니다.' }, 403)
      }
    } else {
      const { data: creatable, error: gateErr } = await asCaller.rpc('can_create_startup')
      if (gateErr) {
        console.error('[startup-material-extract] 등록 권한 판정 실패', gateErr.message)
        return jsonResponse({ error: 'internal_error' }, 500)
      }
      if (creatable !== true) {
        return jsonResponse({ error: 'forbidden', message: '스타트업을 등록할 권한이 없습니다.' }, 403)
      }
    }

    // 4) 저장 대상이 있으면 원장 행과 대조한다 ------------------------------------
    // 첨부 메타는 호출자 토큰으로 — RLS가 그 행을 볼 자격을 판정한다.
    let storagePath: string | null = null
    let storedMime: string | null = null
    if (parsed.attachmentId) {
      if (!parsed.startupId) {
        return jsonResponse({ error: 'invalid_request', message: '대상 기업이 없습니다.' }, 400)
      }
      const { data: row, error: attErr } = await asCaller
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
      const mismatch = verifyAgainstAttachment(parsed, facts, parsed.startupId)
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
        console.error('[startup-material-extract] 캐시 저장 실패', upErr.message)
        return jsonResponse({ error: 'store_failed', message: '분석 결과를 저장하지 못했습니다.' }, 500)
      }
    }

    // 자료 내용은 로그에 담지 않는다. 담기는 것은 전부 수(數)와 짧은 코드다.
    console.log(
      '[startup-material-extract] 분석',
      JSON.stringify({
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
  }),
)
