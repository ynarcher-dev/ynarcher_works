// 게스트 비밀번호 재설정 본체 — 두 방향이 한 함수에 산다.
//
// [발송] { userId } + Authorization: Bearer <내부 사용자 토큰>
//   내부 사용자가 "재설정 안내 보내기"를 누른다. **호출자에게는 어떤 값도 돌려주지 않는다** —
//   링크는 게스트 본인 연락처로만 나간다. 종전의 담당자 '비밀번호 초기화'를 대체한다:
//   계정을 사업마다 갈라 두었을 때는 담당자가 값을 알아도 자기 사업만 열렸지만, 계정을
//   합치면 그 게스트가 참여 중인 **다른 팀 사업까지 전부** 열린다.
//
// [소진] { resetToken }
//   게스트가 링크를 눌러 들어온다. 토큰이 유효하면 비밀번호 설정 티켓으로 바꿔 준다 —
//   그 다음은 guest-auth-password의 설정 모드가 이어받는다(정책·저장이 한곳에 있어야 한다).
//
// 인가는 이 함수가 아니라 RPC(authorize_guest_password_reset)가 진다. 호출자의 토큰을
// 그대로 달아 PostgREST로 보내므로 SECURITY INVOKER + RLS가 그대로 걸린다. service_role을
// 쓰지 않는 이유가 그것이다 — 여기서 관리자 키를 쓰면 판정을 이 함수 안에 복제해야 하고
// 그 복제본이 곧 권한 구멍이 된다. 감사 로그도 그 RPC가 남긴다.
//
// 2026-09-13: 토큰의 **저장과 소진**을 조건부 RPC 둘로 내렸다(3_9_1 §6.2.3). 종전에는
// 계정을 읽고 → 토큰을 만들고 → upsert하고 → 읽은 주소로 보내는 네 단계가 따로 밟혀서,
// 그 사이에 들어온 연락처 수정이 비운 자리에 옛 스냅샷의 토큰이 다시 얹혔다. 소진도 조건
// 없는 UPDATE라 같은 링크로 두 요청이 들어오면 둘 다 티켓을 받았다. 그와 함께 본체를
// index.ts에서 분리했다 — 이음매는 클라이언트 둘과 발송기 하나뿐이다.
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { jsonResponse } from '../_shared/cors.ts'
import { sha256Hex } from '../_shared/crypto.ts'
import {
  consumeGuestResetToken,
  issueGuestResetToken,
  loadAccount,
  signChangeTicket,
  CHANGE_TTL_SEC,
} from '../_shared/guestAccount.ts'
import type { sendNotification } from '../_shared/notifications.ts'

/** 재설정 링크 수명. 짧게 둔다 — 메일함에 오래 남는 링크는 그 자체가 열쇠다. */
const RESET_TTL_MIN = 30

const INVALID = {
  error: 'reset_invalid',
  message: '링크가 만료되었거나 이미 사용되었습니다. 다시 요청해 주세요.',
}

/** 추측 불가능한 토큰. 저장은 해시만 한다 — 원장이 새도 링크가 되지 않아야 한다. */
function newToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32))
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}

export interface ResetHandlerDeps {
  /** service_role 클라이언트를 만드는 함수(자격증명 원장에는 다른 경로가 없다). */
  admin: () => SupabaseClient
  /** 호출자 토큰을 그대로 달아 RLS를 받는 클라이언트. */
  caller: (accessToken: string) => SupabaseClient
  /** 발송기. 주입해 두면 테스트가 바깥으로 나가지 않는다. */
  notify: typeof sendNotification
}

