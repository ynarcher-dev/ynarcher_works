// 게스트 맥락 선택·전환 — 어느 사업으로 들어갈지 정한다.
//
// 요청 두 가지:
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
import { jsonResponse, withCors } from '../_shared/cors.ts'
import { verifyJwt } from '../_shared/crypto.ts'
import {
  issueSession,
  loadAccount,
  loadParticipations,
  toChoice,
} from '../_shared/guestAccount.ts'
import { verifyGuestSession } from '../_shared/guestSession.ts'
import { supabaseAdmin } from '../_shared/supabaseAdmin.ts'

const EXPIRED = {
  error: 'session_expired',
  message: '세션이 만료되었거나 접근이 닫혔습니다. 다시 로그인해 주세요.',
}
const NOT_ALLOWED = {
  error: 'context_denied',
  message: '지금 들어갈 수 없는 사업입니다. 목록을 새로 고쳐 주세요.',
}

/** 선택 티켓 또는 살아 있는 세션에서 계정 id를 얻는다. 둘 다 아니면 null. */
async function resolveUserId(
  db: ReturnType<typeof supabaseAdmin>,
  req: Request,
  selectTicket: unknown,
): Promise<string | null> {
  if (typeof selectTicket === 'string' && selectTicket) {
    const secret = Deno.env.get('GUEST_JWT_SECRET') ?? ''
    if (!secret) throw new Error('jwt_secret_missing')
    const claims = await verifyJwt(selectTicket, secret, 'guest-context-select')
    return claims && typeof claims.sub === 'string' ? claims.sub : null
  }
  // 세션 경로는 계정 상태·session_version까지 되묻는 공용 검증을 그대로 탄다.
  const session = await verifyGuestSession(db, req)
  return session?.user.id ?? null
}

Deno.serve(withCors(async (req: Request) => {
  if (req.method !== 'POST') return jsonResponse({ error: 'method_not_allowed' }, 405)

  try {
    const body = await req.json().catch(() => ({}))
    const db = supabaseAdmin()

    const userId = await resolveUserId(db, req, body?.selectTicket)
    if (!userId) return jsonResponse(EXPIRED, 401)

    const account = await loadAccount(db, userId)
    if (!account) return jsonResponse(EXPIRED, 401)

    const participations = await loadParticipations(db, account.id)

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

    return jsonResponse(await issueSession(db, account, target))
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'internal_error'
    if (msg === 'jwt_secret_missing') return jsonResponse({ error: msg }, 500)
    return jsonResponse({ error: 'internal_error' }, 500)
  }
}))
