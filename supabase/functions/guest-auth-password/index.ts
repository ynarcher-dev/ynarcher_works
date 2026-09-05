// 게스트 비밀번호 설정·변경.
//
// 두 모드가 한 함수에 산다 — 정책(길이·초기값 금지)과 저장(해시·시도 횟수 초기화)이 같은
// 한 벌이어야 하기 때문이다. 모드는 요청 본문이 가른다.
//
// [설정] { changeTicket, newPassword }
//   초기 비밀번호로 처음 들어온 참여자가 자기 비밀번호를 정한다. 티켓은 guest-auth-login이
//   초기 비밀번호를 확인한 뒤에만 발급하는 10분짜리 단명 토큰이며 데이터 접근 권한이
//   없다(aud = guest-password-change). 비밀번호를 정한 뒤에 비로소 갈 곳을 고른다.
// [변경] { currentPassword, newPassword } + Authorization: Bearer <세션 JWT>
//   로그인한 게스트가 마이페이지에서 바꾼다. 세션만 믿지 않고 현재 비밀번호를 다시 받는다 —
//   자리를 비운 사이 남이 계정을 잠그는 일을 막는 최소한의 재확인이다.
//
// 2026-09-05: 저장 위치가 초대 행(guest_invitations)에서 **계정**(guest_credentials)으로
// 옮겨졌다. 종전에는 사업마다 초대 행이 있어 비밀번호가 여러 벌이었고, 새 사업에 초대되면
// 그 행의 해시가 비어 전화번호로 다시 들어올 수 있었다. 이제 계정에 하나뿐이다.
import { jsonResponse, withCors } from '../_shared/cors.ts'
import { verifyJwt } from '../_shared/crypto.ts'
import {
  clearFailures,
  isLocked,
  issueSession,
  loadAccount,
  loadCredentials,
  loadParticipations,
  readLedgerPhone,
  recordFailure,
  signSelectTicket,
  toChoice,
  SELECT_TTL_SEC,
  type GuestAccount,
} from '../_shared/guestAccount.ts'
import { verifyGuestSession } from '../_shared/guestSession.ts'
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
const NO_ACCESS = {
  accessible: false,
  message: '비밀번호가 설정되었습니다. 다만 현재 접근 가능한 사업이 없습니다.',
}

/** 새 비밀번호를 계정에 저장한다. */
async function savePassword(
  db: SupabaseClient,
  userId: string,
  newPassword: string,
): Promise<boolean> {
  const hash = await hashPassword(newPassword)
  const { error } = await db
    .from('guest_credentials')
    .update({
      password_hash: hash,
      password_set_at: new Date().toISOString(),
      login_attempts: 0,
      locked_until: null,
      // 재설정 링크로 들어와 정했다면 그 토큰은 여기서 소진된다.
      reset_token_hash: null,
      reset_expires_at: null,
    })
    .eq('user_id', userId)
  return !error
}

/** 비밀번호를 정한 직후의 착지 — 갈 곳이 하나면 바로, 여럿이면 목록, 없으면 안내. */
async function landAfterSet(db: SupabaseClient, account: GuestAccount): Promise<Response> {
  const participations = await loadParticipations(db, account.id)
  if (participations.length === 0) return jsonResponse(NO_ACCESS)
  if (participations.length === 1) {
    return jsonResponse(await issueSession(db, account, participations[0]))
  }
  return jsonResponse({
    selectTicket: await signSelectTicket(account.id),
    expiresInSec: SELECT_TTL_SEC,
    user: { id: account.id, name: account.name, user_type: account.user_type },
    choices: participations.map(toChoice),
  })
}

/** [설정 모드] 티켓 검증 → 정책 검사 → 저장 → 착지. */
async function handleInitialSet(
  db: SupabaseClient,
  changeTicket: string,
  newPassword: string,
): Promise<Response> {
  const secret = Deno.env.get('GUEST_JWT_SECRET') ?? ''
  if (!secret) return jsonResponse({ error: 'jwt_secret_missing' }, 500)

  const claims = await verifyJwt(changeTicket, secret, 'guest-password-change')
  if (!claims || typeof claims.sub !== 'string') return jsonResponse(EXPIRED, 401)

  const account = await loadAccount(db, claims.sub)
  if (!account) return jsonResponse(EXPIRED, 401)

  const cred = await loadCredentials(db, account.id)
  // 티켓이 살아 있어도 그 사이 비밀번호가 정해졌다면(다른 창에서 먼저 설정) 다시 로그인시킨다.
  // 재설정 링크로 받은 티켓(rst)만 예외다 — 그 경로는 **이미 있는 비밀번호를 바꾸러** 온다.
  const isReset = claims.rst === true
  if (cred.password_hash && !isReset) return jsonResponse(EXPIRED, 401)

  const ledgerPhone = await readLedgerPhone(db, account)
  const policyError = passwordPolicyError(newPassword, ledgerPhone ?? '')
  if (policyError) return jsonResponse({ error: 'weak_password', message: policyError }, 400)

  if (!(await savePassword(db, account.id, newPassword))) {
    return jsonResponse({ error: 'save_failed' }, 500)
  }
  return await landAfterSet(db, account)
}

/** [변경 모드] 세션 검증 → 현재 비밀번호 재확인 → 정책 검사 → 저장. */
async function handleChange(
  db: SupabaseClient,
  req: Request,
  currentPassword: string,
  newPassword: string,
): Promise<Response> {
  const session = await verifyGuestSession(db, req)
  if (!session) return jsonResponse(SESSION_EXPIRED, 401)

  const account = await loadAccount(db, session.user.id)
  if (!account) return jsonResponse(SESSION_EXPIRED, 401)

  const cred = await loadCredentials(db, account.id)
  if (isLocked(cred)) return jsonResponse(LOCKED, 429)

  if (!cred.password_hash || !(await verifyPassword(currentPassword, cred.password_hash))) {
    await recordFailure(db, cred)
    return jsonResponse(WRONG_CURRENT, 401)
  }

  const ledgerPhone = await readLedgerPhone(db, account)
  const policyError = passwordPolicyError(newPassword, ledgerPhone ?? '')
  if (policyError) return jsonResponse({ error: 'weak_password', message: policyError }, 400)
  if (newPassword === currentPassword) {
    return jsonResponse(
      { error: 'weak_password', message: '지금 쓰는 비밀번호와 다른 값을 사용하세요.' },
      400,
    )
  }

  if (!(await savePassword(db, account.id, newPassword))) {
    return jsonResponse({ error: 'save_failed' }, 500)
  }
  await clearFailures(db, account.id)
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
