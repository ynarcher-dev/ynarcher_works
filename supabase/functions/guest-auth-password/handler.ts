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
//
// 2026-09-12: 판정 본체를 index.ts에서 분리해 배선과 갈랐다(로그인 함수와 같은 모양).
// 이음매는 DB 클라이언트를 만드는 함수 하나뿐이다.
import { jsonResponse } from '../_shared/cors.ts'
import { verifyJwt } from '../_shared/crypto.ts'
import {
  accountSessionVersion,
  commitGuestPassword,
  isLocked,
  issueSession,
  loadAccount,
  loadCredentials,
  loadParticipations,
  recordFailure,
  signSelectTicket,
  ticketVersionClaim,
  toChoice,
  SELECT_TTL_SEC,
  type CommitFailure,
  type GuestAccount,
} from '../_shared/guestAccount.ts'
import { verifyGuestSession } from '../_shared/guestSession.ts'
import { hashPassword, passwordPolicyError, verifyPassword } from '../_shared/password.ts'
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
  message: '비밀번호가 설정되었습니다. 다만 현재 접근 가능한 프로젝트/FUND가 없습니다.',
}
const CONFLICT = {
  error: 'password_conflict',
  message: '다른 곳에서 비밀번호가 먼저 바뀌었습니다. 다시 로그인해 주세요.',
}

/**
 * 커밋 실패를 응답으로 옮긴다. **성공으로 착지하는 길이 없다.**
 *
 * · `password_changed` → 409. 같은 계정의 다른 창이 먼저 정했다는 뜻이며, 만료와 구분해
 *   답해야 사용자가 "왜 내 값이 안 들어갔는지" 알 수 있다.
 * · `version_mismatch`·`account_unavailable` → 401. ADMIN 초기화·연락처 수정·정지로 자격이
 *   끊긴 자리다. 어느 쪽이든 답은 "처음부터 다시"다.
 * · `rpc_failed` → 500. 우리 쪽 장애이므로 재시도를 권하는 자리다.
 */
function commitFailureResponse(reason: CommitFailure, expired: Record<string, unknown>): Response {
  if (reason === 'password_changed') return jsonResponse(CONFLICT, 409)
  if (reason === 'rpc_failed') return jsonResponse({ error: 'save_failed' }, 500)
  return jsonResponse(expired, 401)
}

