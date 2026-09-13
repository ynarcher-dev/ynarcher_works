import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { guestAuth } from '@/auth/guestAuthService'
import { GUEST_STORAGE_KEY, useGuestStore } from '@/auth/guestStore'

/**
 * 게스트 인증 서비스 회귀 테스트 — 네 갈래 착지마다 **무엇이 저장되는가**를 본다.
 *
 * 데이터 경계는 서버·RLS가 지고, 이 층이 답하는 것은 화면의 상태다. "비밀번호를 먼저 정하라"는
 * 응답에서 세션을 만들어 저장하면 화면은 로그인한 것처럼 굴고 사용자는 자기 상태를 오해한다
 * (3_9_1 §6). 가짜는 경계 둘뿐이며(`fetch`·`localStorage`) 서비스와 스토어는 실제 구현이 돈다.
 *
 * 근거: docs/docs_planning/3_9_1_guest_unified_account.md §6 / §7
 */

const FUNCTIONS_BASE = 'http://localhost:54321/functions/v1'

/** base64url 페이로드를 가진 JWT 흉내(서명은 검증하지 않는 층이다 — 만료만 읽는다). */
function jwt(expMs: number): string {
  const part = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url')
  return [
    part({ alg: 'HS256', typ: 'JWT' }),
    part({ sub: 'u-1', exp: Math.floor(expMs / 1000) }),
    'sig',
  ].join('.')
}

const LIVE_TOKEN = jwt(Date.now() + 60 * 60 * 1000)
const DEAD_TOKEN = jwt(Date.now() - 60 * 1000)

const SESSION_BODY = {
  accessToken: LIVE_TOKEN,
  user: { id: 'u-1', name: '김참여', user_type: 'external_startup' },
  context: {
    participant_id: 'pp-1',
    program_id: 'pg-1',
    entity_key: 'program',
    code: 'AC-2026',
    title: '2026 액셀러레이팅',
    persona: 'startups',
  },
}

/** 메모리 저장소. 브라우저 저장소는 node 환경에 없다. */
function memoryStorage() {
  const map = new Map<string, string>()
  return {
    store: map,
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
    clear: () => map.clear(),
    key: (i: number) => [...map.keys()][i] ?? null,
    get length() {
      return map.size
    },
  }
}

let storage: ReturnType<typeof memoryStorage>
let fetchMock: ReturnType<typeof vi.fn>

const g = globalThis as unknown as { localStorage: Storage; fetch: typeof fetch }
let realFetch: typeof fetch

/** 다음 응답 하나를 세운다. */
function reply(body: unknown, init: { status?: number } = {}) {
  const status = init.status ?? 200
  fetchMock.mockResolvedValueOnce(
    new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }),
  )
}

/** 마지막 호출의 (url, init). */
function lastCall(): { url: string; init: RequestInit } {
  const [url, init] = fetchMock.mock.calls[fetchMock.mock.calls.length - 1] as [string, RequestInit]
  return { url, init }
}

function headersOf(init: RequestInit): Record<string, string> {
  return (init.headers ?? {}) as Record<string, string>
}

beforeEach(() => {
  storage = memoryStorage()
  g.localStorage = storage as unknown as Storage
  realFetch = g.fetch
  fetchMock = vi.fn()
  g.fetch = fetchMock as unknown as typeof fetch
  useGuestStore.setState({
    status: 'loading',
    user: null,
    program: null,
    contexts: [],
    accessToken: null,
  })
})

afterEach(() => {
  g.fetch = realFetch
  vi.restoreAllMocks()
})

/** 저장소와 스토어 둘 다에 세션이 없는가. 한쪽만 보면 새로고침 뒤 되살아나는 세션을 놓친다. */
function expectNoSession() {
  const s = useGuestStore.getState()
  expect(s.accessToken).toBeNull()
  expect(s.user).toBeNull()
  expect(s.status).not.toBe('authenticated')
  expect(storage.getItem(GUEST_STORAGE_KEY)).toBeNull()
}

