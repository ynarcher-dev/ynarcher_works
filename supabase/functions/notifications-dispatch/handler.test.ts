import { readFileSync } from 'node:fs'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { handleNotificationsDispatch } from './handler.ts'

/**
 * 닫힌 알림 발송 창구의 회귀 테스트(SEC-1, docs/SECURITY_REVIEW.md F-1).
 *
 * 고정하는 것은 상수가 아니라 성질 넷입니다 — 거절이 요청과 무관할 것, 요청 내용을 되비추지
 * 않을 것, 발송·특권·바깥 요청 부작용이 없을 것, 콘솔에 남기지 않을 것.
 */

// 발송기·특권 클라이언트는 **호출 여부를 기록하는 대역**으로 바꾼다. 예외를 던지게 두면
// 나중에 핸들러가 try/catch로 감쌌을 때 "던지지 않았다"가 "부르지 않았다"로 잘못 읽힌다.
const spies = vi.hoisted(() => ({
  sendNotification: vi.fn(),
  supabaseAdmin: vi.fn(),
}))
vi.mock('../_shared/notifications.ts', () => ({
  sendNotification: spies.sendNotification,
  TEMPLATES: {},
}))
vi.mock('../_shared/supabaseAdmin.ts', () => ({ supabaseAdmin: spies.supabaseAdmin }))

const URL_ = 'https://project.functions.supabase.co/notifications-dispatch'

/** 모양만 갖춘 토큰. 서명 검증을 하지 않는다는 사실을 드러내려고 형태를 맞춘다. */
function jwtLike(payload: Record<string, unknown>): string {
  const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url')
  return `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64(payload)}.c2lnbmF0dXJlLXBsYWNlaG9sZGVy`
}

const EMPLOYEE_JWT = jwtLike({ sub: 'auth-user-1', role: 'authenticated', aud: 'authenticated' })
const GUEST_JWT = jwtLike({ sub: 'guest-1', role: 'authenticated', app_user_id: 'guest-1', session_version: 1 })
const SERVICE_ROLE_JWT = jwtLike({ role: 'service_role', iss: 'supabase' })

/** 종전 결함을 그대로 노린 본문 — 임의 수신처 + 링크를 호출자가 정하는 재설정 문안. */
const ATTACK_TO = 'attacker@evil.example'
const ATTACK_LINK = 'https://evil.example/reset?token=stolen-reset-token'
const ATTACK_BODY = JSON.stringify({
  channel: 'EMAIL',
  to: ATTACK_TO,
  templateCode: 'GUEST_PASSWORD_RESET',
  variables: { name: '피해자', link: ATTACK_LINK, minutes: '30' },
})

const MUST_NOT_LEAK = [ATTACK_TO, ATTACK_LINK, 'stolen-reset-token', 'GUEST_PASSWORD_RESET', EMPLOYEE_JWT, GUEST_JWT, SERVICE_ROLE_JWT]

interface Case {
  label: string
  headers?: Record<string, string>
  body?: string
}

/** 인증 유형 × 본문 유형. 모두 같은 답을 받아야 한다. */
const POST_CASES: Case[] = [
  { label: 'Authorization 없음', body: ATTACK_BODY },
  { label: '임직원 토큰(유효 형태)', headers: { Authorization: `Bearer ${EMPLOYEE_JWT}` }, body: ATTACK_BODY },
  { label: '게스트 커스텀 토큰', headers: { Authorization: `Bearer ${GUEST_JWT}` }, body: ATTACK_BODY },
  { label: 'service_role 형태 토큰', headers: { Authorization: `Bearer ${SERVICE_ROLE_JWT}` }, body: ATTACK_BODY },
  { label: 'apikey 헤더만', headers: { apikey: SERVICE_ROLE_JWT }, body: ATTACK_BODY },
  { label: 'Bearer 접두만 있고 값 없음', headers: { Authorization: 'Bearer ' }, body: ATTACK_BODY },
  { label: 'Bearer가 아닌 스킴', headers: { Authorization: `Basic ${EMPLOYEE_JWT}` }, body: ATTACK_BODY },
  { label: '깨진 토큰(점 없음)', headers: { Authorization: 'Bearer not-a-jwt' }, body: ATTACK_BODY },
  { label: '본문 없음', headers: { Authorization: `Bearer ${EMPLOYEE_JWT}` } },
  { label: '본문이 JSON이 아님', headers: { Authorization: `Bearer ${EMPLOYEE_JWT}` }, body: '<<not json>>' },
  { label: '빈 객체', headers: { Authorization: `Bearer ${EMPLOYEE_JWT}` }, body: '{}' },
  { label: '알 수 없는 채널·템플릿', body: JSON.stringify({ channel: 'CARRIER_PIGEON', to: ATTACK_TO, templateCode: 'NOPE' }) },
]

