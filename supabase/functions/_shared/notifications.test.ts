import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TEMPLATES, sendNotification, type Channel } from './notifications.ts'

/**
 * 알림 디스패처 회귀 테스트 — 성공을 돌려주는 경로가 **로컬 로그 폴백 하나뿐**임을 못박는다.
 * 한 통도 나가지 않은 발송이 성공으로 집계되면 담당자는 안내가 갔다고 믿는다.
 *
 * 근거: docs/SECURITY_REVIEW.md SEC-2 / P1-4.3
 */

const CHANNEL_KEY: Record<Channel, string> = {
  ALIMTALK: 'KAKAO_ALIMTALK_KEY',
  SMS: 'SMS_API_KEY',
  EMAIL: 'EMAIL_API_KEY',
}

const CHANNELS = Object.keys(CHANNEL_KEY) as Channel[]

const OTP = '482913'
const TO = 'guest@example.com'

/** Deno 전역은 이 러너에 없다. 함수가 실제로 읽는 것만 세운다(env.get). */
let env: Record<string, string | undefined> = {}
const g = globalThis as unknown as {
  Deno?: { env: { get(key: string): string | undefined } }
  fetch: typeof fetch
}

let logged: string[] = []
let realFetch: typeof fetch
let fetchSpy: ReturnType<typeof vi.fn>

beforeEach(() => {
  env = {}
  logged = []
  g.Deno = { env: { get: (key: string) => env[key] } }
  for (const level of ['log', 'error', 'warn'] as const) {
    vi.spyOn(console, level).mockImplementation((...args: unknown[]) => {
      logged.push(args.map((a) => String(a)).join(' '))
    })
  }
  // 발송은 네트워크로 나간다. 스파이가 한 번도 불리지 않는 것이 "나가지 않았다"의 증거다.
  realFetch = g.fetch
  fetchSpy = vi.fn()
  g.fetch = fetchSpy as unknown as typeof fetch
})

afterEach(() => {
  vi.restoreAllMocks()
  g.fetch = realFetch
  delete g.Deno
})

/** 지금까지 콘솔에 나간 전부. 비밀이 새지 않았음을 한 문자열에서 확인한다. */
function allLogs(): string {
  return logged.join('\n')
}

const otpRequest = (channel: Channel) => ({
  channel,
  to: TO,
  templateCode: 'GUEST_OTP',
  variables: { otp: OTP },
})

describe('프로바이더 키가 설정된 환경 — 어댑터가 없으므로 실패한다 (SEC-2)', () => {
  for (const channel of CHANNELS) {
    it(`${channel}: 키가 있어도 ok:false이고 provider가 미구현임을 말한다`, async () => {
      env.SUPABASE_URL = 'https://abcdefgh.supabase.co'
      env[CHANNEL_KEY[channel]] = 'configured-key'

      const res = await sendNotification(otpRequest(channel))

      expect(res.ok).toBe(false)
      expect(res.provider).toBe(`${channel.toLowerCase()}:unimplemented`)
      // 어댑터가 없다 = 네트워크로 나간 것이 없다.
      expect(fetchSpy).not.toHaveBeenCalled()
    })
  }

  it('로컬 스택에서 키를 넣어도 성공으로 돌려주지 않는다 — 폴백은 키 미설정 경로만 진다', async () => {
    env.SUPABASE_URL = 'http://127.0.0.1:54321'
    env.EMAIL_API_KEY = 'configured-key'

    const res = await sendNotification(otpRequest('EMAIL'))

    expect(res.ok).toBe(false)
    expect(res.provider).toBe('email:unimplemented')
  })

  it('실패 로그에 수신처·OTP 원문을 남기지 않는다', async () => {
    env.SUPABASE_URL = 'https://abcdefgh.supabase.co'
    env.SMS_API_KEY = 'configured-key'

    await sendNotification(otpRequest('SMS'))

    expect(allLogs()).not.toContain(OTP)
    expect(allLogs()).not.toContain(TO)
    // 무엇이 왜 실패했는지는 남는다(채널 + 템플릿 코드).
    expect(allLogs()).toContain('SMS')
    expect(allLogs()).toContain('GUEST_OTP')
  })
})

describe('프로바이더 키 미설정', () => {
  it('호스팅(https)에서는 실패다 — provider는 none', async () => {
    env.SUPABASE_URL = 'https://abcdefgh.supabase.co'

    const res = await sendNotification(otpRequest('ALIMTALK'))

    expect(res).toEqual({ ok: false, provider: 'none' })
    expect(allLogs()).not.toContain(OTP)
    expect(allLogs()).not.toContain(TO)
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('SUPABASE_URL 자체가 없으면 호스팅으로 본다(모르는 환경을 열지 않는다)', async () => {
    const res = await sendNotification(otpRequest('EMAIL'))
    expect(res.ok).toBe(false)
  })

  it('로컬 스택(http)에서만 콘솔 로그 폴백이 성공이다 — 본문을 눈으로 확인하는 경로', async () => {
    env.SUPABASE_URL = 'http://localhost:54321'

    const res = await sendNotification(otpRequest('SMS'))

    expect(res).toEqual({ ok: true, provider: 'log' })
    // 로컬은 OTP 확인이 목적이므로 본문이 그대로 남는다(의도된 기존 동작).
    expect(allLogs()).toContain(OTP)
    expect(allLogs()).toContain(TO)
    expect(fetchSpy).not.toHaveBeenCalled()
  })
})

describe('템플릿', () => {
  it('모르는 템플릿 코드는 발송을 시도하지 않고 예외를 던진다', async () => {
    env.SUPABASE_URL = 'http://localhost:54321'
    await expect(
      sendNotification({ channel: 'EMAIL', to: TO, templateCode: 'NOPE_9999' }),
    ).rejects.toThrow('unknown_template:NOPE_9999')
    expect(allLogs()).toBe('')
  })

  it('변수를 치환하고, 값이 없는 변수는 빈 칸으로 남긴다(중괄호를 그대로 내보내지 않는다)', async () => {
    env.SUPABASE_URL = 'http://localhost:54321'

    await sendNotification({
      channel: 'EMAIL',
      to: TO,
      templateCode: 'GUEST_INVITE_NEW',
      variables: { name: '홍길동' },
    })

    expect(allLogs()).toContain('홍길동')
    expect(allLogs()).not.toContain('{{')
  })

  it('초기 비밀번호 안내는 신규 계정 문안에만 있다 — 이미 비밀번호가 있는 사람에게는 통하지 않는 값이다', () => {
    expect(TEMPLATES.GUEST_INVITE_NEW.body).toContain('초기 비밀번호')
    expect(TEMPLATES.GUEST_INVITE_ADD.body).not.toContain('초기 비밀번호')
    // 사업 코드는 로그인 요소가 아니므로 문안이 코드를 요구하지 않는다(3_9_1 §6).
    expect(TEMPLATES.GUEST_INVITE_NEW.body).not.toContain('{{code}}')
  })
})
