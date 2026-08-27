// [Phase 3] 게스트 OTP 발급 (삼각 매핑 검증 → 6자리 OTP)
// 요청: { name, contact, businessCode }
// 응답: 열거(enumeration) 방지를 위해 매칭 여부와 무관하게 중립 응답을 반환한다.
//
// 2026-08-27: 사업코드는 사업 원장의 코드(programs.code)이며, 매칭 판정은 삼각 매핑에
//   더해 연동 DB 명부에서 로그인이 열려 있는지까지 본다(_shared/guestInvitation.ts).
import { jsonResponse, withCors } from '../_shared/cors.ts'
import { generateOtp, sha256Hex } from '../_shared/crypto.ts'
import { findOpenInvitation, normalizeCode } from '../_shared/guestInvitation.ts'
import { sendNotification } from '../_shared/notifications.ts'
import { supabaseAdmin } from '../_shared/supabaseAdmin.ts'

const OTP_TTL_SEC = 180 // 3분
const NEUTRAL = { ok: true, expiresInSec: OTP_TTL_SEC }

Deno.serve(withCors(async (req: Request) => {
  if (req.method !== 'POST') return jsonResponse({ error: 'method_not_allowed' }, 405)

  try {
    const { name, contact, businessCode } = await req.json()
    if (!name || !contact || !businessCode) {
      return jsonResponse({ error: 'invalid_request' }, 400)
    }

    const db = supabaseAdmin()
    const match = await findOpenInvitation(db, businessCode, name, contact)

    if (!match) {
      // 매칭 실패: 중립 응답(정보 노출 차단), OTP 미발송
      return jsonResponse(NEUTRAL)
    }

    const otp = generateOtp()
    const pepper = Deno.env.get('GUEST_JWT_SECRET') ?? ''
    const otpHash = await sha256Hex(`${otp}:${normalizeCode(businessCode)}:${pepper}`)

    await db
      .from('guest_invitations')
      .update({
        otp_hash: otpHash,
        otp_expires_at: new Date(Date.now() + OTP_TTL_SEC * 1000).toISOString(),
        otp_attempts: 0,
      })
      .eq('id', match.invitation.id)

    // OTP 발송(알림 채널 디스패처 경유). 프로바이더 미설정 시 로그 폴백.
    // 발송처는 사용자가 입력한 값이 아니라 원장에서 옮겨 둔 초대 레코드의 연락처다 —
    // 입력값으로 보내면 이름·코드만 아는 사람이 남의 인증번호를 자기 주소로 받을 수 있다.
    const to = match.invitation.email ?? match.invitation.phone ?? ''
    if (!to) return jsonResponse(NEUTRAL)
    const channel = to.includes('@') ? 'EMAIL' : 'ALIMTALK'
    await sendNotification({
      channel,
      to,
      templateCode: 'GUEST_OTP',
      variables: { otp },
    })

    return jsonResponse(NEUTRAL)
  } catch (_e) {
    return jsonResponse({ error: 'internal_error' }, 500)
  }
}))
