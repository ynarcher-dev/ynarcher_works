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
import { loadParticipations, toChoice } from '../_shared/guestAccount.ts'
import { supabaseAdmin } from '../_shared/supabaseAdmin.ts'
import { loadProgramAnywhere } from '../_shared/programLedger.ts'

const EXPIRED = {
  error: 'session_expired',
  message: '세션이 만료되었거나 접근이 닫혔습니다. 다시 로그인해 주세요.',
}

/** 게스트가 진입할 수 없는 사업 상태(로그인과 같은 기준). */
const DEAD_PROGRAM_STATUSES = new Set(['FINISHED', 'CANCELLED'])

/**
 * AC 제안 단계(사업 유치) 상태 — 와이앤아처 내부의 사업현황이지 참여자의 선정 여부가
 * 아니므로 게스트에게 보내지 않는다('미선정' 배지를 참여기업이 자기 일로 오독한다).
 */
const INTERNAL_ONLY_STATUSES = new Set(['PROPOSED', 'SELECTED', 'NOT_SELECTED'])

Deno.serve(withCors(async (req: Request) => {
  if (req.method !== 'POST') return jsonResponse({ error: 'method_not_allowed' }, 405)

  try {
    const db = supabaseAdmin()
    const session = await verifyGuestSession(db, req)
    if (!session) return jsonResponse(EXPIRED, 401)
    // 사업이 아닌 맥락(장래 fund 등)의 세션은 이 함수가 답할 것이 없다. 조용히 빈 값을
    // 돌려주면 화면이 "사업이 사라졌다"로 읽으므로 사유를 가진 만료로 보낸다.
    if (!session.programId) return jsonResponse(EXPIRED, 401)

    const participations = await loadOpenParticipations(
      db,
      session.programId,
      session.user.id,
    )
    // 명부의 문이 닫혔으면(차단·회수) 세션이 살아 있어도 여기서 끝낸다 — '즉시 차단' 규칙.
    if (participations.length === 0) return jsonResponse(EXPIRED, 401)

    // 게스트에게 보여줄 표시용 컬럼만 고른다 — 사업구분(category)·내부 제목 같은 내부 분류는
    // 외부 참여자의 화면 요소가 아니므로 응답에 싣지 않는다.
    const program = await loadProgramAnywhere<{
      id: string
      title: string
      code: string | null
      status: string
      start_date: string | null
      end_date: string | null
      host_organization: string | null
      deleted_at: string | null
    }>(
      db,
      session.programId,
      'id, title, code, status, start_date, end_date, host_organization, deleted_at',
    )
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
      program: {
        ...programOut,
        status: INTERNAL_ONLY_STATUSES.has(program.status) ? null : program.status,
      },
      participation: {
        // 이 맥락의 자격 하나. 역할 축은 2026-09-05에 걷혔다 — 자격은 원장이 답한다.
        persona: participations[0].master_table,
        joined_at: participations[0].joined_at,
      },
      company: identity.companyName ? { name: identity.companyName } : null,
      // 사이드바 전환기가 쓰는 목록. 여기 함께 실어 보내면 앱 구동 때 왕복이 한 번으로
      // 끝나고, 목록과 현재 맥락이 같은 시점의 사실이 된다.
      currentParticipantId: participations[0].id,
      contexts: (await loadParticipations(db, session.user.id)).map(toChoice),
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'internal_error'
    if (msg === 'jwt_secret_missing') return jsonResponse({ error: msg }, 500)
    return jsonResponse({ error: 'internal_error' }, 500)
  }
}))
