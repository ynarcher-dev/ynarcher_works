import { afterEach, describe, expect, it, vi } from 'vitest'
import { buildIndex } from './chunks.ts'
import { normalizeEnvelope } from './envelope.ts'
import { generateDraft } from './generate.ts'
import { buildEnvelopeSchema, obj, STR } from './schema.ts'

/**
 * 모델 호출의 회귀 테스트.
 *
 * 엔진은 카드가 무엇인지 모른다 — 그래서 여기서도 **가짜 카드 하나**로 시험한다. 프로파일의
 * 카드를 끌어다 쓰면 그 프로파일이 바뀔 때 호출·재시도 판정의 시험이 함께 흔들린다.
 */

type Card = 'demo'

const SCHEMA = buildEnvelopeSchema<Card>(['demo'], { demo: obj({ value: STR }) })

/** 이 시험이 재는 것은 호출과 재시도라, 봉투는 들어온 대로 되돌리기만 한다. */
const normalize = (parsed: unknown) =>
  normalizeEnvelope<Card>(parsed, ['demo'], {
    normalizeCard: (_key, raw) => raw,
    cardShape: { demo: 'object' },
    index: buildIndex([], []),
    maxNotes: 5,
  })

const call = () =>
  generateDraft<Card>({
    apiKey: 'test',
    model: 'test-model',
    parts: [],
    cards: ['demo'],
    signal: new AbortController().signal,
    schema: SCHEMA,
    normalize,
  })

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

    const pending = call()
    await vi.runAllTimersAsync()

    await expect(pending).resolves.toMatchObject({ failure: { upstream: 503 } })
    expect(fetchMock).toHaveBeenCalledTimes(4)
  })

  it('재시도해도 달라지지 않는 400은 한 번만 호출한다', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('{}', { status: 400 }))
    vi.stubGlobal('fetch', fetchMock)

    const result = await call()

    expect(result).toMatchObject({ failure: { upstream: 400 } })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})

describe('generateDraft — 계측', () => {
  afterEach(() => vi.restoreAllMocks())

  it('공급자가 재사용한 앞머리 토큰을 함께 남긴다', async () => {
    // 탐색 축으로 나뉜 요청들은 자료 조각이 같고 프롬프트 꼬리만 달라 앞머리가 겹친다.
    // 그 겹침에 할인이 실제로 걸리는지는 이 값만이 답한다 — 읽지 않으면 축 분할의 중복
    // 비용을 재는 방법이 없고, 그러면 줄일지 말지를 감으로 정하게 된다.
    vi.stubGlobal('fetch', () =>
      Promise.resolve(
        Response.json({
          candidates: [{ content: { parts: [{ text: '{"cards":{"demo":{"value":"A"}}}' }] } }],
          usageMetadata: { promptTokenCount: 900, cachedContentTokenCount: 700, candidatesTokenCount: 40 },
        }),
      ),
    )

    const result = await call()
    if ('failure' in result) throw new Error('성공 응답이다')
    expect(result.telemetry.promptTokens).toBe(900)
    expect(result.telemetry.cachedTokens).toBe(700)
  })

  it('사용량 필드가 없으면 0이 아니라 null이다(0으로 세면 거짓이 된다)', async () => {
    vi.stubGlobal('fetch', () =>
      Promise.resolve(
        Response.json({ candidates: [{ content: { parts: [{ text: '{"cards":{}}' }] } }] }),
      ),
    )

    const result = await call()
    if ('failure' in result) throw new Error('성공 응답이다')
    expect(result.telemetry.cachedTokens).toBeNull()
  })
})
