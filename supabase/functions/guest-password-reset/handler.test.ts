import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { sha256Hex, verifyJwt } from '../_shared/crypto.ts'
import { fakeDb, type Row } from '../_shared/fakeSupabase.ts'
import { createResetHandler, type ResetHandlerDeps } from './handler.ts'

/**
 * 재설정 링크 발급·소진 회귀 테스트.
 *
 * 보는 것은 두 창 사이의 경합이다 — 계정을 읽은 뒤 토큰을 저장하기까지, 그리고 토큰을
 * 찾은 뒤 비우기까지. 그 사이에 ADMIN의 연락처 수정·초기화가 끼면 **옛 스냅샷의 링크가
 * 옛 주소로 나가거나, 이미 끊긴 계정의 링크가 설정 티켓으로 바뀌는** 일이 생겼다.
 * 발송기는 주입된 대역이므로 이 테스트는 바깥으로 나가지 않는다.
 *
 * 근거: docs/docs_planning/3_9_1_guest_unified_account.md §6.2.3
 */

const SECRET = 'test-guest-jwt-secret'
const USER_ID = '33333333-3333-4333-8333-333333333333'
const EMAIL = 'choi@example.com'
const PHONE = '010-3333-4444'

function seed(over: { credentials?: Row[] } = {}) {
  return fakeDb({
    users: [
      {
        id: USER_ID,
        user_type: 'external_expert',
        name: '최전문가',
        email: EMAIL,
        phone: PHONE,
        company_id: null,
        session_version: 4,
        is_active: true,
        deleted_at: null,
      },
    ],
    guest_credentials: over.credentials ?? [
      {
        user_id: USER_ID,
        password_hash: 'pbkdf2$sha256$1$c2FsdA==$b2xk',
        login_attempts: 2,
        locked_until: null,
        reset_token_hash: null,
        reset_expires_at: null,
        reset_session_version: null,
      },
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
  env.GUEST_APP_BASE_URL = 'https://guest.test'
  g.Deno = { env: { get: (key: string) => env[key] } }
})

afterEach(() => {
  delete g.Deno
})

/** 발송기 대역 — 부른 인자를 모아 둔다(밖으로 나가지 않는다). */
function recorder(ok = true) {
  const calls: { to: string; channel: string; variables: Record<string, string> }[] = []
  const notify: ResetHandlerDeps['notify'] = (input) => {
    calls.push({
      to: input.to,
      channel: input.channel,
      variables: (input.variables ?? {}) as Record<string, string>,
    })
    return Promise.resolve({ ok } as Awaited<ReturnType<ResetHandlerDeps['notify']>>)
  }
  return { notify, calls }
}

/** 인가 RPC만 답하는 호출자 클라이언트 대역. */
function callerClient(error: { code?: string; message: string } | null) {
  return () => ({ rpc: () => Promise.resolve({ error }) }) as never
}

interface Body {
  ok?: boolean
  notified?: boolean
  reason?: string
  error?: string
  changeTicket?: string
  name?: string
  expiresInSec?: number
}

async function send(
  db: Db,
  opts: {
    notify?: ResetHandlerDeps['notify']
    authError?: { code?: string; message: string } | null
    authorization?: string | null
  } = {},
) {
  const handler = createResetHandler({
    admin: () => db.client,
    caller: callerClient(opts.authError ?? null),
    notify: opts.notify ?? recorder().notify,
  })
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  const auth = opts.authorization === undefined ? 'Bearer internal-token' : opts.authorization
  if (auth) headers.Authorization = auth
  const res = await handler(
    new Request('https://fn.test/guest-password-reset', {
      method: 'POST',
      headers,
      body: JSON.stringify({ userId: USER_ID }),
    }),
  )
  return { status: res.status, body: (await res.json()) as Body }
}

async function consume(db: Db, resetToken: string) {
  const handler = createResetHandler({
    admin: () => db.client,
    caller: callerClient(null),
    notify: recorder().notify,
  })
  const res = await handler(
    new Request('https://fn.test/guest-password-reset', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ resetToken }),
    }),
  )
  return { status: res.status, body: (await res.json()) as Body }
}

function credOf(db: Db): Row {
  return db.tables.guest_credentials[0]
}

/** 안내 링크에서 원문 토큰만 꺼낸다(발송기 대역이 받은 값). */
function tokenFromLink(link: string): string {
  return new URL(link).searchParams.get('token') ?? ''
}

function bumpSessionVersion(db: Db) {
  const user = db.tables.users[0]
  user.session_version = ((user.session_version as number) ?? 1) + 1
}

/** ADMIN 연락처 수정이 DB에서 하는 일 — 판을 올리고 살아 있는 링크를 비운다. */
function applyContactEdit(db: Db, email: string) {
  db.tables.users[0].email = email
  bumpSessionVersion(db)
  Object.assign(credOf(db), { reset_token_hash: null, reset_expires_at: null, reset_session_version: null })
}

