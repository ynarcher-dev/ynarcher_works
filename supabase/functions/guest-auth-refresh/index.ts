// 게스트 세션 새로고침 — 원장의 지금 값(이름·사업 정보·참여 정보)을 세션에 되비춘다.
// 요청: POST (Authorization: Bearer <세션 JWT>)
// 응답: { user, program, participation, company } | 401
//
// 이 함수가 없던 동안 게스트 화면의 이름은 로그인 시점의 localStorage 복사본이었다.
// WORKS에서 원장(기업 대표자·전문가 이름)을 고쳐도 게스트에게는 영영 옛 이름이 보였다 —
// 계정(users.name)과 초대장(guest_invitations.name)까지 원장의 낡은 복사본이었기 때문이다.
// 앱 구동·마이페이지 진입 때 이 함수를 불러 원장 값으로 화면과 복사본을 함께 바로잡는다.
//
// 게스트에게 사업 원장(programs)의 SELECT 정책을 열지 않는 이유: 마이페이지에 필요한 것은
// 자기 사업 한 건의 표시용 몇 컬럼뿐이고, 그 판정(세션 고정 사업 + 명부의 열린 문 + 사업 생존)은
// 로그인과 같은 규칙이다. 같은 판정을 RLS에 한 벌 더 복제하는 대신 로그인이 쓰는 경로를 재사용한다.
import { jsonResponse, withCors } from '../_shared/cors.ts'
import {
  loadOpenParticipations,
  readLedgerIdentity,
  syncGuestName,
  verifyGuestSession,
} from '../_shared/guestSession.ts'
import { supabaseAdmin } from '../_shared/supabaseAdmin.ts'

const EXPIRED = {
  error: 'session_expired',
  message: '세션이 만료되었거나 접근이 닫혔습니다. 다시 로그인해 주세요.',
}

/** 게스트가 진입할 수 없는 사업 상태(로그인과 같은 기준). */
const DEAD_PROGRAM_STATUSES = new Set(['FINISHED', 'CANCELLED'])

Deno.serve(withCors(async (req: Request) => {
  if (req.method !== 'POST') return jsonResponse({ error: 'method_not_allowed' }, 405)

  try {
    const db = supabaseAdmin()
    const session = await verifyGuestSession(db, req)
    if (!session) return jsonResponse(EXPIRED, 401)

    const participations = await loadOpenParticipations(
      db,
      session.programId,
      session.user.id,
    )
    // 명부의 문이 닫혔으면(차단·회수) 세션이 살아 있어도 여기서 끝낸다 — '즉시 차단' 규칙.
    if (participations.length === 0) return jsonResponse(EXPIRED, 401)

    // 게스트에게 보여줄 표시용 컬럼만 고른다 — 사업구분(category)·내부 제목 같은 내부 분류는
    // 외부 참여자의 화면 요소가 아니므로 응답에 싣지 않는다.
    const { data: programRow } = await db
      .from('programs')
      .select('id, title, code, status, start_date, end_date, host_organization, deleted_at')
      .eq('id', session.programId)
      .maybeSingle()
    const program = programRow as
      | {
          id: string
          title: string
          code: string | null
          status: string
          start_date: string | null
          end_date: string | null
          host_organization: string | null
          deleted_at: string | null
        }
      | null
    if (!program || program.deleted_at || DEAD_PROGRAM_STATUSES.has(program.status)) {
      return jsonResponse(EXPIRED, 401)
    }

    const identity = await readLedgerIdentity(db, participations[0])
    const name = await syncGuestName(db, session.user, participations, identity.name)

    const { deleted_at: _omit, ...programOut } = program
    return jsonResponse({
      user: {
        id: session.user.id,
        user_type: session.user.user_type,
        name,
        email: session.user.email,
      },
      program: programOut,
      participation: {
        roles: [...new Set(participations.map((p) => p.role))],
        joined_at: participations[0].joined_at,
      },
      company: identity.companyName ? { name: identity.companyName } : null,
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'internal_error'
    if (msg === 'jwt_secret_missing') return jsonResponse({ error: msg }, 500)
    return jsonResponse({ error: 'internal_error' }, 500)
  }
}))
