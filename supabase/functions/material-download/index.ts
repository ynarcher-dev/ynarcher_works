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
// - Signed URL TTL 60초(단기). 파일 등급별 사유 필수화는 등급 컬럼 설계 후 확장.
// 근거: docs/docs_dev/12_immediate_security_stabilization_tasks.md §3.5,
//       docs/docs_dev/13_future_development_guardrails.md §5
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { jsonResponse, withCors } from '../_shared/cors.ts'
import { supabaseAdmin } from '../_shared/supabaseAdmin.ts'

const BUCKET = 'attachments'
const SIGNED_URL_TTL_SEC = 60

Deno.serve(withCors(async (req: Request) => {
  if (req.method !== 'POST') return jsonResponse({ error: 'method_not_allowed' }, 405)

  try {
    // 1) 호출자 인증 --------------------------------------------------------
    const token = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '')
    if (!token) return jsonResponse({ error: 'unauthorized' }, 401)
    const admin = supabaseAdmin()
    const { data: authData, error: authErr } = await admin.auth.getUser(token)
    if (authErr || !authData.user) return jsonResponse({ error: 'unauthorized' }, 401)

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
    const { data: appUser } = await admin
      .from('users')
      .select('id')
      .eq('auth_user_id', authData.user.id)
      .is('deleted_at', null)
      .maybeSingle()
    if (!appUser) return jsonResponse({ error: 'forbidden' }, 403)

    const { error: logErr } = await admin.from('access_logs').insert({
      user_id: appUser.id,
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
