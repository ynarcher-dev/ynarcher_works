// [보안 안정화 P0-5] 자료 다운로드 서버 경유 + 감사 로그 강제
// 요청: { attachmentId, reason? }
// 응답: { url, fileName } | 4xx/5xx
//
// 보안:
// - 클라이언트의 직접 Signed URL 발급은 storage.objects SELECT 정책 회수로 차단
//   (20260716130300_attachments_storage_download_lock.sql). 다운로드는 본 함수만 경유.
// - 호출자 인증(표준 JWT) 후, 대상 attachments 메타 행은 호출자 토큰 클라이언트로
//   조회하여 RLS(내부 사용자 한정)를 그대로 강제한다. service_role은 조회에 쓰지 않는다.
// - access_logs 적재가 실패하면 Signed URL을 발급하지 않는다(로그 없는 반출 금지).
// - 호출자는 두 종류다: 내부 사용자(Supabase Auth 표준 JWT)와 게스트(우리가 발급한 커스텀
//   JWT). 게스트 토큰은 auth.users에 대응하는 계정이 없어 auth.getUser로는 풀리지 않으므로
//   서명·만료·세션판(session_version)을 직접 검증해 app 계정을 얻는다. 어느 경로든 대상 행
//   조회는 호출자 토큰으로 하므로 노출 범위 판정은 끝까지 RLS가 한다(게스트는 공개 모듈에
//   귀속된 파일만 보인다 — 20260827170000_guest_module_menu.sql).
// - Signed URL TTL 60초(단기). 파일 등급별 사유 필수화는 등급 컬럼 설계 후 확장.
// 근거: docs/docs_dev/12_immediate_security_stabilization_tasks.md §3.5,
//       docs/docs_dev/13_future_development_guardrails.md §5
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { jsonResponse, withCors } from '../_shared/cors.ts'
import { verifyJwt } from '../_shared/crypto.ts'
import { supabaseAdmin } from '../_shared/supabaseAdmin.ts'

const BUCKET = 'attachments'
const SIGNED_URL_TTL_SEC = 60

/**
 * 호출자를 app 계정 id로 푼다. 내부 사용자와 게스트를 한 입구에서 받되, 어느 쪽도 특권을
 * 얻지 않는다 — 여기서 나오는 것은 '누구인가'뿐이고, '무엇을 볼 수 있는가'는 뒤이어 호출자
 * 토큰으로 던지는 RLS 질의가 답한다.
 *
 * 게스트 토큰을 다른 입구로 받지 않는 이유는 다운로드의 계약(감사 로그를 남기지 못하면 URL을
 * 발급하지 않는다)이 호출자 종류와 무관하기 때문이다. 입구를 나누면 그 계약도 두 벌이 되고,
 * 언젠가 한쪽만 고치는 날이 온다.
 */
async function resolveCaller(
  admin: ReturnType<typeof supabaseAdmin>,
  token: string,
): Promise<string | null> {
  // 내부 사용자: Supabase Auth 표준 JWT.
  const { data: authData } = await admin.auth.getUser(token)
  if (authData?.user) {
    const { data: internal } = await admin
      .from('users')
      .select('id')
      .eq('auth_user_id', authData.user.id)
      .is('deleted_at', null)
      .maybeSingle()
    return (internal?.id as string | undefined) ?? null
  }

  // 게스트: 우리가 발급한 커스텀 JWT(서명·만료는 verifyJwt가 본다).
  const payload = await verifyJwt(token, Deno.env.get('GUEST_JWT_SECRET') ?? '', 'authenticated')
  if (!payload) return null
  const claimed = typeof payload.app_user_id === 'string' ? payload.app_user_id : null
  if (!claimed) return null

  // 차단은 즉시 반영되어야 한다(3_9_workspace_guest.md §2). 차단 RPC가 users.session_version을
  // 올리므로, 토큰이 아직 만료되지 않았더라도 판이 어긋나면 여기서 끊긴다.
  const { data: guest } = await admin
    .from('users')
    .select('id, session_version')
    .eq('id', claimed)
    .is('deleted_at', null)
    .maybeSingle()
  if (!guest) return null
  if ((guest.session_version ?? 1) !== payload.session_version) return null
  return guest.id as string
}

Deno.serve(withCors(async (req: Request) => {
  if (req.method !== 'POST') return jsonResponse({ error: 'method_not_allowed' }, 405)

  try {
    // 1) 호출자 인증 --------------------------------------------------------
    const token = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '')
    if (!token) return jsonResponse({ error: 'unauthorized' }, 401)
    const admin = supabaseAdmin()
    const appUserId = await resolveCaller(admin, token)
    if (!appUserId) return jsonResponse({ error: 'unauthorized' }, 401)

    const body = await req.json().catch(() => ({}))
    const attachmentId = String(body.attachmentId ?? '').trim()
    const reason = typeof body.reason === 'string' ? body.reason.trim() : null
    if (!attachmentId) return jsonResponse({ error: 'invalid_request' }, 400)

    // 2) 대상 메타 조회: 호출자 토큰으로 RLS를 그대로 강제(내부 사용자 한정) ----
    const asCaller = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        auth: { persistSession: false, autoRefreshToken: false },
        global: { headers: { Authorization: `Bearer ${token}` } },
      },
    )
    const { data: att, error: attErr } = await asCaller
      .from('attachments')
      .select('id, file_name, storage_path')
      .eq('id', attachmentId)
      .is('deleted_at', null)
      .maybeSingle()
    if (attErr) return jsonResponse({ error: 'internal_error' }, 500)
    if (!att) return jsonResponse({ error: 'forbidden' }, 403)

    // 3) 감사 로그 강제: 적재 실패 시 URL을 발급하지 않는다 -------------------
    const { error: logErr } = await admin.from('access_logs').insert({
      user_id: appUserId,
      resource_type: 'attachment_download',
      resource_id: att.id,
      reason: reason || `파일 다운로드: ${att.file_name}`,
    })
    if (logErr) return jsonResponse({ error: 'log_failed', message: '다운로드 기록을 남기지 못했습니다.' }, 500)

    // 4) 단기 Signed URL 발급(service_role — 클라이언트 직접 발급 경로는 폐쇄됨) --
    const { data: signed, error: signErr } = await admin.storage
      .from(BUCKET)
      .createSignedUrl(att.storage_path, SIGNED_URL_TTL_SEC, { download: att.file_name })
    if (signErr || !signed) return jsonResponse({ error: 'sign_failed' }, 500)

    return jsonResponse({ url: signed.signedUrl, fileName: att.file_name })
  } catch (_e) {
    return jsonResponse({ error: 'internal_error' }, 500)
  }
}))