describe('로그인 착지 — 비밀번호 설정 티켓은 세션이 아니다', () => {
  it('mustChangePassword 응답은 티켓만 돌려주고 아무것도 저장하지 않는다', async () => {
    reply({ mustChangePassword: true, changeTicket: 'ticket-abc', expiresInSec: 600 })

    const result = await guestAuth.login({ email: 'kim@example.com', password: '01012345678' })

    expect(result).toEqual({ kind: 'password', changeTicket: 'ticket-abc' })
    expectNoSession()
  })

  it('서버가 티켓과 함께 토큰을 실어 보내도 그것으로 세션을 열지 않는다', async () => {
    // 있어서는 안 되는 응답이지만, 그때 화면이 로그인 상태가 되는 것이 이 검사가 막는 사고다.
    reply({ ...SESSION_BODY, mustChangePassword: true, changeTicket: 'ticket-abc' })

    const result = await guestAuth.login({ email: 'kim@example.com', password: '01012345678' })

    expect(result.kind).toBe('password')
    expectNoSession()
  })

  it('갈 곳이 하나면 세션이 열리고 저장소에 남는다', async () => {
    reply(SESSION_BODY)

    const result = await guestAuth.login({ email: 'kim@example.com', password: 'newPass2026' })

    expect(result).toEqual({ kind: 'session' })
    const s = useGuestStore.getState()
    expect(s.status).toBe('authenticated')
    expect(s.accessToken).toBe(LIVE_TOKEN)
    expect(s.user).toEqual({ id: 'u-1', name: '김참여', role: 'external_startup' })
    expect(s.program).toEqual({
      id: 'pg-1',
      title: '2026 액셀러레이팅',
      code: 'AC-2026',
      entityKey: 'program',
      participantId: 'pp-1',
      persona: 'startups',
    })
    expect(JSON.parse(storage.getItem(GUEST_STORAGE_KEY) as string)).toEqual({
      accessToken: LIVE_TOKEN,
      user: { id: 'u-1', name: '김참여', role: 'external_startup' },
      program: s.program,
    })
  })

  it('갈 곳이 둘 이상이면 선택 티켓만 받고 세션은 열리지 않는다', async () => {
    const choices = [
      { participantId: 'pp-1', programId: 'pg-1', entityKey: 'program', code: null, title: 'A' },
      { participantId: 'pp-2', programId: 'pg-2', entityKey: 'fund', code: null, title: 'B' },
    ]
    reply({ selectTicket: 'select-abc', choices })

    const result = await guestAuth.login({ email: 'kim@example.com', password: 'newPass2026' })

    expect(result).toEqual({ kind: 'choose', selectTicket: 'select-abc', choices })
    expectNoSession()
  })

  it('갈 곳이 없으면 서버 문구를 그대로 전하고 세션은 열지 않는다', async () => {
    reply({ accessible: false, message: '현재 접근 가능한 곳이 없습니다.' })

    const result = await guestAuth.login({ email: 'kim@example.com', password: 'newPass2026' })

    expect(result).toEqual({ kind: 'none', message: '현재 접근 가능한 곳이 없습니다.' })
    expectNoSession()
  })

  it('200이어도 토큰·사용자가 없으면 실패로 던지고 아무것도 저장하지 않는다', async () => {
    reply({ user: { id: 'u-1', name: '김참여', user_type: 'external_startup' } })

    await expect(guestAuth.login({ email: 'kim@example.com', password: 'x' })).rejects.toThrow(
      '로그인에 실패했습니다.',
    )
    expectNoSession()
  })

  it('실패 응답은 서버 문구를 그대로 던진다(사유를 가리는 한 문장)', async () => {
    reply({ error: 'auth_failed', message: '이메일 또는 비밀번호가 일치하지 않습니다.' }, { status: 401 })

    await expect(guestAuth.login({ email: 'kim@example.com', password: 'nope' })).rejects.toThrow(
      '이메일 또는 비밀번호가 일치하지 않습니다.',
    )
    expectNoSession()
  })

  it('잠금(429)도 같은 경로로 문구를 전한다', async () => {
    reply({ error: 'locked', message: '로그인 시도가 많아 잠시 잠겼습니다.' }, { status: 429 })

    await expect(guestAuth.login({ email: 'kim@example.com', password: 'nope' })).rejects.toThrow(
      '로그인 시도가 많아 잠시 잠겼습니다.',
    )
    expectNoSession()
  })
})

