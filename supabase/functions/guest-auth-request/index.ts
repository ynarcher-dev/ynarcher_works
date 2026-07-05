// [Phase 3] 게스트 OTP 발급 (삼각 매핑 검증 → 6자리 OTP)
// 요청: { name, contact, businessCode }
// 응답: 열거(enumeration) 방지를 위해 매칭 여부와 무관하게 중립 응답을 반환한다.
import { corsHeaders, jsonResponse } from '../_shared/cors.ts'
import { generateOtp, sha256Hex } from '../_shared/crypto.ts'
import { supabaseAdmin } from '../_shared/supabaseAdmin.ts'

const OTP_TTL_SEC = 180 // 3분
const NEUTRAL = { ok: true, expiresInSec: OTP_TTL_SEC }

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return jsonResponse({ error: 'method_not_allowed' }, 405)

  try {
    const { name, contact, businessCode } = await req.json()
    if (!name || !contact || !businessCode) {
      return jsonResponse({ error: 'invalid_request' }, 400)
    }

    const db = supabaseAdmin()
    // 삼각 매핑: 사업코드 + 이름 + (이메일 또는 전화) 일치, 초대 유효
    const { data: inv } = await db
      .from('guest_invitations')
      .select('id')
      .eq('business_code', businessCode)
      .eq('name', name)
      .or(`email.eq.${contact},phone.eq.${contact}`)
      .gt('invite_expires_at', new Date().toISOString())
      .limit(1)
      .maybeSingle()

    if (!inv) {
      // 매칭 실패: 중립 응답(정보 노출 차단), OTP 미발송
      return jsonResponse(NEUTRAL)
    }

    const otp = generateOtp()
    const pepper = Deno.env.get('GUEST_JWT_SECRET') ?? ''
    const otpHash = await sha256Hex(`${otp}:${businessCode}:${pepper}`)

    await db
      .from('guest_invitations')
      .update({
        otp_hash: otpHash,
        otp_expires_at: new Date(Date.now() + OTP_TTL_SEC * 1000).toISOString(),
        otp_attempts: 0,
      })
      .eq('id', inv.id)

    // TODO(계정 필요): 알림톡/SMS/이메일 프로바이더로 실제 OTP 발송.
    // 현재는 서버 로그로 대체(로컬 개발용).
    console.log(`[guest-auth-request] OTP for invitation ${inv.id}: ${otp}`)

    return jsonResponse(NEUTRAL)
  } catch (_e) {
    return jsonResponse({ error: 'internal_error' }, 500)
  }
})
