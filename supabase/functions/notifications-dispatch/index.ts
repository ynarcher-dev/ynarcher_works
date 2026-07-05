// [Phase 14] 알림 발송 Edge Function
// 요청: { channel, to, templateCode, variables }
// 서버(RPC/트리거/앱)에서 호출해 알림톡/SMS/이메일을 발송한다.
import { corsHeaders, jsonResponse } from '../_shared/cors.ts'
import { sendNotification, type Channel } from '../_shared/notifications.ts'

const CHANNELS: Channel[] = ['ALIMTALK', 'SMS', 'EMAIL']

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return jsonResponse({ error: 'method_not_allowed' }, 405)

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
})
