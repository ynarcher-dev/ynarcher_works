import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { signJwt, verifyJwt } from '../_shared/crypto.ts'
import { fakeDb, type Row } from '../_shared/fakeSupabase.ts'
import { hashPassword } from '../_shared/password.ts'
import { createLoginHandler } from './handler.ts'
import { createPasswordHandler } from '../guest-auth-password/handler.ts'

/**
 * 게스트 로그인·비밀번호 설정 회귀 테스트.
 *
 * 두 함수를 한 파일에서 보는 이유는 정책이 둘에 걸쳐 하나이기 때문이다 — 초기 비밀번호로는
 * 설정 티켓만 나오고, 개인 비밀번호를 정한 뒤에야 세션이 열리며, 그 뒤로는 연락처가 통하지
 * 않는다. 가짜는 DB 클라이언트 하나뿐이고 판정·해시·서명은 실제 구현이 돈다.
 *
 * 근거: docs/docs_planning/3_9_1_guest_unified_account.md §6 / §6.1 (2026-09-12 사용자 확정)
 */

const SECRET = 'test-guest-jwt-secret'
const USER_ID = '11111111-1111-4111-8111-111111111111'
const EMAIL = 'kim@example.com'
const LEDGER_PHONE = '010-1234-5678'
const PERSONAL_PW = 'newPass2026'

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

/** 기본 원장 — 참여 1건(사업), 자격증명 없음(= 초기 상태). */
function seed(over: { credentials?: Row[]; participants?: Row[] } = {}) {
  return fakeDb({
    users: [
      {
        id: USER_ID,
        user_type: 'external_startup',
        name: '김참여',
        email: EMAIL,
        phone: LEDGER_PHONE,
        company_id: null,
        session_version: 1,
        is_active: true,
        deleted_at: null,
      },
    ],
    guest_credentials: over.credentials ?? [],
    guest_identities: [{ user_id: USER_ID, master_table: 'startups', master_id: 'st-1' }],
    startups: [{ id: 'st-1', contact: { phone: LEDGER_PHONE } }],
    program_participants: over.participants ?? [participant('pp-1', 'startups', 'st-1')],
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
      { participant_id: 'pp-1', used_at: null, app_user_id: null, name: '김참여' },
    ],
  })
}

const env: Record<string, string | undefined> = {}
const g = globalThis as unknown as {
  Deno?: { env: { get(key: string): string | undefined } }
}

beforeEach(() => {
  for (const k of Object.keys(env)) delete env[k]
  env.GUEST_JWT_SECRET = SECRET
  env.SUPABASE_URL = 'http://localhost:54321'
  g.Deno = { env: { get: (key: string) => env[key] } }
})

afterEach(() => {
  delete g.Deno
})