describe('요청 경계 — 나가는 곳과 실리는 것', () => {
  it('로그인은 guest-auth-login 하나만 부르고, 세션 헤더를 달지 않는다', async () => {
    reply({ mustChangePassword: true, changeTicket: 't' })

    await guestAuth.login({ email: 'kim@example.com', password: '01012345678' })

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const { url, init } = lastCall()
    expect(url).toBe(`${FUNCTIONS_BASE}/guest-auth-login`)
    expect(init.method).toBe('POST')
    expect(headersOf(init).apikey).toBe('test-anon-key')
    expect(headersOf(init).Authorization).toBeUndefined()
    expect(JSON.parse(init.body as string)).toEqual({
      email: 'kim@example.com',
      password: '01012345678',
    })
  })

  it('비밀번호 설정은 티켓을 본문으로 보낸다 — 세션 토큰 자리에 싣지 않는다', async () => {
    reply(SESSION_BODY)

    await guestAuth.setPassword('ticket-abc', 'newPass2026')

    const { url, init } = lastCall()
    expect(url).toBe(`${FUNCTIONS_BASE}/guest-auth-password`)
    expect(headersOf(init).Authorization).toBeUndefined()
    expect(JSON.parse(init.body as string)).toEqual({
      changeTicket: 'ticket-abc',
      newPassword: 'newPass2026',
    })
  })
})

describe('비밀번호 설정 이후의 착지', () => {
  it('설정이 성공하면 로그인과 같은 규칙으로 세션이 열린다', async () => {
    reply(SESSION_BODY)

    const result = await guestAuth.setPassword('ticket-abc', 'newPass2026')

    expect(result).toEqual({ kind: 'session' })
    expect(useGuestStore.getState().status).toBe('authenticated')
  })

  it('설정 뒤 갈 곳이 없으면 세션 없이 안내만 받는다', async () => {
    reply({ accessible: false, message: '비밀번호가 설정되었습니다. 다만 접근 가능한 프로젝트/FUND가 없습니다.' })

    const result = await guestAuth.setPassword('ticket-abc', 'newPass2026')

    expect(result.kind).toBe('none')
    expectNoSession()
  })

  it('티켓이 만료·재사용이면 서버 문구를 던지고 세션은 열리지 않는다', async () => {
    reply(
      { error: 'ticket_expired', message: '비밀번호 설정 시간이 지났습니다.' },
      { status: 401 },
    )

    await expect(guestAuth.setPassword('ticket-abc', 'newPass2026')).rejects.toThrow(
      '비밀번호 설정 시간이 지났습니다.',
    )
    expectNoSession()
  })

  it('약한 비밀번호(400)도 같은 자리에서 막힌다', async () => {
    reply({ error: 'weak_password', message: '영문과 숫자를 모두 포함해야 합니다.' }, { status: 400 })

    await expect(guestAuth.setPassword('ticket-abc', '1234')).rejects.toThrow(
      '영문과 숫자를 모두 포함해야 합니다.',
    )
    expectNoSession()
  })
})

describe('맥락 진입 — 선택 티켓과 살아 있는 세션', () => {
  it('선택 티켓으로 들어갈 때는 세션 헤더를 달지 않는다', async () => {
    reply(SESSION_BODY)

    await guestAuth.enterContext('pp-1', 'select-abc')

    const { url, init } = lastCall()
    expect(url).toBe(`${FUNCTIONS_BASE}/guest-auth-context`)
    expect(headersOf(init).Authorization).toBeUndefined()
    expect(JSON.parse(init.body as string)).toEqual({
      selectTicket: 'select-abc',
      participantId: 'pp-1',
    })
    expect(useGuestStore.getState().status).toBe('authenticated')
  })

  it('세션이 있으면 그 토큰으로 갈아탄다', async () => {
    useGuestStore.getState().setSession(LIVE_TOKEN, { id: 'u-1', name: '김참여', role: 'external_startup' }, null)
    const next = jwt(Date.now() + 60 * 60 * 1000)
    reply({ ...SESSION_BODY, accessToken: next })

    await guestAuth.enterContext('pp-2')

    const { init } = lastCall()
    expect(headersOf(init).Authorization).toBe(`Bearer ${LIVE_TOKEN}`)
    expect(JSON.parse(init.body as string)).toEqual({ participantId: 'pp-2' })
    expect(useGuestStore.getState().accessToken).toBe(next)
  })

  it('거절되면 지금 세션을 그대로 두고 던진다 — 갈아타기 실패가 로그아웃이 되지 않는다', async () => {
    useGuestStore.getState().setSession(LIVE_TOKEN, { id: 'u-1', name: '김참여', role: 'external_startup' }, null)
    reply({ message: '그곳으로 들어갈 수 없습니다.' }, { status: 403 })

    await expect(guestAuth.enterContext('pp-9')).rejects.toThrow('그곳으로 들어갈 수 없습니다.')

    expect(useGuestStore.getState().accessToken).toBe(LIVE_TOKEN)
    expect(useGuestStore.getState().status).toBe('authenticated')
  })
})

