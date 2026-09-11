import { afterEach, describe, expect, it, vi } from 'vitest'

import { generateDraft } from './generate.ts'
import { ATTEMPT_TIMEOUT_MS, MIN_RETRY_BUDGET_MS } from './limits.ts'

/**
 * 느린 응답을 다시 묻는 규칙의 회귀 테스트.
 *
 * 지키는 것 셋 — **느린 시도는 다시 보낸다**, **담당자가 취소하면 다시 보내지 않는다**,
 * **다시 보낼 때 기다리지 않는다**(남은 예산이 빠듯해 기다리면 두 번째가 들어갈 자리가 없다).
 *
 * 실측이 이 규칙을 만들었다(2026-09-11): 묶음 넷 중 셋은 15~40초에 오는데 남은 하나가 95초
 * 넘게 붙들려 전체 상한에 걸렸고, 느린 묶음이 실행마다 달랐다.
 */

const schema = { type: 'object' } as never
const options = (signal: AbortSignal) => ({
  apiKey: 'k',
  model: 'm',
  parts: [{ text: 'p' }],
  cards: ['a'] as 'a'[],
  signal,
  schema,
  normalize: () => ({
    envelope: { cards: { a: 1 }, notes: {}, evidence: {} } as never,
    stats: { verified: 0, unverified: 0, rejected: 0 },
  }),
})

/** 성공 응답 한 벌(모델이 JSON을 준 경우). */
const okResponse = () =>
  new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: '{"cards":{}}' }] } }] }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })

/** 신호가 끊길 때까지 응답하지 않는 요청 — 붙들려 있는 공급자를 흉내 낸다. */
const hang = (init: RequestInit | undefined) =>
  new Promise<Response>((_resolve, reject) => {
    const signal = init?.signal
    if (!signal) return
    signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')), { once: true })
  })

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('한 시도가 느릴 때', () => {
  it('상한을 넘기면 끊고 곧바로 다시 보낸다', async () => {
    vi.useFakeTimers()
    const calls: number[] = []
    vi.stubGlobal('fetch', (_url: string, init?: RequestInit) => {
      calls.push(Date.now())
      // 첫 시도만 붙들고, 두 번째는 정상 응답.
      return calls.length === 1 ? hang(init) : Promise.resolve(okResponse())
    })

    const outer = new AbortController()
    const promise = generateDraft(options(outer.signal))
    // 첫 시도가 상한에 걸릴 때까지 시계를 민다.
    await vi.advanceTimersByTimeAsync(ATTEMPT_TIMEOUT_MS + 10)
    const result = await promise

    expect(calls).toHaveLength(2)
    expect('failure' in result).toBe(false)
  })

  it('다시 보낼 때 기다리지 않는다 — 지연 대기는 몰림에만 쓴다', async () => {
    vi.useFakeTimers()
    const at: number[] = []
    vi.stubGlobal('fetch', (_url: string, init?: RequestInit) => {
      at.push(Date.now())
      return at.length === 1 ? hang(init) : Promise.resolve(okResponse())
    })

    const outer = new AbortController()
    const promise = generateDraft(options(outer.signal))
    await vi.advanceTimersByTimeAsync(ATTEMPT_TIMEOUT_MS + 10)
    await promise

    // 두 번째 요청이 상한 직후에 나갔다(백오프 2초를 타지 않았다).
    expect(at[1] - at[0]).toBeLessThan(ATTEMPT_TIMEOUT_MS + 1_000)
  })

  it('남은 예산이 모자라면 다시 보내지 않고 곧바로 접는다 — 실패가 뻔한 시도에 예산을 쓰지 않는다', async () => {
    vi.useFakeTimers()
    const calls: number[] = []
    vi.stubGlobal('fetch', (_url: string, init?: RequestInit) => {
      calls.push(1)
      return hang(init)
    })

    const outer = new AbortController()
    // 상한을 넘기고 나면 재시도 문턱에 못 미치게 남겨 둔다.
    const deadline = Date.now() + ATTEMPT_TIMEOUT_MS + MIN_RETRY_BUDGET_MS - 5_000
    const promise = generateDraft({ ...options(outer.signal), deadline })
    await vi.advanceTimersByTimeAsync(ATTEMPT_TIMEOUT_MS + 10)
    const result = await promise

    expect(calls).toHaveLength(1)
    expect('failure' in result).toBe(true)
  })

  it('담당자가 취소하면 다시 보내지 않고 그대로 끊긴다', async () => {
    const calls: number[] = []
    vi.stubGlobal('fetch', (_url: string, init?: RequestInit) => {
      calls.push(1)
      return hang(init)
    })

    const outer = new AbortController()
    const promise = generateDraft(options(outer.signal))
    outer.abort(new DOMException('cancelled', 'AbortError'))

    await expect(promise).rejects.toThrow()
    expect(calls).toHaveLength(1)
  })
})