/** 비밀번호를 정한 직후의 착지 — 갈 곳이 하나면 바로, 여럿이면 목록, 없으면 안내. */
async function landAfterSet(db: SupabaseClient, account: GuestAccount): Promise<Response> {
  const participations = await loadParticipations(db, account.id)
  if (participations.length === 0) return jsonResponse(NO_ACCESS)
  if (participations.length === 1) {
    return jsonResponse(await issueSession(db, account, participations[0]))
  }
  return jsonResponse({
    selectTicket: await signSelectTicket(account),
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

  // 티켓이 나간 뒤에 계정의 세션 판이 올랐다면(ADMIN의 연락처 수정·비밀번호 초기화, 접근
  // 차단) 그 티켓은 옛 판의 것이다. 서명과 수명만 보면 초기화 직전에 나간 티켓이 남은
  // 10분 동안 새 비밀번호를 세울 수 있다 — 초기화가 끊은 자리를 그 티켓이 되돌린다.
  const ticketVersion = ticketVersionClaim(claims)
  if (ticketVersion === null || ticketVersion !== accountSessionVersion(account)) {
    return jsonResponse(EXPIRED, 401)
  }

  const cred = await loadCredentials(db, account.id)
  // 티켓이 살아 있어도 그 사이 비밀번호가 정해졌다면(다른 창에서 먼저 설정) 다시 로그인시킨다.
  // 재설정 링크로 받은 티켓(rst)만 예외다 — 그 경로는 **이미 있는 비밀번호를 바꾸러** 온다.
  const isReset = claims.rst === true
  if (cred.password_hash && !isReset) return jsonResponse(EXPIRED, 401)

  const policyError = passwordPolicyError(newPassword, account.phone ?? '')
  if (policyError) return jsonResponse({ error: 'weak_password', message: policyError }, 400)

  // 해시 계산은 수백 ms다. 그 사이에 초기화·연락처 수정이 들어올 수 있으므로, 쓰기는
  // "내가 봤던 판과 해시가 그대로일 때만"이라는 조건과 함께 DB로 내려간다. 기대 판은
  // **티켓의 값**을 그대로 쓴다 — 위에서 계정과 대조해 같다고 확인한 그 값이다.
  const commit = await commitGuestPassword(db, {
    userId: account.id,
    expectedSessionVersion: ticketVersion,
    // 개시 설정은 해시가 없던 자리에만 얹는다. 재설정 링크(rst)는 읽은 그 해시만 덮어쓴다.
    expectedPasswordHash: isReset ? cred.password_hash : null,
    newPasswordHash: await hashPassword(newPassword),
    consumeTicket: true,
  })
  if (!commit.committed) return commitFailureResponse(commit.reason, EXPIRED)

  // 판은 커밋이 올렸다. 계정을 다시 읽어 얻으면 그 재조회가 새 경합 창이 되므로,
  // **커밋이 확인해 돌려준 값**을 그대로 세션·선택 티켓에 싣는다.
  return await landAfterSet(db, { ...account, session_version: commit.sessionVersion })
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

  const policyError = passwordPolicyError(newPassword, account.phone ?? '')
  if (policyError) return jsonResponse({ error: 'weak_password', message: policyError }, 400)
  if (newPassword === currentPassword) {
    return jsonResponse(
      { error: 'weak_password', message: '지금 쓰는 비밀번호와 다른 값을 사용하세요.' },
      400,
    )
  }

  // 기대 판은 **세션 검증이 확인한 값**이다. 방금 읽은 계정의 값을 쓰면, 세션 검증과
  // 이 조회 사이에 판이 오른 경우(초기화·연락처 수정) 끊긴 자격이 새 판으로 승격된다.
  // 실패 카운터 초기화도 커밋이 함께 한다 — 따로 쓰면 커밋이 거절된 뒤에도 지워진다.
  const commit = await commitGuestPassword(db, {
    userId: account.id,
    expectedSessionVersion: session.user.session_version ?? 1,
    expectedPasswordHash: cred.password_hash,
    newPasswordHash: await hashPassword(newPassword),
    // 로그인 상태의 변경에는 소진할 티켓이 없다. 판을 올리면 방금 바꾼 본인의 세션이
    // 끊기고, 이 응답에는 새 토큰을 실을 자리가 없다(응답은 { ok: true } 하나다).
    consumeTicket: false,
  })
  if (!commit.committed) return commitFailureResponse(commit.reason, SESSION_EXPIRED)

  return jsonResponse({ ok: true })
}

/** 비밀번호 설정·변경 핸들러. `db`는 부를 때마다 클라이언트를 만드는 함수다. */
export function createPasswordHandler(db: () => SupabaseClient) {
  return async (req: Request): Promise<Response> => {
    if (req.method !== 'POST') return jsonResponse({ error: 'method_not_allowed' }, 405)

    try {
      const { changeTicket, currentPassword, newPassword } = await req.json()
      if (!newPassword) return jsonResponse({ error: 'invalid_request' }, 400)

      const client = db()
      if (currentPassword) {
        return await handleChange(client, req, String(currentPassword), String(newPassword))
      }
      if (changeTicket) {
        return await handleInitialSet(client, String(changeTicket), String(newPassword))
      }
      return jsonResponse({ error: 'invalid_request' }, 400)
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'internal_error'
      if (msg === 'jwt_secret_missing') return jsonResponse({ error: msg }, 500)
      return jsonResponse({ error: 'internal_error' }, 500)
    }
  }
}
