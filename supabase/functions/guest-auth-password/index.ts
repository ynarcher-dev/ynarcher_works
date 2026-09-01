// 게스트 비밀번호 설정·변경.
//
// 두 모드가 한 함수에 산다 — 정책(길이·초기값 금지)과 저장(해시·시도 횟수 초기화)이 같은
// 한 벌이어야 하기 때문이다. 모드는 요청 본문이 가른다.
//
// [설정] { changeTicket, newPassword }
//   초기 비밀번호로 처음 들어온 참여자가 자기 비밀번호를 정한다. 티켓은 guest-auth-login이
//   초기 비밀번호를 확인한 뒤에만 발급하는 10분짜리 단명 토큰이며 데이터 접근 권한이
//   없다(aud = guest-password-change). 비밀번호를 정하는 순간 비로소 정상 세션을 발급한다.
// [변경] { currentPassword, newPassword } + Authorization: Bearer <세션 JWT>
//   로그인한 게스트가 마이페이지에서 바꾼다. 세션만 믿지 않고 현재 비밀번호를 다시 받는다 —
//   자리를 비운 사이 남이 계정을 잠그는 일을 막는 최소한의 재확인이다. 실패는 로그인과 같은
//   잠금 규칙(연속 5회 → 15분)을 태운다.
import { jsonResponse, withCors } from '../_shared/cors.ts'
import { verifyJwt } from '../_shared/crypto.ts'
import {
  isLocked,
  issueGuestSession,
  loadInvitation,
  recordFailure,
  type GuestInvitation,
} from '../_shared/guestInvitation.ts'
import { loadOpenParticipations, verifyGuestSession } from '../_shared/guestSession.ts'
import { hashPassword, passwordPolicyError, verifyPassword } from '../_shared/password.ts'
import { supabaseAdmin } from '../_shared/supabaseAdmin.ts'
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

const EXPIRED = {
  error: 'ticket_expired',
  message: '비밀번호 설정 시간이 지났습니다. 처음부터 다시 로그인해 주세요.',
}
const SESSION_EXPIRED = {
  error: 'session_expired',
  message: '세션이 만료되었거나 접근이 닫혔습니다. 다시 로그인해 주세요.',
}
const WRONG_CURRENT = {
  error: 'wrong_password',
  message: '현재 비밀번호가 일치하지 않습니다.',
}
const LOCKED = {
  error: 'locked',
  message: '시도가 많아 잠시 잠겼습니다. 15분 뒤 다시 시도해 주세요.',
}

/** [설정 모드] 티켓 검증 → 정책 검사 → 저장 → 세션 발급. */
async function handleInitialSet(
  db: SupabaseClient,
  changeTicket: string,
  newPassword: string,
): Promise<Response> {
  const secret = Deno.env.get('GUEST_JWT_SECRET') ?? ''
  if (!secret) return jsonResponse({ error: 'jwt_secret_missing' }, 500)

  const claims = await verifyJwt(changeTicket, secret, 'guest-password-change')
  if (!claims || typeof claims.sub !== 'string') return jsonResponse(EXPIRED, 401)

  const match = await loadInvitation(db, claims.sub)
  if (!match) return jsonResponse(EXPIRED, 401)

  // 티켓이 살아 있어도 그 사이 비밀번호가 정해졌다면(다른 창에서 먼저 설정) 다시 로그인시킨다.
  if (match.invitation.password_hash) return jsonResponse(EXPIRED, 401)

  const policyError = passwordPolicyError(newPassword, match.invitation.phone ?? '')
  if (policyError) return jsonResponse({ error: 'weak_password', message: policyError }, 400)

  const hash = await hashPassword(newPassword)
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
}

/** [변경 모드] 세션 검증 → 현재 비밀번호 재확인 → 정책 검사 → 이 사업의 초대장 전부에 저장. */
async function handleChange(
  db: SupabaseClient,
  req: Request,
  currentPassword: string,
  newPassword: string,
): Promise<Response> {
  const session = await verifyGuestSession(db, req)
  if (!session) return jsonResponse(SESSION_EXPIRED, 401)

  const participations = await loadOpenParticipations(db, session.programId, session.user.id)
  if (participations.length === 0) return jsonResponse(SESSION_EXPIRED, 401)

  // 한 사람이 이 사업에 역할 수만큼 초대장을 가질 수 있다(역할별 명부 행 × 초대장).
  // 대조는 해시가 있는 것 중 하나로, 저장은 전부에 — 로그인이 어느 초대장을 집더라도
  // 새 비밀번호 하나로 열리게 한다.
  const { data } = await db
    .from('guest_invitations')
    .select('id, phone, password_hash, login_attempts, locked_until')
    .in('participant_id', participations.map((p) => p.id))
  const invitations = (data ?? []) as Pick<
    GuestInvitation,
    'id' | 'phone' | 'password_hash' | 'login_attempts' | 'locked_until'
  >[]
  if (invitations.length === 0) return jsonResponse(SESSION_EXPIRED, 401)

  if (invitations.some((inv) => isLocked(inv as GuestInvitation))) {
    return jsonResponse(LOCKED, 429)
  }

  let matched: (typeof invitations)[number] | null = null
  for (const inv of invitations) {
    if (inv.password_hash && (await verifyPassword(currentPassword, inv.password_hash))) {
      matched = inv
      break
    }
  }
  if (!matched) {
    await recordFailure(db, invitations[0] as GuestInvitation)
    return jsonResponse(WRONG_CURRENT, 401)
  }

  const policyError = passwordPolicyError(newPassword, matched.phone ?? '')
  if (policyError) return jsonResponse({ error: 'weak_password', message: policyError }, 400)
  if (newPassword === currentPassword) {
    return jsonResponse(
      { error: 'weak_password', message: '지금 쓰는 비밀번호와 다른 값을 사용하세요.' },
      400,
    )
  }

  const hash = await hashPassword(newPassword)
  const { error: saveErr } = await db
    .from('guest_invitations')
    .update({
      password_hash: hash,
      password_set_at: new Date().toISOString(),
      login_attempts: 0,
      locked_until: null,
    })
    .in('id', invitations.map((inv) => inv.id))
  if (saveErr) return jsonResponse({ error: 'save_failed' }, 500)

  return jsonResponse({ ok: true })
}

Deno.serve(withCors(async (req: Request) => {
  if (req.method !== 'POST') return jsonResponse({ error: 'method_not_allowed' }, 405)

  try {
    const { changeTicket, currentPassword, newPassword } = await req.json()
    if (!newPassword) return jsonResponse({ error: 'invalid_request' }, 400)

    const db = supabaseAdmin()
    if (currentPassword) {
      return await handleChange(db, req, String(currentPassword), String(newPassword))
    }
    if (changeTicket) {
      return await handleInitialSet(db, String(changeTicket), String(newPassword))
    }
    return jsonResponse({ error: 'invalid_request' }, 400)
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'internal_error'
    if (msg === 'jwt_secret_missing') return jsonResponse({ error: msg }, 500)
    return jsonResponse({ error: 'internal_error' }, 500)
  }
}))