describe('세션 갱신 — 닫힌 접근은 그 자리에서 로그아웃', () => {
  it('토큰이 없으면 부르지 않고 null이다', async () => {
    expect(await guestAuth.refreshSession()).toBeNull()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('401이면 저장된 세션까지 지운다', async () => {
    useGuestStore.getState().setSession(LIVE_TOKEN, { id: 'u-1', name: '김참여', role: 'external_startup' }, null)
    reply({ message: 'session_expired' }, { status: 401 })

    expect(await guestAuth.refreshSession()).toBeNull()

    expect(useGuestStore.getState().status).toBe('unauthenticated')
    expectNoSession()
  })

  it('원장의 현재 이름·맥락 목록을 되받아 세션을 갈아 끼운다(목록은 저장하지 않는다)', async () => {
    useGuestStore.getState().setSession(LIVE_TOKEN, { id: 'u-1', name: '옛이름', role: 'external_startup' }, null)
    const contexts = [
      { participantId: 'pp-1', programId: 'pg-1', entityKey: 'program', code: null, title: 'A' },
    ]
    reply({
      user: { id: 'u-1', name: '새이름', user_type: 'external_startup', email: null },
      program: {
        id: 'pg-1',
        title: '2026 액셀러레이팅',
        code: 'AC-2026',
        status: null,
        start_date: null,
        end_date: null,
        entity_key: 'program',
      },
      participation: { persona: 'startups', joined_at: null },
      company: null,
      currentParticipantId: 'pp-1',
      contexts,
    })

    const me = await guestAuth.refreshSession()

    expect(me?.user.name).toBe('새이름')
    const s = useGuestStore.getState()
    expect(s.user?.name).toBe('새이름')
    expect(s.program?.entityKey).toBe('program')
    expect(s.contexts).toEqual(contexts)
    // 목록은 담당자가 문을 닫으면 즉시 바뀌는 값이라 저장소에 남기지 않는다.
    const saved = JSON.parse(storage.getItem(GUEST_STORAGE_KEY) as string)
    expect(saved.contexts).toBeUndefined()
    // 갱신은 세션 헤더로 나간다.
    expect(headersOf(lastCall().init).Authorization).toBe(`Bearer ${LIVE_TOKEN}`)
  })

  it('401이 아닌 실패는 세션을 지우지 않고 던진다', async () => {
    useGuestStore.getState().setSession(LIVE_TOKEN, { id: 'u-1', name: '김참여', role: 'external_startup' }, null)
    reply({ message: '세션 정보를 불러오지 못했습니다.' }, { status: 500 })

    await expect(guestAuth.refreshSession()).rejects.toThrow('세션 정보를 불러오지 못했습니다.')
    expect(useGuestStore.getState().accessToken).toBe(LIVE_TOKEN)
  })
})

describe('세션 복원과 종료', () => {
  it('저장된 것이 없으면 미인증으로 확정한다(로딩에 머무르지 않는다)', () => {
    guestAuth.restore()
    expect(useGuestStore.getState().status).toBe('unauthenticated')
  })

  it('살아 있는 토큰은 복원한다', () => {
    storage.setItem(
      GUEST_STORAGE_KEY,
      JSON.stringify({
        accessToken: LIVE_TOKEN,
        user: { id: 'u-1', name: '김참여', role: 'external_startup' },
        program: { id: 'pg-1', title: 'A', code: null },
      }),
    )

    guestAuth.restore()

    const s = useGuestStore.getState()
    expect(s.status).toBe('authenticated')
    expect(s.accessToken).toBe(LIVE_TOKEN)
    expect(s.program?.id).toBe('pg-1')
  })

  it('만료된 토큰은 복원하지 않고 저장소에서 지운다', () => {
    storage.setItem(
      GUEST_STORAGE_KEY,
      JSON.stringify({
        accessToken: DEAD_TOKEN,
        user: { id: 'u-1', name: '김참여', role: 'external_startup' },
        program: null,
      }),
    )

    guestAuth.restore()

    expect(useGuestStore.getState().status).toBe('unauthenticated')
    expectNoSession()
  })

  it('망가진 값도 미인증으로 떨어뜨린다(읽을 수 없는 것을 세션으로 믿지 않는다)', () => {
    storage.setItem(GUEST_STORAGE_KEY, '{ not json')

    guestAuth.restore()

    expectNoSession()
  })

  it('만료 시각을 읽을 수 없는 토큰은 만료로 본다', () => {
    storage.setItem(
      GUEST_STORAGE_KEY,
      JSON.stringify({ accessToken: 'not-a-jwt', user: { id: 'u-1', name: 'x', role: 'y' } }),
    )

    guestAuth.restore()

    expectNoSession()
  })

  it('로그아웃은 스토어와 저장소를 함께 비운다', () => {
    useGuestStore.getState().setSession(LIVE_TOKEN, { id: 'u-1', name: '김참여', role: 'external_startup' }, null)
    useGuestStore.getState().setContexts([
      { participantId: 'pp-1', programId: 'pg-1', entityKey: 'program', code: null, title: 'A' },
    ])

    guestAuth.signOut()

    expectNoSession()
    expect(useGuestStore.getState().contexts).toEqual([])
    expect(useGuestStore.getState().status).toBe('unauthenticated')
  })
})

describe('비밀번호 변경(로그인 상태)과 재설정 링크', () => {
  it('세션이 없으면 부르지도 않는다', async () => {
    await expect(guestAuth.changePassword('old1234a', 'newPass2026')).rejects.toThrow(
      '로그인이 필요합니다.',
    )
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('현재 비밀번호를 함께 보내고 세션 헤더를 단다', async () => {
    useGuestStore.getState().setSession(LIVE_TOKEN, { id: 'u-1', name: '김참여', role: 'external_startup' }, null)
    reply({ ok: true })

    await guestAuth.changePassword('old1234a', 'newPass2026')

    const { url, init } = lastCall()
    expect(url).toBe(`${FUNCTIONS_BASE}/guest-auth-password`)
    expect(headersOf(init).Authorization).toBe(`Bearer ${LIVE_TOKEN}`)
    expect(JSON.parse(init.body as string)).toEqual({
      currentPassword: 'old1234a',
      newPassword: 'newPass2026',
    })
    // 변경은 세션을 건드리지 않는다.
    expect(useGuestStore.getState().accessToken).toBe(LIVE_TOKEN)
  })

  it('재설정 링크는 설정 티켓으로 바뀌고, 그 자체로 세션이 되지 않는다', async () => {
    reply({ changeTicket: 'ticket-from-link', name: '김참여' })

    const res = await guestAuth.consumeResetLink('raw-reset-token')

    expect(res).toEqual({ changeTicket: 'ticket-from-link', name: '김참여' })
    expectNoSession()
  })

  it('이미 쓴 링크는 거절된다', async () => {
    reply({ message: '링크가 만료되었거나 이미 사용되었습니다.' }, { status: 401 })

    await expect(guestAuth.consumeResetLink('raw-reset-token')).rejects.toThrow(
      '링크가 만료되었거나 이미 사용되었습니다.',
    )
    expectNoSession()
  })

  it('200인데 티켓이 없으면 실패로 본다', async () => {
    reply({ name: '김참여' })

    await expect(guestAuth.consumeResetLink('raw-reset-token')).rejects.toThrow(
      '링크가 만료되었거나 이미 사용되었습니다.',
    )
  })
})
