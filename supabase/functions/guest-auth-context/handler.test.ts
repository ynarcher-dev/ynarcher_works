import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { signJwt, verifyJwt } from '../_shared/crypto.ts'
import { fakeDb, type Row } from '../_shared/fakeSupabase.ts'
import { SESSION_TTL_SEC } from '../_shared/guestAccount.ts'
import { createContextHandler } from './handler.ts'

/**
 * 맥락 선택·전환 회귀 테스트.
 *
 * 두 입구(선택 티켓 / 살아 있는 세션)가 같은 판정을 지나는지, 그리고 **계정의 세션 판이
 * 오른 뒤에는 둘 다 닫히는지**를 본다. 판을 올리는 것은 ADMIN의 연락처 수정·비밀번호
 * 초기화와 담당자의 접근 차단이며, 옛 선택 티켓이 남으면 초기화가 끊은 자리에서 세션이
 * 계속 나온다(수명 10분 × 발급 무제한).
 *
 * 근거: docs/docs_planning/3_9_1_guest_unified_account.md §6.2 / §7
 */

const SECRET = 'test-guest-jwt-secret'
const USER_ID = '22222222-2222-4222-8222-222222222222'

const participant = (id: string, masterTable: string, masterId: string): Row => ({
  id,
  program_id: 'pg-1',
  entity_key: 'program',
  master_table: masterTable,
  master_id: masterId,
  user_id: USER_ID,
  login_status: 'INVITED',
  joined_at: null,
})

/** 참여 2건(선택이 필요한 상태)인 계정. */
function seed() {
  return fakeDb({
    users: [
      {
        id: USER_ID,
        user_type: 'external_startup',
        name: '박참여',
        email: 'park@example.com',
        phone: '010-2222-3333',
        company_id: null,
        session_version: 1,
        is_active: true,
        deleted_at: null,
      },
    ],
    program_participants: [
      participant('pp-1', 'startups', 'st-1'),
      participant('pp-2', 'networks', 'nw-1'),
    ],
    programs: [
      {
        id: 'pg-1',
        code: 'AC-2026',
        title: '2026 액셀러레이팅',
        status: 'ACTIVE',
        deleted_at: null,
        guest_access_ends_at: null,
      },
    ],
    guest_invitations: [
      { participant_id: 'pp-1', used_at: null, app_user_id: null, name: '박참여' },
      { participant_id: 'pp-2', used_at: null, app_user_id: null, name: '박참여' },
    ],
  })
}

type Db = ReturnType<typeof seed>

const env: Record<string, string | undefined> = {}
const g = globalThis as unknown as {
  Deno?: { env: { get(key: string): string | undefined } }
}

beforeEach(() => {
  for (const k of Object.keys(env)) delete env[k]
  env.GUEST_JWT_SECRET = SECRET
  g.Deno = { env: { get: (key: string) => env[key] } }
})

afterEach(() => {
  delete g.Deno
})

interface ContextBody {
  accessToken?: string
  choices?: { participantId: string }[]
  error?: string
  user?: { id: string }
}

async function call(db: Db, body: unknown, sessionToken?: string) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (sessionToken) headers.Authorization = `Bearer ${sessionToken}`
  const res = await createContextHandler(() => db.client)(
    new Request('https://fn.test/guest-auth-context', {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    }),
  )
  return { status: res.status, body: (await res.json()) as ContextBody }
}

/** 발급 시점의 판을 실은 선택 티켓(guestAccount.signSelectTicket과 같은 모양). */
async function selectTicket(sv: number | null) {
  const nowSec = Math.floor(Date.now() / 1000)
  const claims: Record<string, unknown> = {
    sub: USER_ID,
    aud: 'guest-context-select',
    iat: nowSec,
    exp: nowSec + 600,
  }
  if (sv !== null) claims.sv = sv
  return await signJwt(claims, SECRET)
}

/** 살아 있는 세션 JWT(issueSession과 같은 클레임). */
async function sessionToken(sv: number) {
  const nowSec = Math.floor(Date.now() / 1000)
  return await signJwt(
    {
      sub: USER_ID,
      aud: 'authenticated',
      role: 'authenticated',
      app_user_id: USER_ID,
      app_role: 'external_startup',
      session_version: sv,
      context_type: 'program',
      context_id: 'pg-1',
      program_id: 'pg-1',
      iat: nowSec,
      exp: nowSec + SESSION_TTL_SEC,
    },
    SECRET,
  )
}

function bumpSessionVersion(db: Db) {
  const user = db.tables.users[0]
  user.session_version = ((user.session_version as number) ?? 1) + 1
}

