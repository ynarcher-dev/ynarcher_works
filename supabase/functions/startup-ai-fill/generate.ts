// [AI 작성하기] 모델 호출과 실패의 해석.
//
// 이 파일이 따로 있는 이유는 **실패를 말하는 일**이 호출만큼 크기 때문이다. 종전에는 모델이
// 무엇을 거절했든 화면에 "AI 작성에 실패했습니다." 한 줄만 갔고, 사유는 함수 로그에만 남았다.
// 담당자는 로그를 볼 수 없으므로 고칠 수 있는 문제(자료가 너무 많다·잠시 몰렸다)와 고칠 수
// 없는 문제(키 설정)를 가르지 못한 채 같은 조합으로 계속 다시 눌렀다.
//
// 그래서 두 가지를 한다 — **잠깐인 실패는 지수 백오프로 최대 세 번 더 시도하고**(몰림·과부하는
// 같은 요청이 다음 순간 성공한다), **남는 실패는 사유를 그대로 돌려준다**. 구글의 오류 문구는
// 영어지만, 아무 말도 없는 것보다 낫고 대부분 그 안에 무엇을 줄여야 하는지가 들어 있다.
//
// 근거: docs/docs_planning/3_3_5_startup_ai_fill.md §8.2·§10

import type { CardKey } from './cards.ts'
import { buildResponseSchema } from './schema.ts'
import { normalizeEnvelope, parseJson, type NormalizeOptions } from './validate.ts'

/** 잠깐인 실패. 같은 요청을 다시 보내면 성공할 수 있는 것들만 담는다. */
const TRANSIENT = new Set([429, 500, 502, 503, 504])
const RETRY_BASE_MS = 2_000
const MAX_ATTEMPTS = 4
/**
 * 다시 보내는 시각을 흩뜨리는 폭.
 *
 * 요청이 병렬로 나가면서 생긴 규칙이다. 셋이 같은 순간 429를 받고 **똑같이 2초 뒤** 다시
 * 보내면 그 순간에 또 셋이 몰려 같은 벽에 부딪힌다. 기다리는 시간을 건마다 다르게 흩어야
 * 재시도가 재시도끼리 부딪히지 않는다.
 */
const RETRY_JITTER_MS = 2_000

/** 전체 실행이 취소되면 재시도 대기도 즉시 끝낸다. */
function waitBeforeRetry(ms: number, signal: AbortSignal): Promise<void> {
  if (signal.aborted) return Promise.reject(signal.reason ?? new DOMException('Aborted', 'AbortError'))
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
    const onAbort = () => {
      clearTimeout(timer)
      reject(signal.reason ?? new DOMException('Aborted', 'AbortError'))
    }
    signal.addEventListener('abort', onAbort, { once: true })
  })
}

export interface ModelFailure {
  /** 담당자에게 그대로 보이는 문구. */
  message: string
  /** 구글이 준 상태 코드. 로그와 구분에만 쓴다. */
  upstream: number | null
}

/**
 * 한 번의 모델 호출에서 남길 운영 기록.
 *
 * **`gemini-flash-latest`는 별칭이라 실제로 어느 모델이 답했는지 요청만 보고는 알 수 없다.**
 * 구글이 별칭을 옮기는 날 초안의 품질이 조용히 달라지고, 그때 무엇이 바뀌었는지 답할 근거가
 * 우리에게 없다. 토큰 수도 마찬가지다 — 예산을 바이트로 재는 지금의 방식이 실제 소비와 얼마나
 * 어긋나는지는 이 값이 쌓여야 알 수 있다(기획서 §14의 열린 이슈).
 *
 * **자료 내용과 생성 결과는 담지 않는다.** 여기 담기는 것은 전부 수(數)와 짧은 코드다.
 */
