// 게스트 비밀번호 설정 — 초기 비밀번호로 처음 들어온 참여자가 자기 비밀번호를 정한다.
// 요청: { changeTicket, newPassword }
// 응답: { accessToken, user, program } | 4xx
//
// 티켓은 guest-auth-login이 초기 비밀번호를 확인한 뒤에만 발급하는 10분짜리 단명 토큰이며
// 데이터 접근 권한이 없다(aud = guest-password-change). 비밀번호를 정하는 순간 비로소
// 정상 세션을 발급한다 — 초기 비밀번호 상태로는 어떤 화면도 열리지 않는다.
import { jsonResponse, withCors } from '../_shared/cors.ts'
import { verifyJwt } from '../_shared/crypto.ts'
import { issueGuestSession, loadInvitation } from '../_shared/guestInvitation.ts'
import { hashPassword, passwordPolicyError } from '../_shared/password.ts'
import { supabaseAdmin } from '../_shared/supabaseAdmin.ts'

const EXPIRED = {
  error: 'ticket_expired',
  message: '비밀번호 설정 시간이 지났습니다. 처음부터 다시 로그인해 주세요.',
}

Deno.serve(withCors(async (req: Request) => {
  if (req.method !== 'POST') return jsonResponse({ error: 'method_not_allowed' }, 405)

  try {
    const { changeTicket, newPassword } = await req.json()
    if (!changeTicket || !newPassword) return jsonResponse({ error: 'invalid_request' }, 400)

    const secret = Deno.env.get('SUPABASE_JWT_SECRET') ?? ''
    if (!secret) return jsonResponse({ error: 'jwt_secret_missing' }, 500)

    const claims = await verifyJwt(String(changeTicket), secret, 'guest-password-change')
    if (!claims || typeof claims.sub !== 'string') return jsonResponse(EXPIRED, 401)

    const db = supabaseAdmin()
    const match = await loadInvitation(db, claims.sub)
    if (!match) return jsonResponse(EXPIRED, 401)

    // 티켓이 살아 있어도 그 사이 비밀번호가 정해졌다면(다른 창에서 먼저 설정) 다시 로그인시킨다.
    if (match.invitation.password_hash) return jsonResponse(EXPIRED, 401)

    const policyError = passwordPolicyError(String(newPassword), match.invitation.phone ?? '')
    if (policyError) return jsonResponse({ error: 'weak_password', message: policyError }, 400)

    const hash = await hashPassword(String(newPassword))
    const { error: saveErr } = await db
      .from('guest_invitations')
      .update({
        password_hash: hash,
        password_set_at: new Date().toISOString(),
        login_attempts: 0,
        locked_until: null,
      })
      .eq('id', match.invitation.id)
    if (saveErr) return jsonResponse({ error: 'save_failed' }, 500)

    const session = await issueGuestSession(db, match)
    return jsonResponse(session)
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'internal_error'
    if (msg === 'jwt_secret_missing') return jsonResponse({ error: msg }, 500)
    return jsonResponse({ error: 'internal_error' }, 500)
  }
}))