async function handleSend(
  deps: ResetHandlerDeps,
  req: Request,
  userId: string,
): Promise<Response> {
  const token = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '')
  if (!token) return jsonResponse({ error: 'unauthorized' }, 401)

  const { error } = await deps
    .caller(token)
    .rpc('authorize_guest_password_reset', { p_user_id: userId })
  if (error) {
    const denied = error.code === '42501'
    return jsonResponse(
      { error: denied ? 'forbidden' : 'reset_failed', message: error.message },
      denied ? 403 : 400,
    )
  }

  // 여기부터는 service_role이다. 자격증명 원장에는 정책이 하나도 없어 다른 경로가 없다.
  const db = deps.admin()
  const account = await loadAccount(db, userId)
  if (!account) return jsonResponse({ error: 'reset_failed' }, 400)

  // 수신처가 없으면 쓸 수 없는 토큰도 만들지 않는다. 빈 문자열은 없는 값으로 보고,
  // 이메일이 비어 있으면 전화번호로 안내한다.
  const to = account.email?.trim() || account.phone?.trim() || ''
  if (!to) return jsonResponse({ ok: false, notified: false, reason: 'no_contact' })

  // 저장은 **이 계정을 읽은 그 판**에 묶는다. 판이 그 사이에 올랐다면 주소·번호가 바뀐
  // 것이므로 저장도 발송도 하지 않는다 — 아래 수신처는 위에서 읽은 스냅샷이고, 조건 없이
  // 저장하면 그 스냅샷(옛 주소)으로 살아 있는 링크를 보내게 된다.
  const raw = newToken()
  const issued = await issueGuestResetToken(db, {
    userId,
    expectedSessionVersion: account.session_version ?? 1,
    tokenHash: await sha256Hex(raw),
    expiresAt: new Date(Date.now() + RESET_TTL_MIN * 60 * 1000).toISOString(),
  })
  if (!issued.issued) {
    return jsonResponse({ error: 'reset_failed' }, issued.reason === 'rpc_failed' ? 500 : 400)
  }

  // 수신처는 요청 본문이 아니라 계정 원장에서 읽는다. 클라이언트가 수신처를 정할 수 있으면
  // 남의 재설정 링크를 자기 주소로 받을 수 있다.
  const base = Deno.env.get('GUEST_APP_BASE_URL') ?? ''
  let notified = false
  try {
    const res = await deps.notify({
      channel: to.includes('@') ? 'EMAIL' : 'ALIMTALK',
      to,
      templateCode: 'GUEST_PASSWORD_RESET',
      variables: { name: account.name, link: `${base}/reset?token=${raw}`, minutes: String(RESET_TTL_MIN) },
    })
    notified = res.ok
  } catch (_e) {
    notified = false
  }

  // 발송 결과만 알린다. 토큰도, 연락처 원본도 호출자에게 돌려주지 않는다.
  return jsonResponse({ ok: true, notified })
}

async function handleConsume(
  deps: ResetHandlerDeps,
  resetToken: string,
): Promise<Response> {
  const db = deps.admin()

  // 해시·만료·계정 상태·발급 시점 판을 한 트랜잭션에서 보고 그 자리에서 정확히 한 번
  // 비운다. 같은 링크로 두 요청이 들어오면 하나만 통과한다.
  const consumed = await consumeGuestResetToken(db, await sha256Hex(resetToken))
  if (!consumed.consumed) return jsonResponse(INVALID, 401)

  // 티켓은 **소진이 검증해 돌려준 판**으로 서명한다. 계정을 다시 읽어 그 값을 쓰면, 재조회
  // 사이에 오른 판이 실려 옛 링크가 새 자격으로 승격된다. 그래서 여기서 계정을 읽지 않는다.
  return jsonResponse({
    changeTicket: await signChangeTicket(
      { id: consumed.userId, session_version: consumed.sessionVersion },
      true,
    ),
    expiresInSec: CHANGE_TTL_SEC,
    name: consumed.name,
  })
}

/** 재설정 발송·소진 핸들러. */
export function createResetHandler(deps: ResetHandlerDeps) {
  return async (req: Request): Promise<Response> => {
    if (req.method !== 'POST') return jsonResponse({ error: 'method_not_allowed' }, 405)

    try {
      const body = await req.json().catch(() => ({}))
      if (body?.resetToken) return await handleConsume(deps, String(body.resetToken))
      if (body?.userId) return await handleSend(deps, req, String(body.userId))
      return jsonResponse({ error: 'invalid_request' }, 400)
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'internal_error'
      if (msg === 'jwt_secret_missing') return jsonResponse({ error: msg }, 500)
      return jsonResponse({ error: 'internal_error' }, 500)
    }
  }
}