export interface ModelTelemetry {
  /** 실제로 답한 모델. 별칭이 아니라 구글이 밝힌 버전이다. */
  modelVersion: string | null
  /** 구글의 응답 식별자. 문의할 때 이 값 하나로 그 호출을 가리킨다. */
  responseId: string | null
  promptTokens: number | null
  outputTokens: number | null
  /** 추론에 쓴 토큰. 값을 내지 않는 모델도 있어 없으면 null이다. */
  thinkingTokens: number | null
  totalTokens: number | null
  /** 답이 끝난 사유. `MAX_TOKENS`면 카드가 많아 잘린 것이다. */
  finishReason: string | null
  elapsedMs: number
  /** 몇 번째 시도에서 끝났는가(0이면 첫 시도). */
  attempts: number
}

/**
 * 구글의 오류 본문에서 사람이 읽을 사유를 꺼낸다.
 *
 * 본문을 통째로 돌려주지 않는다 — 길고, 우리가 보낸 요청 조각이 되비칠 수 있다. 필요한 것은
 * `error.message` 한 줄뿐이다.
 */
function upstreamReason(status: number, body: string): string {
  try {
    const parsed = JSON.parse(body) as { error?: { message?: string } }
    const message = parsed.error?.message
    if (message) return message.slice(0, 300)
  } catch {
    // 본문이 JSON이 아니면 상태 코드가 답한다.
  }
  return `HTTP ${status}`
}

/** 자주 나오고 담당자가 실제로 손쓸 수 있는 것은 한국어로 바꿔 말한다. */
function friendly(status: number, reason: string): string {
  const lower = reason.toLowerCase()
  if (status === 429) return 'AI 요청이 몰려 거절됐습니다. 잠시 후 다시 시도해 주세요.'
  if (lower.includes('token') && lower.includes('exceed')) {
    return '자료가 모델이 한 번에 읽는 양을 넘었습니다. 자료를 줄여 다시 시도해 주세요.'
  }
  if (status === 403) return 'AI 작성 키에 권한이 없습니다. 관리자에게 알려 주세요.'
  return `AI 작성에 실패했습니다: ${reason}`
}

export interface GenerateOptions {
  apiKey: string
  model: string
  parts: unknown[]
  cards: CardKey[]
  signal: AbortSignal
  /** 검증에 필요한 원장 값(소재지 목록 등). 상수로 두지 않고 요청 시점에 받아 온다. */
  normalize?: NormalizeOptions
  /** 로그에서 이 호출을 부르는 이름(묶음 번호). 어느 묶음이 느렸는지 답한다. */
  label?: string
}

/** 사용량 응답에서 수를 꺼낸다. 필드가 없거나 수가 아니면 null(0으로 세면 거짓이 된다). */
function num(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null
}

/**
 * 모델을 불러 초안 봉투를 받는다.
 *
 * 다시 시도하는 경우는 둘뿐이다 — 잠깐인 실패(몰림·과부하)와 응답이 JSON이 아닌 경우.
 * 그 밖의 오류는 같은 요청을 다시 보내도 같은 답이라 즉시 사유와 함께 돌려준다.
 */
export async function generateDraft(
  opts: GenerateOptions,
): Promise<
  { envelope: ReturnType<typeof normalizeEnvelope>; telemetry: ModelTelemetry } | { failure: ModelFailure }
