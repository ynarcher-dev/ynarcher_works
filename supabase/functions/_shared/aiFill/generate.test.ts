import { afterEach, describe, expect, it, vi } from 'vitest'

import { generateDraft } from './generate.ts'
import { ATTEMPT_TIMEOUT_MS, HEDGE_AFTER_MS } from './limits.ts'

/**
 * 느린 응답을 다시 묻는 규칙의 회귀 테스트.
 *
 * 지키는 것 넷 — **늦어지면 옆에 하나 더 세운다(헤지)**, **먼저 온 답을 쓰고 진 쪽은 거둔다**,
 * **남은 예산이 모자라면 더 세우지 않는다**, **담당자가 취소하면 아무것도 다시 보내지 않는다**.
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
  it('늦어지면 옆에 하나 더 세우고 먼저 온 답을 쓴다 — 첫 요청은 거둔다', async () => {
    vi.useFakeTimers()
    const at: number[] = []
    const signals: AbortSignal[] = []
    vi.stubGlobal('fetch', (_url: string, init?: RequestInit) => {
      at.push(Date.now())
      if (init?.signal) signals.push(init.signal)
      // 첫 요청은 붙들리고, 헤지는 정상 응답.
      return at.length === 1 ? hang(init) : Promise.resolve(okResponse())
    })

    const outer = new AbortController()
    const promise = generateDraft({ ...options(outer.signal), deadline: Date.now() + 120_000 })
    await vi.advanceTimersByTimeAsync(HEDGE_AFTER_MS + 10)
    const result = await promise

    expect(at).toHaveLength(2)
    // 헤지는 상한을 기다리지 않고 정해진 시각에 나갔다.
    expect(at[1] - at[0]).toBeGreaterThanOrEqual(HEDGE_AFTER_MS)
    expect(at[1] - at[0]).toBeLessThan(ATTEMPT_TIMEOUT_MS)
    expect('failure' in result).toBe(false)
    // 진 쪽(첫 요청)은 거둬져 요금이 더 붙지 않는다.
    expect(signals[0].aborted).toBe(true)
  })

  it('둘 다 붙들리면 느린 것으로 접는다', async () => {
    vi.useFakeTimers()
    const calls: number[] = []
    vi.stubGlobal('fetch', (_url: string, init?: RequestInit) => {
      calls.push(1)
      return hang(init)
    })

    const outer = new AbortController()
    // 접은 뒤 재시도 문턱에 못 미치게 남겨 둔다.
    const promise = generateDraft({ ...options(outer.signal), deadline: Date.now() + ATTEMPT_TIMEOUT_MS + 20_000 })
    await vi.advanceTimersByTimeAsync(ATTEMPT_TIMEOUT_MS + 20_000)
    const result = await promise

    expect(calls).toHaveLength(2)
    expect('failure' in result).toBe(true)
  })

  it('남은 예산이 모자라면 헤지도 재시도도 세우지 않고 곧바로 접는다', async () => {
    vi.useFakeTimers()
    const calls: number[] = []
    vi.stubGlobal('fetch', (_url: string, init?: RequestInit) => {
      calls.push(1)
      return hang(init)
    })

    const outer = new AbortController()
    // 헤지 시각에 남은 시간이 헤지 문턱(25초)에 못 미치고, 접은 뒤 재시도 문턱에도 못 미친다.
    const deadline = Date.now() + HEDGE_AFTER_MS + 10_000
    const promise = generateDraft({ ...options(outer.signal), deadline })
    await vi.advanceTimersByTimeAsync(HEDGE_AFTER_MS + 10_000 + 10)
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