const post = (path: string, body: unknown) =>
  new Request(`https://fn.test/${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

interface Landing {
  accessToken?: string
  mustChangePassword?: boolean
  changeTicket?: string
  selectTicket?: string
  choices?: { participantId: string }[]
  accessible?: boolean
  error?: string
  message?: string
  user?: unknown
}

type Db = ReturnType<typeof seed>

async function login(db: Db, password: string, email = EMAIL) {
  const res = await createLoginHandler(() => db.client)(
    post('guest-auth-login', { email, password }),
  )
  return { status: res.status, body: (await res.json()) as Landing }
}

async function setPassword(db: Db, changeTicket: string, newPassword: string) {
  const res = await createPasswordHandler(() => db.client)(
    post('guest-auth-password', { changeTicket, newPassword }),
  )
  return { status: res.status, body: (await res.json()) as Landing }
}

/** 계정의 지금 판으로 서명한 세션 JWT(issueSession과 같은 클레임). */
async function sessionToken(db: Db) {
  const nowSec = Math.floor(Date.now() / 1000)
  return await signJwt(
    {
      sub: USER_ID,
      aud: 'authenticated',
      role: 'authenticated',
      app_user_id: USER_ID,
      app_role: 'external_startup',
      session_version: (db.tables.users[0].session_version as number) ?? 1,
      context_type: 'program',
      context_id: 'pg-1',
      iat: nowSec,
      exp: nowSec + 3600,
    },
    SECRET,
  )
}

/** [변경 모드] 로그인한 게스트가 마이페이지에서 바꾼다. */
async function changePassword(
  db: Db,
  token: string,
  currentPassword: string,
  newPassword: string,
) {
  const res = await createPasswordHandler(() => db.client)(
    new Request('https://fn.test/guest-auth-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ currentPassword, newPassword }),
    }),
  )
  return { status: res.status, body: (await res.json()) as Landing }
}

/** 저장된 해시. 행이 insert 기본값으로만 선 상태(칸 없음)와 null을 같게 읽는다. */
function storedHash(db: Db): string | null {
  return (db.tables.guest_credentials[0]?.password_hash as string | null | undefined) ?? null
}

/** 세션이 정말로 발급되지 않았는가 — 토큰뿐 아니라 발급의 부작용까지 없어야 한다. */
function expectNoSession(db: Db, body: Landing) {
  expect(body.accessToken).toBeUndefined()
  // issueSession은 명부를 ACTIVE로 올리고 초대 행을 소진한다. 그 흔적이 없어야 한다.
  for (const row of db.tables.program_participants) expect(row.login_status).toBe('INVITED')
  expect(db.tables.guest_invitations[0].used_at).toBeNull()
}

const cred = (over: Row = {}): Row => ({
  user_id: USER_ID,
  password_hash: null,
  login_attempts: 0,
  locked_until: null,
  ...over,
})

/** 개인 비밀번호를 이미 정한 계정. */
async function settled(over: { participants?: Row[] } = {}) {
  return seed({
    credentials: [cred({ password_hash: await hashPassword(PERSONAL_PW) })],
    participants: over.participants,
  })
}

describe('초기 비밀번호(계정 생성 때 확정한 전화번호) — 세션이 아니라 설정 티켓만 준다', () => {
  it('연락처가 맞으면 mustChangePassword + 티켓이고, 세션은 열리지 않는다', async () => {
    const db = seed()
    const { status, body } = await login(db, LEDGER_PHONE)

    expect(status).toBe(200)
    expect(body.mustChangePassword).toBe(true)
    expect(typeof body.changeTicket).toBe('string')
    expect(body.user).toBeUndefined()
    expect(body.choices).toBeUndefined()
    expectNoSession(db, body)
  })

  it('하이픈·공백 표기는 흡수하고, 숫자가 다르면 거절한다', async () => {
    expect((await login(seed(), '01012345678')).body.mustChangePassword).toBe(true)
    expect((await login(seed(), ' 010 1234 5678 ')).body.mustChangePassword).toBe(true)

    const wrong = await login(seed(), '01099998888')
    expect(wrong.status).toBe(401)
    expect(wrong.body.error).toBe('auth_failed')
  })

  it('숫자가 없는 값이나 빈 자리는 초기 비밀번호로 통하지 않는다', async () => {
    expect((await login(seed(), '---')).status).toBe(401)
    const empty = await login(seed(), '')
    expect(empty.status).toBe(400)
    expect(empty.body.error).toBe('invalid_request')
  })

  it('원장 연락처를 고쳐도 계정 생성 때 확정한 초기 비밀번호는 바뀌지 않는다', async () => {
    const db = seed()
    db.tables.startups[0].contact = { phone: '010-7777-0000' }

    expect((await login(db, LEDGER_PHONE)).body.mustChangePassword).toBe(true)
    expect((await login(db, '010-7777-0000')).status).toBe(401)
  })

  it('설정 티켓에는 데이터 접근 권한이 없다 — aud가 다르고 세션 클레임이 없다', async () => {
    const ticket = (await login(seed(), LEDGER_PHONE)).body.changeTicket as string

    const asTicket = await verifyJwt(ticket, SECRET, 'guest-password-change')
    expect(asTicket?.sub).toBe(USER_ID)
    // 세션 토큰으로는 통하지 않는다(PostgREST가 요구하는 aud = authenticated).
    expect(await verifyJwt(ticket, SECRET, 'authenticated')).toBeNull()
    expect(asTicket?.app_user_id).toBeUndefined()
    expect(asTicket?.role).toBeUndefined()
    expect(asTicket?.context_id).toBeUndefined()
    // 10분짜리 단명 토큰이다.
    expect((asTicket?.exp as number) - (asTicket?.iat as number)).toBe(600)
  })

  it('모르는 이메일과 틀린 비밀번호는 같은 응답이다(계정 열거 차단)', async () => {
    const unknown = await login(seed(), LEDGER_PHONE, 'nobody@example.com')
    const wrongPw = await login(seed(), '01000000000')

    expect(unknown.status).toBe(wrongPw.status)
    expect(unknown.body).toEqual(wrongPw.body)
  })
})

describe('개인 비밀번호를 정한 뒤 — 연락처는 더 이상 통하지 않는다 (§2 파생 결함)', () => {
  it('해시가 있으면 초기 전화번호 로그인은 거절된다', async () => {
    const db = await settled()

    const res = await login(db, LEDGER_PHONE)

    expect(res.status).toBe(401)
    expect(res.body.mustChangePassword).toBeUndefined()
    expectNoSession(db, res.body)
  })

  it('새 사업이 추가돼도(참여 2건) 연락처는 통하지 않는다', async () => {
    const db = await settled({
      participants: [participant('pp-1', 'startups', 'st-1'), participant('pp-2', 'networks', 'nw-1')],
    })

    expect((await login(db, LEDGER_PHONE)).status).toBe(401)
  })

  it('개인 비밀번호는 통하고, 참여가 1건이면 그 자리에서 세션이 열린다', async () => {
    const db = await settled()

    const { status, body } = await login(db, PERSONAL_PW)

    expect(status).toBe(200)
    expect(typeof body.accessToken).toBe('string')
    const claims = await verifyJwt(body.accessToken as string, SECRET, 'authenticated')
    expect(claims?.app_user_id).toBe(USER_ID)
    expect(claims?.context_type).toBe('program')
    expect(claims?.context_id).toBe('pg-1')
    // 실제로 들어온 순간이 명부에 남는다.
    expect(db.tables.program_participants[0].login_status).toBe('ACTIVE')
    expect(db.tables.guest_invitations[0].used_at).not.toBeNull()
  })

  it('참여가 2건 이상이면 선택 티켓만 주고 세션은 열지 않는다', async () => {
    const db = await settled({
      participants: [participant('pp-1', 'startups', 'st-1'), participant('pp-2', 'networks', 'nw-1')],
    })

    const { body } = await login(db, PERSONAL_PW)

    expect(body.choices?.length).toBe(2)
    expect(
      await verifyJwt(body.selectTicket as string, SECRET, 'guest-context-select'),
    ).not.toBeNull()
    expectNoSession(db, body)
  })

  it('열린 참여가 없으면 본인은 맞다고 답하되 세션을 열지 않는다', async () => {
    const db = await settled({ participants: [] })

    const { status, body } = await login(db, PERSONAL_PW)

    expect(status).toBe(200)
    expect(body.accessible).toBe(false)
    expect(body.accessToken).toBeUndefined()
  })

  it('접근 기간이 지난 사업은 목록에서 빠진다(문을 닫은 것과 같은 결과)', async () => {
    const db = await settled()
    db.tables.programs[0].guest_access_ends_at = '2020-01-01T00:00:00Z'

    expect((await login(db, PERSONAL_PW)).body.accessible).toBe(false)
  })
})

describe('잠금 — 계정 단위로 5회 15분', () => {
  it('연속 5회 실패면 잠기고, 그 뒤에는 올바른 비밀번호도 막힌다', async () => {
    const db = await settled()

    for (let i = 0; i < 4; i += 1) {
      expect((await login(db, 'wrongPass1')).status).toBe(401)
      expect(db.tables.guest_credentials[0].login_attempts).toBe(i + 1)
    }
    // 5번째 실패가 잠금을 건다.
    expect((await login(db, 'wrongPass1')).status).toBe(401)
    expect(db.tables.guest_credentials[0].locked_until).toBeTruthy()

    const locked = await login(db, PERSONAL_PW)
    expect(locked.status).toBe(429)
    expect(locked.body.error).toBe('locked')
    expectNoSession(db, locked.body)
  })

  it('잠금은 비밀번호를 정하기 전 계정에도 걸린다(초기 상태의 연락처 추측)', async () => {
    const db = seed()

    for (let i = 0; i < 5; i += 1) expect((await login(db, `0100000000${i}`)).status).toBe(401)

    const locked = await login(db, LEDGER_PHONE)
    expect(locked.status).toBe(429)
    expect(locked.body.changeTicket).toBeUndefined()
  })

  it('잠금 시각이 지나면 다시 받아 주고, 성공은 실패 카운터를 지운다', async () => {
    const db = seed({
      credentials: [
        cred({
          password_hash: await hashPassword(PERSONAL_PW),
          login_attempts: 3,
          locked_until: new Date(Date.now() - 60_000).toISOString(),
        }),
      ],
    })

    expect((await login(db, PERSONAL_PW)).status).toBe(200)
    expect(db.tables.guest_credentials[0].login_attempts).toBe(0)
    expect(db.tables.guest_credentials[0].locked_until).toBeNull()
  })
})

describe('비밀번호 설정 — 저장이 끝난 뒤에만 세션이 열린다', () => {
  it('티켓 + 정책 통과면 해시가 저장되고 그 다음에 세션이 나온다', async () => {
    const db = seed()
    const ticket = (await login(db, LEDGER_PHONE)).body.changeTicket as string

    const { status, body } = await setPassword(db, ticket, PERSONAL_PW)

    expect(status).toBe(200)
    expect(storedHash(db)).toMatch(/^pbkdf2\$sha256\$/)
    expect(typeof body.accessToken).toBe('string')
    // 저장이 세션보다 먼저다 — 쓰기 순서로 확인한다(초대 행 소진은 issueSession의 일이다).
    const savedAt = db.writes.findIndex(
      (w) => w.table === 'guest_credentials' && 'password_hash' in (w.patch ?? {}),
    )
    const sessionAt = db.writes.findIndex((w) => w.table === 'guest_invitations')
    expect(savedAt).toBeGreaterThanOrEqual(0)
    expect(sessionAt).toBeGreaterThan(savedAt)
  })

  it('저장이 실패하면 500이고 세션은 열리지 않는다', async () => {
    const db = seed()
    const ticket = (await login(db, LEDGER_PHONE)).body.changeTicket as string
    // 저장은 조건부 쓰기 RPC 한 곳에서만 일어난다 — 그 호출이 실패하는 자리다.
    db.failRpc('guest_password_commit')

    const { status, body } = await setPassword(db, ticket, PERSONAL_PW)

    expect(status).toBe(500)
    expect(body.error).toBe('save_failed')
    expectNoSession(db, body)
  })

  it('설정 후 같은 티켓을 다시 쓰면 거절된다(해시가 이미 있다)', async () => {
    const db = seed()
    const ticket = (await login(db, LEDGER_PHONE)).body.changeTicket as string
    expect((await setPassword(db, ticket, PERSONAL_PW)).status).toBe(200)

    const again = await setPassword(db, ticket, 'anotherPass77')

    expect(again.status).toBe(401)
    expect(again.body.error).toBe('ticket_expired')
    // 두 번째 값은 저장되지 않았다 — 처음 정한 비밀번호가 그대로 통한다.
    expect((await login(db, PERSONAL_PW)).status).toBe(200)
  })

  it('만료된 티켓은 거절된다', async () => {
    const db = seed()
    const nowSec = Math.floor(Date.now() / 1000)
    const stale = await signJwt(
      {
        sub: USER_ID,
        aud: 'guest-password-change',
        rst: false,
        iat: nowSec - 1200,
        exp: nowSec - 60,
      },
      SECRET,
    )

    const res = await setPassword(db, stale, PERSONAL_PW)

    expect(res.status).toBe(401)
    expect(res.body.error).toBe('ticket_expired')
    expect(db.tables.guest_credentials.length).toBe(0)
  })

  it('다른 용도의 티켓(맥락 선택)으로는 비밀번호를 정할 수 없다', async () => {
    const db = seed()
    const nowSec = Math.floor(Date.now() / 1000)
    const wrongAud = await signJwt(
      { sub: USER_ID, aud: 'guest-context-select', iat: nowSec, exp: nowSec + 600 },
      SECRET,
    )

    const res = await setPassword(db, wrongAud, 'yetAnother99')

    expect(res.status).toBe(401)
    expect(res.body.error).toBe('ticket_expired')
    expect(db.tables.guest_credentials.length).toBe(0)
  })

  it('다른 시크릿으로 서명된 티켓은 거절된다', async () => {
    const db = seed()
    const nowSec = Math.floor(Date.now() / 1000)
    const forged = await signJwt(
      { sub: USER_ID, aud: 'guest-password-change', iat: nowSec, exp: nowSec + 600 },
      'attacker-secret',
    )

    expect((await setPassword(db, forged, PERSONAL_PW)).status).toBe(401)
  })

  it('정지된 계정의 티켓은 살아 있어도 통하지 않는다', async () => {
    const db = seed()
    const ticket = (await login(db, LEDGER_PHONE)).body.changeTicket as string
    db.tables.users[0].is_active = false

    const res = await setPassword(db, ticket, PERSONAL_PW)

    expect(res.status).toBe(401)
    expect(res.body.error).toBe('ticket_expired')
  })

  it('정책 위반은 저장도 세션도 없이 400이다 — 연락처를 그대로 쓰는 것도 막는다', async () => {
    const db = seed()
    const ticket = (await login(db, LEDGER_PHONE)).body.changeTicket as string

    const short = await setPassword(db, ticket, 'ab12')
    expect(short.status).toBe(400)
    expect(short.body.error).toBe('weak_password')

    const samePhone = await setPassword(db, ticket, LEDGER_PHONE.replace(/\D/g, ''))
    expect(samePhone.status).toBe(400)

    const lettersOnly = await setPassword(db, ticket, 'abcdefghij')
    expect(lettersOnly.status).toBe(400)

    expect(storedHash(db)).toBeNull()
    expectNoSession(db, short.body)
  })

  it('재설정 티켓(rst)은 이미 비밀번호가 있어도 통한다 — 그 경로는 덮어쓰러 온다', async () => {
    const db = await settled()
    const nowSec = Math.floor(Date.now() / 1000)
    const resetTicket = await signJwt(
      {
        sub: USER_ID,
        aud: 'guest-password-change',
        rst: true,
        // 티켓은 발급 시점의 세션 판을 싣는다(2026-09-13) — 판이 없거나 어긋나면 거절된다.
        sv: 1,
        iat: nowSec,
        exp: nowSec + 600,
      },
      SECRET,
    )

    const { status, body } = await setPassword(db, resetTicket, 'resetPass88')

    expect(status).toBe(200)
    expect(typeof body.accessToken).toBe('string')
    // 옛 비밀번호는 더 이상 통하지 않는다.
    expect((await login(await settled(), PERSONAL_PW)).status).toBe(200)
    expect((await login(db, PERSONAL_PW)).status).toBe(401)
    expect((await login(db, 'resetPass88')).status).toBe(200)
  })

  it('설정 뒤 갈 곳이 없으면 비밀번호는 저장되고 안내만 돌려준다', async () => {
    const db = seed({ participants: [] })
    const ticket = (await login(db, LEDGER_PHONE)).body.changeTicket as string

    const { status, body } = await setPassword(db, ticket, PERSONAL_PW)

    expect(status).toBe(200)
    expect(body.accessible).toBe(false)
    expect(body.accessToken).toBeUndefined()
    expect(storedHash(db)).toMatch(/^pbkdf2\$/)
  })
})

/**
 * ADMIN 창구(admin_reset_guest_password·admin_update_guest_contact)가 DB에서 하는 일을
 * 가짜 원장에 그대로 적용한다 — 해시·설정시각·재설정 토큰·잠금을 비우고 세션 판을 올린다.
 * Edge 쪽 관심사는 "그 뒤에 무엇이 통하고 무엇이 죽는가"이므로 인가는 DB 테스트가 본다
 * (supabase/tests/guest_admin_contact_reset_test.sql).
 */
function applyAdminReset(db: Db) {
  const cred = db.tables.guest_credentials[0]
  if (cred) {
    Object.assign(cred, {
      password_hash: null,
      password_set_at: null,
      login_attempts: 0,
      locked_until: null,
      reset_token_hash: null,
      reset_expires_at: null,
    })
  }
  bumpSessionVersion(db)
}

/** 세션 판을 올린다(연락처 수정·초기화·접근 차단이 DB에서 하는 일). */
function bumpSessionVersion(db: Db) {
  const user = db.tables.users[0]
  user.session_version = ((user.session_version as number) ?? 1) + 1
}

describe('단명 티켓은 계정의 세션 판에 묶인다 — 옛 티켓은 초기화를 되돌리지 못한다', () => {
  it('설정 티켓에 발급 시점의 판이 실린다', async () => {
    const db = seed()
    const ticket = (await login(db, LEDGER_PHONE)).body.changeTicket as string

    const claims = await verifyJwt(ticket, SECRET, 'guest-password-change')
    expect(claims?.sv).toBe(1)
  })

  it('선택 티켓에도 같은 판이 실린다', async () => {
    const db = await settled({
      participants: [
        participant('pp-1', 'startups', 'st-1'),
        participant('pp-2', 'networks', 'nw-1'),
      ],
    })

    const ticket = (await login(db, PERSONAL_PW)).body.selectTicket as string

    expect((await verifyJwt(ticket, SECRET, 'guest-context-select'))?.sv).toBe(1)
  })

  it('티켓이 나간 뒤 판이 오르면(연락처 수정) 그 티켓으로 비밀번호를 세울 수 없다', async () => {
    const db = seed()
    const ticket = (await login(db, LEDGER_PHONE)).body.changeTicket as string

    bumpSessionVersion(db) // ADMIN이 이메일·연락처를 고쳤다
    const res = await setPassword(db, ticket, PERSONAL_PW)

    expect(res.status).toBe(401)
    expect(res.body.error).toBe('ticket_expired')
    expect(storedHash(db)).toBeNull()
    expectNoSession(db, res.body)
  })

  it('초기화 직전에 나간 재설정 티켓(rst)도 죽는다 — 옛 링크가 계정을 되찾지 못한다', async () => {
    const db = await settled()
    const nowSec = Math.floor(Date.now() / 1000)
    const oldReset = await signJwt(
      {
        sub: USER_ID,
        aud: 'guest-password-change',
        rst: true,
        sv: 1,
        iat: nowSec,
        exp: nowSec + 600,
      },
      SECRET,
    )

    applyAdminReset(db)
    const res = await setPassword(db, oldReset, 'attackerPass1')

    expect(res.status).toBe(401)
    expect(res.body.error).toBe('ticket_expired')
    expect(storedHash(db)).toBeNull()
    // 공격자가 정한 값으로는 들어올 수 없다. 초기화된 계정이 연 문은 연락처 하나뿐이다.
    expect((await login(db, 'attackerPass1')).status).toBe(401)
    expect((await login(db, LEDGER_PHONE)).body.mustChangePassword).toBe(true)
  })

  it('판 클레임이 없는 옛 티켓은 거절된다', async () => {
    const db = seed()
    const nowSec = Math.floor(Date.now() / 1000)
    const noVersion = await signJwt(
      { sub: USER_ID, aud: 'guest-password-change', rst: false, iat: nowSec, exp: nowSec + 600 },
      SECRET,
    )

    const res = await setPassword(db, noVersion, PERSONAL_PW)

    expect(res.status).toBe(401)
    expect(res.body.error).toBe('ticket_expired')
    expect(storedHash(db)).toBeNull()
  })
})

describe('ADMIN 초기화 이후 — 현재 연락처로 들어오고, 정하기 전에는 세션이 없다', () => {
  it('옛 개인 비밀번호는 죽고 연락처가 설정 티켓만 받는다', async () => {
    const db = await settled()
    expect((await login(db, PERSONAL_PW)).status).toBe(200)

    applyAdminReset(db)

    expect((await login(db, PERSONAL_PW)).status).toBe(401)
    const reopened = await login(db, LEDGER_PHONE)
    expect(reopened.body.mustChangePassword).toBe(true)
    // 초기화 전의 로그인이 이미 명부를 ACTIVE로 올려 두었으므로, 여기서 보는 것은
    // "이번 요청이 세션을 주지 않았다"는 사실이다.
    expect(reopened.body.accessToken).toBeUndefined()
    expect(reopened.body.choices).toBeUndefined()
  })

  it('새 티켓은 오른 판으로 나오고, 정한 뒤에야 세션이 열린다', async () => {
    const db = await settled()
    applyAdminReset(db)

    const ticket = (await login(db, LEDGER_PHONE)).body.changeTicket as string
    expect((await verifyJwt(ticket, SECRET, 'guest-password-change'))?.sv).toBe(2)

    const { status, body } = await setPassword(db, ticket, 'afterReset2026')
    expect(status).toBe(200)
    expect(typeof body.accessToken).toBe('string')
    // 설정이 성공하면 그 티켓은 소진된다(판 2 → 3). 세션은 **커밋이 돌려준 판**을 싣는다 —
    // 옛 판을 싣고 나가면 그 토큰은 RLS 헬퍼가 첫 질의에서 거절한다.
    expect((await verifyJwt(body.accessToken as string, SECRET, 'authenticated'))?.session_version)
      .toBe(3)
    expect(db.tables.users[0].session_version).toBe(3)
    expect((await setPassword(db, ticket, 'againAgain77')).status).toBe(401)
  })

  it('초기화가 잠금을 풀어 준다 — 잠긴 계정도 연락처로 다시 시작한다', async () => {
    const db = seed({
      credentials: [
        cred({
          password_hash: await hashPassword(PERSONAL_PW),
          locked_until: new Date(Date.now() + 600_000).toISOString(),
        }),
      ],
    })
    expect((await login(db, PERSONAL_PW)).status).toBe(429)

    applyAdminReset(db)

    expect((await login(db, LEDGER_PHONE)).body.mustChangePassword).toBe(true)
  })
})

describe('조건부 쓰기 — 읽은 뒤에 바뀐 자리에는 얹히지 않는다 (TOCTOU)', () => {
  it('해시를 만드는 동안 ADMIN이 초기화하면 옛 티켓의 값은 저장되지 않는다', async () => {
    const db = seed()
    const ticket = (await login(db, LEDGER_PHONE)).body.changeTicket as string

    // 핸들러가 계정·자격증명을 읽은 뒤, 커밋이 판정되기 직전에 초기화가 들어온다.
    db.beforeRpc('guest_password_commit', () => applyAdminReset(db))

    const res = await setPassword(db, ticket, PERSONAL_PW)

    expect(res.status).toBe(401)
    expect(res.body.error).toBe('ticket_expired')
    // 초기화가 비운 자리가 그대로 비어 있다 — 옛 티켓이 되돌리지 못했다.
    expect(storedHash(db)).toBeNull()
    expectNoSession(db, res.body)
  })

  it('재설정 티켓이 저장을 가는 동안 초기화가 들어와도 덮어쓰지 못한다', async () => {
    const db = await settled()
    const nowSec = Math.floor(Date.now() / 1000)
    const resetTicket = await signJwt(
      { sub: USER_ID, aud: 'guest-password-change', rst: true, sv: 1, iat: nowSec, exp: nowSec + 600 },
      SECRET,
    )
    db.beforeRpc('guest_password_commit', () => applyAdminReset(db))

    const res = await setPassword(db, resetTicket, 'attackerPass1')

    expect(res.status).toBe(401)
    expect(storedHash(db)).toBeNull()
    expect((await login(db, 'attackerPass1')).status).toBe(401)
  })

  it('다른 창이 먼저 비밀번호를 바꿨으면 409로 답한다(만료와 구분한다)', async () => {
    const db = await settled()
    const token = await sessionToken(db)
    // 현재 비밀번호 확인까지 끝난 뒤, 커밋 직전에 다른 창의 저장이 먼저 들어온다.
    db.beforeRpc('guest_password_commit', () => {
      db.tables.guest_credentials[0].password_hash = 'pbkdf2$sha256$1$b3RoZXI=$b3RoZXI='
    })

    const res = await changePassword(db, token, PERSONAL_PW, 'myNewPass99')

    expect(res.status).toBe(409)
    expect(res.body.error).toBe('password_conflict')
    // 먼저 들어온 값이 남는다 — 뒤에 온 요청이 조용히 덮어쓰지 않는다.
    expect(storedHash(db)).toBe('pbkdf2$sha256$1$b3RoZXI=$b3RoZXI=')
  })

  it('로그인 상태의 변경은 성공해도 판을 올리지 않는다(본인 세션이 끊기지 않는다)', async () => {
    const db = await settled()
    const token = await sessionToken(db)

    const res = await changePassword(db, token, PERSONAL_PW, 'myNewPass99')

    expect(res.status).toBe(200)
    expect(db.tables.users[0].session_version).toBe(1)
    expect((await login(db, 'myNewPass99')).status).toBe(200)
    expect((await login(db, PERSONAL_PW)).status).toBe(401)
  })

  it('세션 검증 뒤 판이 오르면 변경은 만료로 끝난다 — 옛 자격이 승격되지 않는다', async () => {
    const db = await settled()
    const token = await sessionToken(db)
    const before = storedHash(db)
    // users를 두 번 읽는다: 세션 검증(1) → 계정 재조회(2). 그 사이에 ADMIN이 연락처를
    // 고쳐 판이 오른다(비밀번호는 그대로이므로 현재 비밀번호 확인은 통과한다 — 막는 것은
    // 오직 판 대조다). 재조회 값을 기대 판으로 쓰면 여기서 옛 토큰이 새 판으로 승격된다.
    db.beforeQuery('users', (nth) => {
      if (nth === 2) bumpSessionVersion(db)
    })

    const res = await changePassword(db, token, PERSONAL_PW, 'myNewPass99')

    expect(res.status).toBe(401)
    expect(res.body.error).toBe('session_expired')
    // 새 값은 저장되지 않았다 — 끊긴 세션이 비밀번호를 바꿔 계정을 가져가지 못한다.
    expect(storedHash(db)).toBe(before)
    expect((await login(db, 'myNewPass99')).status).toBe(401)
  })

  it('커밋이 실패하면 실패 카운터도 지워지지 않는다', async () => {
    const db = seed({
      credentials: [cred({ password_hash: await hashPassword(PERSONAL_PW), login_attempts: 3 })],
    })
    const token = await sessionToken(db)
    db.failRpc('guest_password_commit')

    expect((await changePassword(db, token, PERSONAL_PW, 'myNewPass99')).status).toBe(500)
    expect(db.tables.guest_credentials[0].login_attempts).toBe(3)
  })
})

describe('요청 경계', () => {
  it('POST가 아니면 405', async () => {
    const db = seed()
    const res = await createLoginHandler(() => db.client)(
      new Request('https://fn.test/guest-auth-login', { method: 'GET' }),
    )
    expect(res.status).toBe(405)
  })

  it('서명 키가 없으면 티켓을 주지 않고 500으로 멈춘다', async () => {
    const db = seed()
    delete env.GUEST_JWT_SECRET

    const { status, body } = await login(db, LEDGER_PHONE)

    expect(status).toBe(500)
    expect(body.error).toBe('jwt_secret_missing')
    expect(body.changeTicket).toBeUndefined()
  })

  it('본문이 JSON이 아니면 아무것도 열지 않고 500으로 끝난다', async () => {
    const db = seed()
    const res = await createLoginHandler(() => db.client)(
      new Request('https://fn.test/guest-auth-login', { method: 'POST', body: 'not-json' }),
    )
    expect(res.status).toBe(500)
    expect(db.writes.length).toBe(0)
  })
})