describe('발송 — 저장은 계정을 읽은 그 판에 묶인다', () => {
  it('인가가 거절되면 토큰도 안내도 없다', async () => {
    const db = seed()
    const notifier = recorder()

    const { status, body } = await send(db, {
      notify: notifier.notify,
      authError: { code: '42501', message: '내부 사용자만 재설정 안내를 보낼 수 있습니다.' },
    })

    expect(status).toBe(403)
    expect(body.error).toBe('forbidden')
    expect(credOf(db).reset_token_hash).toBeNull()
    expect(notifier.calls.length).toBe(0)
  })

  it('토큰 없이 오면 401이고 원장을 건드리지 않는다', async () => {
    const db = seed()

    const { status, body } = await send(db, { authorization: null })

    expect(status).toBe(401)
    expect(body.error).toBe('unauthorized')
    expect(db.writes.length).toBe(0)
  })

  it('해시와 발급 시점 판을 함께 적고, 링크는 원장의 주소로만 나간다', async () => {
    const db = seed()
    const notifier = recorder()

    const { status, body } = await send(db, { notify: notifier.notify })

    expect(status).toBe(200)
    expect(body).toEqual({ ok: true, notified: true })
    // 응답에는 토큰도 링크도 없다.
    expect(JSON.stringify(body)).not.toContain('token')

    expect(notifier.calls.length).toBe(1)
    expect(notifier.calls[0].to).toBe(EMAIL)
    expect(notifier.calls[0].channel).toBe('EMAIL')

    // 저장된 것은 해시뿐이고, 그 판은 계정의 지금 판이다.
    const raw = tokenFromLink(notifier.calls[0].variables.link)
    expect(raw).toHaveLength(64)
    expect(credOf(db).reset_token_hash).toBe(await sha256Hex(raw))
    expect(credOf(db).reset_session_version).toBe(4)
    // 비밀번호는 그대로, 실패 카운터는 초기화된다.
    expect(credOf(db).password_hash).toBe('pbkdf2$sha256$1$c2FsdA==$b2xk')
    expect(credOf(db).login_attempts).toBe(0)
  })

  it('이메일이 비어 있으면 전화번호로 안내한다', async () => {
    const db = seed()
    db.tables.users[0].email = ''
    const notifier = recorder()

    const { status, body } = await send(db, { notify: notifier.notify })

    expect(status).toBe(200)
    expect(body).toEqual({ ok: true, notified: true })
    expect(notifier.calls[0]).toMatchObject({ to: PHONE, channel: 'ALIMTALK' })
    expect(credOf(db).reset_token_hash).not.toBeNull()
  })

  it('수신처가 없으면 사용할 수 없는 토큰을 만들지 않는다', async () => {
    const db = seed()
    db.tables.users[0].email = null
    db.tables.users[0].phone = null
    const notifier = recorder()

    const { status, body } = await send(db, { notify: notifier.notify })

    expect(status).toBe(200)
    expect(body).toEqual({ ok: false, notified: false, reason: 'no_contact' })
    expect(db.writes.length).toBe(0)
    expect(credOf(db).reset_token_hash).toBeNull()
    expect(notifier.calls.length).toBe(0)
  })

  it('읽은 뒤 연락처가 바뀌면 저장도 발송도 하지 않는다 — 옛 주소로 링크가 나가지 않는다', async () => {
    const db = seed()
    const notifier = recorder()
    // 계정(주소 스냅샷)을 읽은 뒤, 저장이 판정되기 직전에 ADMIN이 이메일을 고친다.
    db.beforeRpc('guest_reset_token_issue', () => applyContactEdit(db, 'moved@example.com'))

    const { status, body } = await send(db, { notify: notifier.notify })

    expect(status).toBe(400)
    expect(body.error).toBe('reset_failed')
    expect(credOf(db).reset_token_hash).toBeNull()
    expect(notifier.calls.length).toBe(0)
  })

  it('정지된 계정에는 토큰을 적지 않는다', async () => {
    const db = seed()
    const notifier = recorder()
    db.beforeRpc('guest_reset_token_issue', () => {
      db.tables.users[0].is_active = false
    })

    expect((await send(db, { notify: notifier.notify })).status).toBe(400)
    expect(credOf(db).reset_token_hash).toBeNull()
    expect(notifier.calls.length).toBe(0)
  })

  it('저장 자체가 실패하면 500이고 안내는 나가지 않는다', async () => {
    const db = seed()
    const notifier = recorder()
    db.failRpc('guest_reset_token_issue')

    expect((await send(db, { notify: notifier.notify })).status).toBe(500)
    expect(notifier.calls.length).toBe(0)
  })

  it('발송이 실패해도 토큰은 남고 그 사실을 그대로 알린다', async () => {
    const db = seed()
    const notifier = recorder(false)

    const { status, body } = await send(db, { notify: notifier.notify })

    expect(status).toBe(200)
    expect(body).toEqual({ ok: true, notified: false })
    expect(credOf(db).reset_token_hash).not.toBeNull()
  })
})

