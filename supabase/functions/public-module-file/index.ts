// [모듈 링크 공유] 공개 파일 다운로드(익명). 파일첨부 모듈의 단기 서명 URL 발급.
// 요청: { token, attachmentId }
// 응답: { url, fileName } | 403 not_open/forbidden | 404 not_found
//
// 보안:
// - 링크 게이트를 **먼저** 통과해야 한다. 판정은 public-module-get과 같은 모듈이 소유하므로,
//   링크를 끄거나 기간이 지나면 그 즉시 발급 자체가 거부된다. 이미 발급된 URL은 60초 뒤 죽는다.
// - 대상 파일이 그 모듈에 귀속된 것인지 다시 확인한다. 토큰이 여는 것은 모듈 하나이고,
//   attachmentId는 요청자가 보내는 값이므로 같은 사업의 다른 파일을 부르는 시도를 막아야 한다.
// - 파일은 비공개 버킷에 있고 storage_path는 어느 응답에도 실리지 않는다. 공개 버킷에 두면
//   링크를 끈 뒤에도 주소가 살아 있어 스위치가 아무것도 닫지 못한다.
// - 익명 반출이므로 access_logs에 user_id 없이 남긴다(누가인지는 알 수 없고, 무엇이 언제
//   어느 링크로 나갔는지는 남는다). 적재 실패 시 URL을 발급하지 않는다 — 로그 없는 반출 금지는
//   호출자가 익명이라고 해서 느슨해지지 않는다.
// 근거 기획: docs/docs_planning/3_4_15_ac_public_links.md §10, §13
import { jsonResponse, withCors } from '../_shared/cors.ts'
import { supabaseAdmin } from '../_shared/supabaseAdmin.ts'
import { denyStatus, resolvePublicLink } from '../_shared/publicModuleLink.ts'

const BUCKET = 'attachments'
const SIGNED_URL_TTL_SEC = 60

Deno.serve(withCors(async (req: Request) => {
  if (req.method !== 'POST') return jsonResponse({ error: 'method_not_allowed' }, 405)

  try {
    const body = await req.json().catch(() => ({}))
    const token = String(body.token ?? '').trim()
    const attachmentId = String(body.attachmentId ?? '').trim()
    if (!token || !attachmentId) return jsonResponse({ error: 'invalid_request' }, 400)

    const db = supabaseAdmin()

    // 1) 링크 게이트 — 여기서 막히면 파일은 존재조차 답하지 않는다.
    const resolved = await resolvePublicLink(db, token)
    if (resolved.reason) {
      return jsonResponse(
        { error: resolved.reason === 'not_found' ? 'not_found' : 'not_open', reason: resolved.reason },
        denyStatus(resolved.reason),
      )
    }
    const link = resolved.link
    if (link.moduleType !== 'FILE') return jsonResponse({ error: 'forbidden' }, 403)

    // 2) 그 모듈에 귀속된 파일인가 — 요청자가 보낸 id를 그대로 믿지 않는다.
    const { data: att, error: attErr } = await db
      .from('attachments')
      .select('id, file_name, storage_path')
      .eq('id', attachmentId)
      .eq('target_type', 'program')
      .eq('target_id', link.programId)
      .eq('program_module_id', link.moduleId)
      .is('deleted_at', null)
      .maybeSingle()
    if (attErr) return jsonResponse({ error: 'internal_error' }, 500)
    if (!att) return jsonResponse({ error: 'forbidden' }, 403)

    // 3) 반출 기록. 익명이라 user_id는 비지만 무엇이 어느 링크로 나갔는지는 남는다.
    const { error: logErr } = await db.from('access_logs').insert({
      user_id: null,
      resource_type: 'public_link_download',
      resource_id: att.id,
      reason: `공개 링크 다운로드: ${att.file_name}`,
      request_ip: req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null,
      user_agent: req.headers.get('user-agent'),
    })
    if (logErr) return jsonResponse({ error: 'log_failed' }, 500)

    // 4) 단기 서명 URL(60초).
    const { data: signed, error: signErr } = await db.storage
      .from(BUCKET)
      .createSignedUrl(att.storage_path, SIGNED_URL_TTL_SEC, { download: att.file_name })
    if (signErr || !signed) return jsonResponse({ error: 'sign_failed' }, 500)

    return jsonResponse({ url: signed.signedUrl, fileName: att.file_name })
  } catch (_e) {
    return jsonResponse({ error: 'internal_error' }, 500)
  }
}))
