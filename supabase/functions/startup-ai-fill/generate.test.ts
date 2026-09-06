import { afterEach, describe, expect, it, vi } from 'vitest'
import { generateDraft } from './generate.ts'

describe('generateDraft — 잠깐인 상위 오류 재시도', () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('503을 지수 백오프로 최대 세 번 더 시도한다', async () => {
    vi.useFakeTimers()
    vi.spyOn(Math, 'random').mockReturnValue(0)
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: { message: 'high demand' } }), { status: 503 }),
    )
    vi.stubGlobal('fetch', fetchMock)

    const pending = generateDraft({
      apiKey: 'test',
      model: 'test-model',
      parts: [],
      cards: ['business'],
      signal: new AbortController().signal,
    })
    await vi.runAllTimersAsync()

    await expect(pending).resolves.toMatchObject({ failure: { upstream: 503 } })
    expect(fetchMock).toHaveBeenCalledTimes(4)
  })

  it('재시도해도 달라지지 않는 400은 한 번만 호출한다', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('{}', { status: 400 }))
    vi.stubGlobal('fetch', fetchMock)

    const result = await generateDraft({
      apiKey: 'test',
      model: 'test-model',
      parts: [],
      cards: ['business'],
      signal: new AbortController().signal,
    })

    expect(result).toMatchObject({ failure: { upstream: 400 } })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})