describe('소진 — 정확히 한 번, 그리고 검증한 판으로만 티켓을 만든다', () => {
  /** 발송을 거쳐 살아 있는 링크 하나를 만든다. */
  async function withLiveLink() {
    const db = seed()
    const notifier = recorder()
    await send(db, { notify: notifier.notify })
    return { db, raw: tokenFromLink(notifier.calls[0].variables.link) }
  }

  it('유효한 링크는 rst 티켓이 되고 토큰은 그 자리에서 비워진다', async () => {
    const { db, raw } = await withLiveLink()

    const { status, body } = await consume(db, raw)

    expect(status).toBe(200)
    expect(body.name).toBe('최전문가')
    const claims = await verifyJwt(body.changeTicket as string, SECRET, 'guest-password-change')
    expect(claims?.sub).toBe(USER_ID)
    expect(claims?.rst).toBe(true)
    // 티켓의 판은 소진이 검증한 값이다(설정 단계가 이 값으로 대조한다).
    expect(claims?.sv).toBe(4)
    expect(credOf(db).reset_token_hash).toBeNull()
    expect(credOf(db).reset_session_version).toBeNull()
    // 비밀번호는 비우지 않는다 — 계정이 개시 상태로 돌아가지 않아야 한다.
    expect(credOf(db).password_hash).toBe('pbkdf2$sha256$1$c2FsdA==$b2xk')
  })

  it('같은 링크를 다시 쓰면 거절된다(한 번만 소진된다)', async () => {
    const { db, raw } = await withLiveLink()
    expect((await consume(db, raw)).status).toBe(200)

    const again = await consume(db, raw)

    expect(again.status).toBe(401)
    expect(again.body.error).toBe('reset_invalid')
    expect(again.body.changeTicket).toBeUndefined()
  })

  it('모르는 토큰과 만료된 토큰은 같은 응답이다', async () => {
    const { db, raw } = await withLiveLink()
    credOf(db).reset_expires_at = new Date(Date.now() - 60_000).toISOString()

    const expired = await consume(db, raw)
    const unknown = await consume(seed(), 'deadbeef')

    expect(expired.status).toBe(401)
    expect(expired.body).toEqual(unknown.body)
  })

  it('소진 직전에 ADMIN이 초기화하면 그 링크는 티켓이 되지 못한다', async () => {
    const { db, raw } = await withLiveLink()
    // 판만 올린다(초기화·차단). 토큰 행은 그대로 남아 있어도 발급 시점 판과 어긋난다.
    db.beforeRpc('guest_reset_token_consume', () => bumpSessionVersion(db))

    const { status, body } = await consume(db, raw)

    expect(status).toBe(401)
    expect(body.changeTicket).toBeUndefined()
    // 어긋난 토큰은 비워지지 않지만 다시 통할 수도 없다(판은 되돌아가지 않는다).
    expect(credOf(db).reset_token_hash).not.toBeNull()
    expect((await consume(db, raw)).status).toBe(401)
  })

  it('정지된 계정의 링크는 통하지 않는다', async () => {
    const { db, raw } = await withLiveLink()
    db.tables.users[0].is_active = false

    expect((await consume(db, raw)).status).toBe(401)
    expect(credOf(db).reset_token_hash).not.toBeNull()
  })

  it('티켓의 판은 소진이 돌려준 값이다 — 계정을 다시 읽어 올리지 않는다', async () => {
    const { db, raw } = await withLiveLink()
    // 소진 뒤에 계정을 한 번이라도 다시 읽으면 판이 오른다. 그 값이 티켓에 실리면
    // 옛 링크가 새 자격으로 승격되므로, 읽지 않았다는 것까지 여기서 고정한다.
    db.beforeQuery('users', () => bumpSessionVersion(db))

    const { status, body } = await consume(db, raw)

    expect(status).toBe(200)
    expect((await verifyJwt(body.changeTicket as string, SECRET, 'guest-password-change'))?.sv)
      .toBe(4)
    expect(db.tables.users[0].session_version).toBe(4)
  })

  it('서명 키가 없으면 티켓을 주지 않고 500으로 멈춘다', async () => {
    const { db, raw } = await withLiveLink()
    delete env.GUEST_JWT_SECRET

    const { status, body } = await consume(db, raw)

    expect(status).toBe(500)
    expect(body.error).toBe('jwt_secret_missing')
    expect(body.changeTicket).toBeUndefined()
  })
})

describe('요청 경계', () => {
  it('POST가 아니면 405', async () => {
    const handler = createResetHandler({
      admin: () => seed().client,
      caller: callerClient(null),
      notify: recorder().notify,
    })
    const res = await handler(
      new Request('https://fn.test/guest-password-reset', { method: 'GET' }),
    )
    expect(res.status).toBe(405)
  })

  it('userId도 resetToken도 없으면 400이고 아무것도 쓰지 않는다', async () => {
    const db = seed()
    const handler = createResetHandler({
      admin: () => db.client,
      caller: callerClient(null),
      notify: recorder().notify,
    })
    const res = await handler(
      new Request('https://fn.test/guest-password-reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      }),
    )

    expect(res.status).toBe(400)
    expect((await res.json()).error).toBe('invalid_request')
    expect(db.writes.length).toBe(0)
  })
})