> {
  const startedAt = Date.now()
  const url =
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(opts.model)}:generateContent?key=${opts.apiKey}`
  const payload = JSON.stringify({
    contents: [{ parts: opts.parts }],
    generationConfig: {
      // 사실을 옮기는 작업이라 온도를 낮게 둔다(같은 자료에서 같은 답이 나와야 한다).
      temperature: 0.2,
      responseMimeType: 'application/json',
      responseSchema: buildResponseSchema(opts.cards),
    },
  })

  let lastFailure: ModelFailure = { message: 'AI 작성에 실패했습니다.', upstream: null }
  let parseFailures = 0
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: opts.signal,
      body: payload,
    })

    if (!resp.ok) {
      const body = await resp.text().catch(() => '')
      const reason = upstreamReason(resp.status, body)
      console.error('[startup-ai-fill] gemini 오류', resp.status, reason)
      lastFailure = { message: friendly(resp.status, reason), upstream: resp.status }
      if (attempt < MAX_ATTEMPTS - 1 && TRANSIENT.has(resp.status)) {
        const delay = RETRY_BASE_MS * 2 ** attempt + Math.random() * RETRY_JITTER_MS
        await waitBeforeRetry(delay, opts.signal)
        continue
      }
      return { failure: lastFailure }
    }

    const data = (await resp.json().catch(() => ({}))) as {
      candidates?: { content?: { parts?: { text?: string }[] }; finishReason?: string }[]
      promptFeedback?: { blockReason?: string }
      modelVersion?: string
      responseId?: string
      usageMetadata?: Record<string, unknown>
    }
    const candidate = data.candidates?.[0]
    const usage = data.usageMetadata ?? {}
    const telemetry: ModelTelemetry = {
      modelVersion: data.modelVersion ?? null,
      responseId: data.responseId ?? null,
      promptTokens: num(usage.promptTokenCount),
      outputTokens: num(usage.candidatesTokenCount),
      thinkingTokens: num(usage.thoughtsTokenCount),
      totalTokens: num(usage.totalTokenCount),
      finishReason: candidate?.finishReason ?? null,
      elapsedMs: Date.now() - startedAt,
      attempts: attempt,
    }
    const text = candidate?.content?.parts?.map((p) => p.text ?? '').join('') ?? ''
    const parsed = parseJson(text)
    if (parsed) {
      // 구조화 로그 한 줄 — 내용은 담지 않고 수와 코드만 담는다(ModelTelemetry 주석 참조).
      console.log(
        '[startup-ai-fill] 모델 사용량',
        JSON.stringify({ group: opts.label ?? null, cards: opts.cards.length, ...telemetry }),
      )
      return { envelope: normalizeEnvelope(parsed, opts.cards, opts.normalize), telemetry }
    }

    // 200인데 읽을 것이 없으면 이유는 응답 안에 있다 — 안전 차단이거나 답이 잘린 것이다.
    // 그 둘은 "해석하지 못했다"와 다음 행동이 달라서 갈라 말한다.
    const blocked = data.promptFeedback?.blockReason
    const finish = candidate?.finishReason
    // **답의 앞머리를 찍지 않는다.** 파싱이 실패한 답에도 기업 자료에서 온 글이 들어 있고,
    // 로그는 자료가 나가지 않기로 한 곳이다. 왜 못 읽었는지는 길이와 첫 글자면 답한다
    // (코드펜스로 감쌌는가 · 설명 문장을 붙였는가 · 아예 비었는가).
    console.error(
      '[startup-ai-fill] 파싱 실패',
      JSON.stringify({
        group: opts.label ?? null,
        attempt,
        blocked: blocked ?? null,
        finish: finish ?? null,
        textLength: text.length,
        startsWith: text.trimStart().slice(0, 1),
        ...telemetry,
      }),
    )
    lastFailure = {
      message: blocked
        ? `자료가 AI 안전 정책에 걸려 거절됐습니다(${blocked}).`
        : finish === 'MAX_TOKENS'
          ? '한 요청이 맡은 카드가 많아 답이 중간에 끊겼습니다. 카드마다 읽을 자료를 다르게 지정하면 요청이 나뉩니다.'
          : 'AI 응답을 해석하지 못했습니다.',
      upstream: 200,
    }
    // 차단과 끊김은 다시 보내도 같은 답이다. 형식이 어긋난 경우만 한 번 더 본다.
    if (blocked || finish === 'MAX_TOKENS') return { failure: lastFailure }
    parseFailures += 1
    if (parseFailures >= 2) return { failure: lastFailure }
  }
  return { failure: lastFailure }
}
