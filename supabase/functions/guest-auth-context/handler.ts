// 게스트 맥락 선택·전환 본체 — 어느 사업으로 들어갈지 정한다.
//
// 요청 세 가지:
//   · { selectTicket, participantId }  로그인 직후 목록에서 처음 고를 때
//   · { participantId } + Authorization: Bearer <세션 JWT>  사이드바에서 갈아탈 때
//   · { }               + Authorization: Bearer <세션 JWT>  고를 수 있는 목록만 조회
//
// 응답: { accessToken, user, context } 또는 { choices }
//
// 전환이 재로그인이 아닌 이유: 바뀌는 것은 신원이 아니라 **맥락**이다. 그래서 토큰만 다시
// 받는다. 다만 **한 세션에 두 맥락을 실지 않는다** — 새 토큰이 나오면 옛 토큰의 맥락은
// 그 브라우저에서 대체되고, 화면이 한 번에 보여 주는 것은 언제나 하나다.
//
// 요청한 맥락이 그 계정의 열린 참여 목록에 실제로 있는지 **서버가 다시 확인한다.**
// 클라이언트가 보낸 participantId를 그대로 토큰에 실으면, 남의 명부 행 id를 넣어 그 사업의
// 세션을 받는 길이 열린다.
//
// 2026-09-13: 본체를 index.ts에서 분리해 배선(Deno.serve)과 갈랐다 — 로그인·비밀번호 함수와
// 같은 모양이며, 선택 티켓의 세션 판 대조를 테스트에서 부를 수 있어야 했다.
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { jsonResponse } from '../_shared/cors.ts'
import { verifyJwt } from '../_shared/crypto.ts'
import {
  accountSessionVersion,
  issueSession,
  loadAccount,
  loadParticipations,
  ticketVersionClaim,
  toChoice,
} from '../_shared/guestAccount.ts'
import { verifyGuestSession } from '../_shared/guestSession.ts'

const EXPIRED = {
  error: 'session_expired',
  message: '세션이 만료되었거나 접근이 닫혔습니다. 다시 로그인해 주세요.',
}
const NOT_ALLOWED = {
  error: 'context_denied',
  message: '지금 들어갈 수 없습니다. 목록을 새로 고쳐 주세요.',
}

/**
 * 선택 티켓 또는 살아 있는 세션에서 **계정 id와 그때 확인한 세션 판**을 얻는다.
 *
 * 두 입구 모두 판을 들고 나온다. 세션 경로도 그래야 한다 — 공용 검증이 판을 대조하지만
 * 그것은 **그 시점의 읽기**이고, 이 함수 뒤에서 계정을 한 번 더 읽기 때문이다. 그 사이에
 * ADMIN 초기화가 들어오면 나중 읽기는 오른 판을 보고, 옛 토큰이 새 판의 세션으로 승격된다.
 * 확인했던 값을 들고 나와 **마지막으로 읽은 계정과 다시 맞춰야** 그 창이 닫힌다.
 */
async function resolveCaller(
  db: SupabaseClient,
  req: Request,
  selectTicket: unknown,
): Promise<{ userId: string; expectedVersion: number } | null> {
  if (typeof selectTicket === 'string' && selectTicket) {
    const secret = Deno.env.get('GUEST_JWT_SECRET') ?? ''
    if (!secret) throw new Error('jwt_secret_missing')
    const claims = await verifyJwt(selectTicket, secret, 'guest-context-select')
    if (!claims || typeof claims.sub !== 'string') return null
    const version = ticketVersionClaim(claims)
    if (version === null) return null
    return { userId: claims.sub, expectedVersion: version }
  }
  // 세션 경로는 계정 상태·session_version까지 되묻는 공용 검증을 그대로 탄다.
  const session = await verifyGuestSession(db, req)
  if (!session) return null
  return { userId: session.user.id, expectedVersion: session.user.session_version ?? 1 }
}

/** 맥락 선택·전환 핸들러. `db`는 부를 때마다 클라이언트를 만드는 함수다. */
export function createContextHandler(db: () => SupabaseClient) {
  return async (req: Request): Promise<Response> => {
    if (req.method !== 'POST') return jsonResponse({ error: 'method_not_allowed' }, 405)

    try {
      const body = await req.json().catch(() => ({}))
      const client = db()

      const caller = await resolveCaller(client, req, body?.selectTicket)
      if (!caller) return jsonResponse(EXPIRED, 401)

      const account = await loadAccount(client, caller.userId)
      if (!account) return jsonResponse(EXPIRED, 401)

      // 자격을 확인한 시점의 판과 **지금 읽은 계정의 판**이 같아야 한다. 티켓 경로는
      // 발급 시점(초기화 직전에 나간 티켓이 남은 10분 동안 세션을 계속 받아 가는 것을
      // 막는다), 세션 경로는 토큰 검증 시점(그 뒤에 오른 판으로 옛 토큰이 승격되는 것을
      // 막는다). 세션을 발급하기 전에 보는 마지막 문이다.
      if (caller.expectedVersion !== accountSessionVersion(account)) {
        return jsonResponse(EXPIRED, 401)
      }

      const participations = await loadParticipations(client, account.id)

      // 고를 것을 지정하지 않았으면 목록만 돌려준다(사이드바가 열릴 때 부른다).
      const wanted = body?.participantId ? String(body.participantId) : ''
      if (!wanted) {
        return jsonResponse({
          user: { id: account.id, name: account.name, user_type: account.user_type },
          choices: participations.map(toChoice),
        })
      }

      const target = participations.find((p) => p.participant_id === wanted)
      if (!target) return jsonResponse(NOT_ALLOWED, 403)

      return jsonResponse(await issueSession(client, account, target))
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'internal_error'
      if (msg === 'jwt_secret_missing') return jsonResponse({ error: msg }, 500)
      return jsonResponse({ error: 'internal_error' }, 500)
    }
  }
}
