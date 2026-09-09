import { afterEach, describe, expect, it, vi } from 'vitest'
import { createContextCache, deleteContextCache } from './contextCache.ts'

/**
 * 컨텍스트 캐시의 회귀 테스트.
 *
 * 여기서 지키는 것 셋 — **실패는 실패가 아니다**(못 만들면 종전 경로로 가야 하므로 던지지
 * 않고 사유를 값으로 돌려준다), **작은 자료에는 왕복을 만들지 않는다**(공급자 하한에 미달하면
 * 400이 오고 그 왕복이 곧 낭비다), **모델 이름은 공급자가 요구하는 모양으로 보낸다.**
 *
 * 근거: docs/docs_planning/3_3_6_ai_fill_cost_accuracy_plan.md §4.1(C1)
 */

const bigText = { text: 'ㄱ'.repeat(20_000) } // UTF-8 3바이트 × 2만 = 60KB
const smallText = { text: '매출 1200' }

afterEach(() => {
  vi.unstubAllGlobals()
})

const stubFetch = (impl: (url: string, init?: RequestInit) => unknown) => {
  const spy = vi.fn(impl)
  vi.stubGlobal('fetch', spy)
  return spy
}

const signal = new AbortController().signal

describe('캐시를 만들지 않는 자리', () => {
  it('조각이 없으면 만들지 않는다', async () => {
    const spy = stubFetch(() => {
      throw new Error('불려서는 안 된다')
    })
    expect(await createContextCache({ apiKey: 'k', model: 'm', parts: [], signal })).toEqual({
      skipped: 'empty_parts',
    })
    expect(spy).not.toHaveBeenCalled()
  })

  it('글자가 하한에 미달하면 왕복을 만들지 않는다', async () => {
    const spy = stubFetch(() => {
      throw new Error('불려서는 안 된다')
    })
    const out = await createContextCache({ apiKey: 'k', model: 'm', parts: [smallText], signal })
    expect(out).toEqual({ skipped: 'below_min_size' })
    expect(spy).not.toHaveBeenCalled()
  })

  it('파일 조각이 섞여 있으면 크기로 막지 않는다(쪽수는 바이트로 잴 수 없다)', async () => {
    const spy = stubFetch(() => ({
      ok: true,
      json: () => Promise.resolve({ name: 'cachedContents/abc' }),
    }))
    const out = await createContextCache({
      apiKey: 'k',
      model: 'm',
      parts: [smallText, { fileData: { mimeType: 'application/pdf', fileUri: 'u' } }],
      signal,
    })
    expect(out).toEqual({ name: 'cachedContents/abc' })
    expect(spy).toHaveBeenCalledTimes(1)
  })
})

describe('실패는 값으로 돌려준다', () => {
  it('공급자가 거절하면 사유를 담아 건너뛴다(던지지 않는다)', async () => {
    stubFetch(() => ({
      ok: false,
      status: 400,
      text: () => Promise.resolve(JSON.stringify({ error: { message: 'Cached content requires a versioned model' } })),
    }))
    const out = await createContextCache({ apiKey: 'k', model: 'gemini-flash-latest', parts: [bigText], signal })
    expect(out).toHaveProperty('skipped')
    expect((out as { skipped: string }).skipped).toContain('http_400')
    expect((out as { skipped: string }).skipped).toContain('versioned model')
  })

  it('연결이 끊겨도 던지지 않는다', async () => {
    stubFetch(() => {
      throw new TypeError('network')
    })
    expect(await createContextCache({ apiKey: 'k', model: 'm', parts: [bigText], signal })).toEqual({
      skipped: 'network',
    })
  })

  it('이름이 없는 응답은 캐시가 아니다', async () => {
    stubFetch(() => ({ ok: true, json: () => Promise.resolve({}) }))
    expect(await createContextCache({ apiKey: 'k', model: 'm', parts: [bigText], signal })).toEqual({
      skipped: 'no_name',
    })
  })
})

describe('요청의 모양', () => {
  it('모델에 models/ 접두사를 붙이고 TTL을 함께 보낸다', async () => {
    const spy = stubFetch(() => ({ ok: true, json: () => Promise.resolve({ name: 'cachedContents/x' }) }))
    await createContextCache({ apiKey: 'k', model: 'gemini-flash-latest', parts: [bigText], signal, ttlSeconds: 60 })

    const body = JSON.parse(String((spy.mock.calls[0]![1] as RequestInit).body))
    expect(body.model).toBe('models/gemini-flash-latest')
    expect(body.ttl).toBe('60s')
    expect(body.contents[0].parts).toEqual([bigText])
  })

  it('이미 접두사가 있으면 두 번 붙이지 않는다', async () => {
    const spy = stubFetch(() => ({ ok: true, json: () => Promise.resolve({ name: 'cachedContents/x' }) }))
    await createContextCache({ apiKey: 'k', model: 'models/gemini-2.5-flash-001', parts: [bigText], signal })

    expect(JSON.parse(String((spy.mock.calls[0]![1] as RequestInit).body)).model).toBe('models/gemini-2.5-flash-001')
  })

  it('지우기는 실패해도 던지지 않는다(TTL이 뒤를 받친다)', async () => {
    stubFetch(() => {
      throw new TypeError('network')
    })
    await expect(deleteContextCache('k', { name: 'cachedContents/x' })).resolves.toBeUndefined()
  })
})
