// 게스트 로그인 — 사업코드 + 이메일(ID) + 비밀번호
// 요청: { businessCode, email, password }
// 응답: { accessToken, user, program } | { mustChangePassword: true, changeTicket } | 401
//
// 초기 비밀번호는 원장의 전화번호(숫자만)다. 그 상태로 처음 들어오면 세션을 주지 않고
// **비밀번호 설정 전용 티켓**만 준다 — 초기 비밀번호로 얻은 토큰이 데이터에 닿으면
// 비밀번호를 바꾸지 않은 채로 계속 쓸 수 있게 된다. 티켓은 10분짜리이며 오직
// guest-auth-password만 받는다.
//
// 실패 응답은 사유를 가리지 않는다(계정 열거 차단). 연속 5회 실패면 15분 잠근다.
import { jsonResponse, withCors } from '../_shared/cors.ts'
import { signJwt } from '../_shared/crypto.ts'
import {
  findOpenInvitation,
  isLocked,
  issueGuestSession,
  recordFailure,
} from '../_shared/guestInvitation.ts'
import { normalizePhone, verifyPassword } from '../_shared/password.ts'
import { supabaseAdmin } from '../_shared/supabaseAdmin.ts'

const DENIED = {
  error: 'auth_failed',
  message: '사업 코드·이메일·비밀번호가 일치하지 않습니다.',
}
const LOCKED = {
  error: 'locked',
  message: '로그인 시도가 많아 잠시 잠겼습니다. 15분 뒤 다시 시도해 주세요.',
}
const TICKET_TTL_SEC = 60 * 10

Deno.serve(withCors(async (req: Request) => {
  if (req.method !== 'POST') return jsonResponse({ error: 'method_not_allowed' }, 405)

  try {
    const { businessCode, email, password } = await req.json()
    if (!businessCode || !email || !password) {
      return jsonResponse({ error: 'invalid_request' }, 400)
    }

    const db = supabaseAdmin()
    const match = await findOpenInvitation(db, businessCode, email)
    if (!match) return jsonResponse(DENIED, 401)

    const inv = match.invitation
    if (isLocked(inv)) return jsonResponse(LOCKED, 429)

    // 비밀번호를 정하기 전이면 원장의 전화번호가 곧 초기 비밀번호다.
    const initial = !inv.password_hash
    const ok = initial
      ? normalizePhone(password).length > 0 &&
        normalizePhone(password) === normalizePhone(inv.phone)
      : await verifyPassword(String(password), inv.password_hash)

    if (!ok) {
      await recordFailure(db, inv)
      return jsonResponse(DENIED, 401)
    }

    if (initial) {
      const secret = Deno.env.get('SUPABASE_JWT_SECRET') ?? ''
      if (!secret) return jsonResponse({ error: 'jwt_secret_missing' }, 500)
      const nowSec = Math.floor(Date.now() / 1000)
      const changeTicket = await signJwt(
        {
          sub: inv.id,
          aud: 'guest-password-change',
          iat: nowSec,
          exp: nowSec + TICKET_TTL_SEC,
        },
        secret,
      )
      await db
        .from('guest_invitations')
        .update({ login_attempts: 0, locked_until: null })
        .eq('id', inv.id)
      return jsonResponse({ mustChangePassword: true, changeTicket, expiresInSec: TICKET_TTL_SEC })
    }

    const session = await issueGuestSession(db, match)
    return jsonResponse(session)
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'internal_error'
    if (msg === 'jwt_secret_missing') return jsonResponse({ error: msg }, 500)
    return jsonResponse({ error: 'internal_error' }, 500)
  }
}))
