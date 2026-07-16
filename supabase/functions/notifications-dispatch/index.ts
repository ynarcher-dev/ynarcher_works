// [Phase 14] 알림 발송 Edge Function
// 요청: { channel, to, templateCode, variables }
// 서버(RPC/트리거/앱)에서 호출해 알림톡/SMS/이메일을 발송한다.
import { jsonResponse, withCors } from '../_shared/cors.ts'
import { sendNotification, type Channel } from '../_shared/notifications.ts'
import { supabaseAdmin } from '../_shared/supabaseAdmin.ts'

const CHANNELS: Channel[] = ['ALIMTALK', 'SMS', 'EMAIL']

Deno.serve(withCors(async (req: Request) => {
  if (req.method !== 'POST') return jsonResponse({ error: 'method_not_allowed' }, 405)

  // 호출자 인증: 로그인한 사용자 토큰 없이는 발송 불가(익명 스팸 발송 차단).
  const token = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '')
  if (!token) return jsonResponse({ error: 'unauthorized' }, 401)
  const { data: authData, error: authErr } = await supabaseAdmin().auth.getUser(token)
  if (authErr || !authData.user) return jsonResponse({ error: 'unauthorized' }, 401)

  try {
    const { channel, to, templateCode, variables } = await req.json()
    if (!CHANNELS.includes(channel) || !to || !templateCode) {
      return jsonResponse({ error: 'invalid_request' }, 400)
    }
    const result = await sendNotification({ channel, to, templateCode, variables })
    return jsonResponse(result)
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'internal_error'
    return jsonResponse({ error: msg }, msg.startsWith('unknown_template') ? 400 : 500)
  }
}))
