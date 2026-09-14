// 게스트 세션 새로고침 — 독립 계정과 현재 사업·조합 참여 정보를 다시 확인한다.
// 요청: POST (Authorization: Bearer <세션 JWT>)
// 응답: { user, program, participation, contexts } | 401
//
// 이름·소속·이메일의 정본은 users다. 참여자 원장은 계정 생성 시 입력을 돕는 출처일 뿐
// 관계나 동기화 대상이 아니므로, 이 함수는 startups/networks를 읽거나 계정을 덮어쓰지 않는다.
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { jsonResponse } from '../_shared/cors.ts'
import { loadOpenParticipations, verifyGuestSession } from '../_shared/guestSession.ts'
import { loadParticipations, toChoice } from '../_shared/guestAccount.ts'
import {
  guestProgramSelect,
  isDeadProgram,
  ledgerEntityKey,
  loadProgramAnywhere,
} from '../_shared/programLedger.ts'

const EXPIRED = {
  error: 'session_expired',
  message: '세션이 만료되었거나 접근이 닫혔습니다. 다시 로그인해 주세요.',
}

/**
 * AC 제안 단계(사업 유치) 상태 — 와이앤아처 내부의 사업현황이지 참여자의 선정 여부가
 * 아니므로 게스트에게 보내지 않는다('미선정' 배지를 참여기업이 자기 일로 오독한다).
 */
const INTERNAL_ONLY_STATUSES = new Set(['PROPOSED', 'SELECTED', 'NOT_SELECTED'])

/** 새로고침 핸들러. `db`는 호출마다 service_role 클라이언트를 만든다. */
export function createRefreshHandler(db: () => SupabaseClient) {
  return async (req: Request): Promise<Response> => {
    if (req.method !== 'POST') return jsonResponse({ error: 'method_not_allowed' }, 405)

    try {
      const client = db()
      const session = await verifyGuestSession(client, req)
      if (!session) return jsonResponse(EXPIRED, 401)
      if (!session.programId) return jsonResponse(EXPIRED, 401)

      const participations = await loadOpenParticipations(
        client,
        session.programId,
        session.user.id,
      )
      if (participations.length === 0) return jsonResponse(EXPIRED, 401)

      // 게스트에게 보여줄 사업·조합의 표시용 컬럼만 읽는다. 참여자 원장과는 무관하다.
      const found = await loadProgramAnywhere<{
        id: string
        title: string
        code: string | null
        status: string
        start_date: string | null
        end_date: string | null
        host_organization?: string | null
        deleted_at: string | null
      }>(client, session.programId, guestProgramSelect)
      if (!found || found.row.deleted_at || isDeadProgram(found.table, found.row.status)) {
        return jsonResponse(EXPIRED, 401)
      }
      const program = found.row

      const { deleted_at: _omit, ...programOut } = program
      return jsonResponse({
        user: {
          id: session.user.id,
          user_type: session.user.user_type,
          name: session.user.name,
          email: session.user.email,
          affiliation: session.user.affiliation,
        },
        program: {
          ...programOut,
          entity_key: ledgerEntityKey(found.table),
          status: INTERNAL_ONLY_STATUSES.has(program.status) ? null : program.status,
        },
        participation: {
          joined_at: participations[0].joined_at,
        },
        currentParticipantId: participations[0].id,
        contexts: (await loadParticipations(client, session.user.id)).map(toChoice),
      })
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'internal_error'
      if (msg === 'jwt_secret_missing') return jsonResponse({ error: msg }, 500)
      return jsonResponse({ error: 'internal_error' }, 500)
    }
  }
}