describe('선택 티켓 — 고른 맥락 하나로 세션이 나온다', () => {
  it('티켓 + 내 참여 줄이면 세션이 열리고 명부에 들어온 순간이 남는다', async () => {
    const db = seed()

    const { status, body } = await call(db, {
      selectTicket: await selectTicket(1),
      participantId: 'pp-2',
    })

    expect(status).toBe(200)
    const claims = await verifyJwt(body.accessToken as string, SECRET, 'authenticated')
    expect(claims?.app_user_id).toBe(USER_ID)
    expect(claims?.context_id).toBe('pg-1')
    expect(db.tables.program_participants[1].login_status).toBe('ACTIVE')
  })

  it('목록에 없는 participantId는 403이고 세션이 나오지 않는다', async () => {
    const db = seed()

    const { status, body } = await call(db, {
      selectTicket: await selectTicket(1),
      participantId: 'pp-남의줄',
    })

    expect(status).toBe(403)
    expect(body.error).toBe('context_denied')
    expect(body.accessToken).toBeUndefined()
  })

  it('participantId 없이 부르면 고를 수 있는 목록만 돌려준다', async () => {
    const db = seed()

    const { status, body } = await call(db, { selectTicket: await selectTicket(1) })

    expect(status).toBe(200)
    expect(body.choices?.length).toBe(2)
    expect(body.accessToken).toBeUndefined()
  })
})

describe('세션 판이 오르면 두 입구가 함께 닫힌다', () => {
  it('옛 판의 선택 티켓으로는 세션이 나오지 않는다(초기화·연락처 수정 이후)', async () => {
    const db = seed()
    const ticket = await selectTicket(1)
    bumpSessionVersion(db)

    const { status, body } = await call(db, { selectTicket: ticket, participantId: 'pp-1' })

    expect(status).toBe(401)
    expect(body.error).toBe('session_expired')
    expect(body.accessToken).toBeUndefined()
    // 발급의 부작용도 없다 — 명부는 열린 그대로다.
    expect(db.tables.program_participants[0].login_status).toBe('INVITED')
    expect(db.tables.guest_invitations[0].used_at).toBeNull()
  })

  it('판 클레임이 없는 옛 티켓도 거절된다', async () => {
    const db = seed()

    const { status } = await call(db, {
      selectTicket: await selectTicket(null),
      participantId: 'pp-1',
    })

    expect(status).toBe(401)
  })

  it('옛 판의 세션 토큰으로 맥락을 갈아탈 수 없다', async () => {
    const db = seed()
    const token = await sessionToken(1)
    expect((await call(db, { participantId: 'pp-1' }, token)).status).toBe(200)

    bumpSessionVersion(db)

    const { status, body } = await call(db, { participantId: 'pp-2' }, token)
    expect(status).toBe(401)
    expect(body.error).toBe('session_expired')
  })

  it('세션 검증과 계정 재조회 사이에 판이 오르면 새 세션을 주지 않는다', async () => {
    const db = seed()
    const token = await sessionToken(1)
    // users를 두 번 읽는다: 공용 세션 검증(1) → 계정 재조회(2). 그 사이에 ADMIN 초기화가
    // 들어오면, 재조회 값만 보고 발급하는 구현은 **옛 토큰을 새 판의 세션으로 승격**시킨다.
    db.beforeQuery('users', (nth) => {
      if (nth === 2) bumpSessionVersion(db)
    })

    const { status, body } = await call(db, { participantId: 'pp-1' }, token)

    expect(status).toBe(401)
    expect(body.error).toBe('session_expired')
    expect(body.accessToken).toBeUndefined()
    expect(db.tables.program_participants[0].login_status).toBe('INVITED')
  })

  it('정지된 계정의 티켓은 판이 같아도 통하지 않는다', async () => {
    const db = seed()
    const ticket = await selectTicket(1)
    db.tables.users[0].is_active = false

    expect((await call(db, { selectTicket: ticket, participantId: 'pp-1' })).status).toBe(401)
  })
})

describe('요청 경계', () => {
  it('다른 용도의 티켓(비밀번호 설정)으로는 맥락을 고를 수 없다', async () => {
    const db = seed()
    const nowSec = Math.floor(Date.now() / 1000)
    const wrongAud = await signJwt(
      { sub: USER_ID, aud: 'guest-password-change', sv: 1, iat: nowSec, exp: nowSec + 600 },
      SECRET,
    )

    expect((await call(db, { selectTicket: wrongAud, participantId: 'pp-1' })).status).toBe(401)
  })

  it('티켓도 세션도 없으면 401', async () => {
    expect((await call(seed(), {})).status).toBe(401)
  })

  it('POST가 아니면 405', async () => {
    const db = seed()
    const res = await createContextHandler(() => db.client)(
      new Request('https://fn.test/guest-auth-context', { method: 'GET' }),
    )
    expect(res.status).toBe(405)
  })

  it('서명 키가 없으면 500으로 멈춘다', async () => {
    const db = seed()
    const ticket = await selectTicket(1)
    delete env.GUEST_JWT_SECRET

    const { status, body } = await call(db, { selectTicket: ticket, participantId: 'pp-1' })
    expect(status).toBe(500)
    expect(body.error).toBe('jwt_secret_missing')
  })
})
