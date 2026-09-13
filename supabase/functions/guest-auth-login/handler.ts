// 게스트 로그인 핸들러 본체 — 이메일(ID) + 비밀번호.
//
// 요청: { email, password }
// 응답 넷 중 하나:
//   · { accessToken, user, context }            참여가 1건 — 바로 들어간다
//   · { selectTicket, choices }                 참여가 2건 이상 — 목록에서 고른다
//   · { accessible: false }                     참여가 0건 — "지금 들어갈 사업이 없다"
//   · { mustChangePassword: true, changeTicket } 비밀번호를 아직 정하지 않았다
//
// **사업코드는 더 이상 받지 않는다.** 코드는 안내 메일·알림톡에 평문으로 실려 나가는 값이라
// 3요소 중 하나가 이미 공개였고, 빼도 잃는 방어선이 없다. 어느 사업으로 들어갈지는
// 로그인 **이후에** 고른다 — 막는 지점(app.guest_program_ids)은 그대로다.
//
// 초기 비밀번호는 계정 생성 때 확정해 users.phone에 저장한 번호(숫자만)이며,
// **계정에 비밀번호가 없을 때만** 통한다. 이후 원장 연락처 변경과는 독립적이다.
// 그 상태로 들어오면 세션을 주지 않고 설정 티켓만 준다 — 초기 비밀번호로 얻은 토큰이
// 데이터에 닿으면 비밀번호를 바꾸지 않은 채로 계속 쓸 수 있게 된다.
//
// 실패 응답은 사유를 가리지 않는다(계정 열거 차단). 연속 5회 실패면 15분 잠근다.
//
// 2026-09-12: 본체를 index.ts에서 분리해 배선(Deno.serve)과 갈랐다. 이음매는 하나뿐이다 —
// DB 클라이언트를 만드는 함수를 인자로 받으며, 생성 시점은 종전과 같다.
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { jsonResponse } from '../_shared/cors.ts'
import {
  clearFailures,
  findAccountByEmail,
  isLocked,
  issueSession,
  loadCredentials,
  loadParticipations,
  recordFailure,
  signChangeTicket,
  signSelectTicket,
  toChoice,
  CHANGE_TTL_SEC,
  SELECT_TTL_SEC,
} from '../_shared/guestAccount.ts'
import { normalizePhone, verifyPassword } from '../_shared/password.ts'

const DENIED = {
  error: 'auth_failed',
  message: '이메일 또는 비밀번호가 일치하지 않습니다.',
}
const LOCKED = {
  error: 'locked',
  message: '로그인 시도가 많아 잠시 잠겼습니다. 15분 뒤 다시 시도해 주세요.',
}
const NO_ACCESS = {
  accessible: false,
  // 맥락이 사업·조합 둘이 되었으므로 어느 한쪽의 이름을 쓰지 않는다 — 조합에만 참여한
  // 게스트에게 "사업이 없습니다"라고 답하면 그 사람은 자기 이야기가 아니라고 읽는다.
  message: '현재 접근 가능한 곳이 없습니다. 담당자에게 문의해 주세요.',
}

/** 로그인 핸들러. `db`는 부를 때마다 클라이언트를 만드는 함수다(종전 supabaseAdmin 호출과 같은 자리). */
export function createLoginHandler(db: () => SupabaseClient) {
  return async (req: Request): Promise<Response> => {
    if (req.method !== 'POST') return jsonResponse({ error: 'method_not_allowed' }, 405)

    try {
      const { email, password } = await req.json()
      if (!email || !password) return jsonResponse({ error: 'invalid_request' }, 400)

      const client = db()

      // 계정 자체가 없어도 같은 응답으로 답한다. 여기서 사유를 가르면 이메일 하나로
      // 계정 존재를 물을 수 있게 된다.
      const account = await findAccountByEmail(client, String(email))
      if (!account) return jsonResponse(DENIED, 401)

      const cred = await loadCredentials(client, account.id)
      if (isLocked(cred)) return jsonResponse(LOCKED, 429)

      // 비밀번호를 정하기 전이면 계정을 만들 때 확정한 연락처가 초기 비밀번호다. 원장의 현재
      // 연락처와 분리해야 이직·번호 변경이 로그인 자격증명을 조용히 바꾸지 않는다.
      const initial = !cred.password_hash
      let ok: boolean
      if (initial) {
        const given = normalizePhone(password)
        ok = given.length > 0 && given === normalizePhone(account.phone)
      } else {
        ok = await verifyPassword(String(password), cred.password_hash)
      }

      if (!ok) {
        await recordFailure(client, cred)
        return jsonResponse(DENIED, 401)
      }

      await clearFailures(client, account.id)

      if (initial) {
        const changeTicket = await signChangeTicket(account)
        return jsonResponse({
          mustChangePassword: true,
          changeTicket,
          expiresInSec: CHANGE_TTL_SEC,
        })
      }

      // 여기부터는 본인 확인이 끝난 상태다. 그래서 "들어갈 곳이 없다"를 사유와 함께 답할 수
      // 있다 — 종전에는 로그인 자체가 실패해 담당자도 원인을 알려 줄 수 없었다.
      const participations = await loadParticipations(client, account.id)
      if (participations.length === 0) return jsonResponse(NO_ACCESS)

      if (participations.length === 1) {
        return jsonResponse(await issueSession(client, account, participations[0]))
      }

      return jsonResponse({
        selectTicket: await signSelectTicket(account),
        expiresInSec: SELECT_TTL_SEC,
        user: { id: account.id, name: account.name, user_type: account.user_type },
        choices: participations.map(toChoice),
      })
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'internal_error'
      if (msg === 'jwt_secret_missing') return jsonResponse({ error: msg }, 500)
      return jsonResponse({ error: 'internal_error' }, 500)
    }
  }
}