function post(c: Case): Request {
  return new Request(URL_, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(c.headers ?? {}) },
    body: c.body,
  })
}

async function shape(res: Response) {
  return { status: res.status, contentType: res.headers.get('Content-Type'), text: await res.text() }
}

let fetchSpy: ReturnType<typeof vi.fn>

beforeEach(() => {
  spies.sendNotification.mockClear()
  spies.supabaseAdmin.mockClear()
  fetchSpy = vi.fn()
  vi.stubGlobal('fetch', fetchSpy)
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.spyOn(console, 'info').mockImplementation(() => {})
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('거절은 요청과 무관하다', () => {
  it.each(POST_CASES.map((c) => [c.label, c] as const))('%s → 403 endpoint_disabled', async (_label, c) => {
    const res = handleNotificationsDispatch(post(c))
    expect(res.status).toBe(403)
    expect(await res.json()).toMatchObject({ error: 'endpoint_disabled' })
  })

  it('모든 POST 요청이 바이트까지 같은 응답을 받는다 — 응답 차이가 정보가 되지 않는다', async () => {
    const shapes = []
    for (const c of POST_CASES) shapes.push(await shape(handleNotificationsDispatch(post(c))))
    for (let i = 1; i < shapes.length; i += 1) {
      expect(shapes[i], `${POST_CASES[i].label}이 다른 답을 돌려줍니다`).toEqual(shapes[0])
    }
  })
})

describe('요청 내용을 되비추지 않는다', () => {
  it.each(MUST_NOT_LEAK)('응답 본문에 %s 가 없다', async (secret) => {
    for (const c of POST_CASES) {
      expect(await handleNotificationsDispatch(post(c)).text()).not.toContain(secret)
    }
  })
})

describe('메서드', () => {
  it.each(['GET', 'PUT', 'PATCH', 'DELETE', 'HEAD'])('%s → 405', async (method) => {
    const res = handleNotificationsDispatch(new Request(URL_, { method }))
    expect(res.status).toBe(405)
    expect(await res.json()).toMatchObject({ error: 'method_not_allowed' })
  })
})

describe('발송·특권·바깥 요청 부작용이 없다', () => {
  it('어떤 요청에도 발송기·service_role 클라이언트·fetch가 호출되지 않는다', () => {
    // 호출 기록으로 판정하므로, 나중에 핸들러가 예외를 삼키더라도 이 단언은 여전히 깨진다.
    for (const c of POST_CASES) handleNotificationsDispatch(post(c))
    for (const method of ['GET', 'PUT', 'DELETE']) handleNotificationsDispatch(new Request(URL_, { method }))
    expect(spies.sendNotification).not.toHaveBeenCalled()
    expect(spies.supabaseAdmin).not.toHaveBeenCalled()
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('두 파일 어디에서도 특권 클라이언트를 직접 만들지 않는다', () => {
    // 대역은 위 두 모듈을 거치는 호출만 잡는다. 그 모듈을 건너뛰고 직접 만드는 경우를 위한 보완.
    for (const file of ['./handler.ts', './index.ts']) {
      const code = readFileSync(new URL(file, import.meta.url), 'utf8')
        .split(/\r?\n/)
        .filter((l) => !l.trimStart().startsWith('//'))
        .join('\n')
      expect(code, `${file}`).not.toContain('createClient')
      expect(code, `${file}`).not.toContain('SERVICE_ROLE')
    }
  })
})

describe('로그를 남기지 않는다', () => {
  it('수신처·토큰이 콘솔로 새지 않는다', () => {
    for (const c of POST_CASES) handleNotificationsDispatch(post(c))
    for (const fn of [console.log, console.warn, console.error, console.info]) {
      expect(fn).not.toHaveBeenCalled()
    }
  })
})
