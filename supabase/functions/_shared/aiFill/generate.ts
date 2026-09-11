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

import type { DraftEnvelope, EnvelopeStats } from './envelope.ts'
import { parseJson } from './envelope.ts'
import { ATTEMPT_TIMEOUT_MS, MIN_RETRY_BUDGET_MS } from './limits.ts'
import type { ThinkingLevel } from './request.ts'
import type { SchemaNode } from './schema.ts'

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

/**
 * 이 시도에만 거는 신호 — **바깥 상한과 갈라 두는 것이 요점이다.**
 *
 * 둘을 한 신호로 두면 "느려서 끊겼다"와 "전체가 끝나서 끊겼다"를 가를 수 없고, 그러면 다시
 * 보내야 할 자리와 그만둬야 할 자리가 같은 코드로 흐른다. 바깥이 끊기면 여기도 함께 끊기되
 * 그 사실은 `outer.aborted`가 답한다.
 */
function attemptGate(outer: AbortSignal, ms: number) {
  const inner = new AbortController()
  let slow = false
  const timer = setTimeout(() => {
    slow = true
    inner.abort(new DOMException('attempt timeout', 'AbortError'))
  }, ms)
  const onOuter = () => inner.abort(outer.reason ?? new DOMException('Aborted', 'AbortError'))
  if (outer.aborted) onOuter()
  else outer.addEventListener('abort', onOuter, { once: true })
  return {
    signal: inner.signal,
    /** 이 시도만 느렸는가(바깥은 아직 살아 있는가). */
    get slow() {
      return slow && !outer.aborted
    },
    done() {
      clearTimeout(timer)
      outer.removeEventListener('abort', onOuter)
    },
  }
}

/** 끊김으로 인한 예외인가. */
function isAbort(e: unknown): boolean {
  return e instanceof DOMException && e.name === 'AbortError'
}

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
  /**
   * 공급자가 앞머리를 캐시로 재사용한 토큰.
   *
   * 탐색 축으로 나뉜 요청들은 자료 조각이 같고 프롬프트 꼬리만 다르므로 앞머리가 겹친다.
   * 그 겹침에 할인이 실제로 걸리는지는 이 값만이 답한다 — 값이 크면 축 분할의 중복 비용은
   * 이미 대부분 상쇄된 것이고, 0에 가까우면 조각 선별로 줄여야 할 몫이 그만큼 남아 있다.
   */
  cachedTokens: number | null
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

export interface GenerateOptions<K extends string> {
  apiKey: string
  model: string
  parts: unknown[]
  cards: K[]
  signal: AbortSignal
  /** 이미 조립된 responseSchema. 카드 안쪽 모양은 프로파일이 소유한다. */
  schema: SchemaNode
  /**
   * 응답을 봉투로 세운다. **묶음마다 다른 함수**다 — 근거 대조가 그 요청이 실제로 실어 보낸
   * 조각 지도를 봐야 하므로, 지도를 닫아 넣은 함수를 호출자가 만들어 넘긴다.
   */
  normalize: (parsed: unknown) => { envelope: DraftEnvelope<K>; stats: EnvelopeStats }
  /** 로그에서 이 호출을 부르는 이름(묶음 번호). 어느 묶음이 느렸는지 답한다. */
  label?: string
  /**
   * 표집 온도. 기본값은 사실을 옮기는 작업의 값(0.2)이다.
   *
   * 인자로 연 것은 **작문 패스가 다른 일을 하기** 때문이다. 사실 추출은 같은 자료에서 같은
   * 답이 나와야 하지만, 문장을 세우는 일에서 온도를 그대로 두면 지시에 든 예시의 문형을
   * 그대로 베껴 문서마다 같은 골격이 나온다. 그래도 크게 올리지는 않는다 — 여기서 늘어나야
   * 하는 것은 표현의 폭이지 사실의 폭이 아니다.
   */
  temperature?: number
  /**
   * 공급자 컨텍스트 캐시의 이름(`cachedContents/xxxx`).
   *
   * 주면 **자료는 캐시에 있고 `parts`에는 프롬프트만 담긴다.** 같은 자료를 읽는 묶음들이
   * 이 이름 하나를 가리켜 자료 값을 한 번만 치른다(contextCache.ts).
   */
  cachedContent?: string
  /**
   * 답하기 전에 속으로 생각하는 깊이(`request.ts`가 시크릿에서 읽는다).
   *
   * 주지 않으면 **설정 자체를 보내지 않아** 공급자의 기본값이 그대로 선다 — 값을 모를 때
   * 우리가 임의로 정하지 않는다.
   */
  thinkingLevel?: ThinkingLevel
  /**
   * 이 호출이 끝나야 하는 시각(epoch ms). 주지 않으면 시도 상한만 본다.
   *
   * **다시 보낼지를 남은 시간이 정한다.** 상한을 넘긴 요청을 남은 시간과 무관하게 다시 보내면,
   * 실패가 뻔한 두 번째 시도에 예산을 쓰고 그 바람에 이미 끝난 묶음의 작문까지 날아간다
   * (실측 2026-09-11 — 느린 묶음 하나가 혼자 100초를 쓰고도 실패했다).
   */
  deadline?: number
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
export async function generateDraft<K extends string>(
  opts: GenerateOptions<K>,
): Promise<
  { envelope: DraftEnvelope<K>; telemetry: ModelTelemetry; stats: EnvelopeStats } | { failure: ModelFailure }
> {
  const startedAt = Date.now()
  const url =
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(opts.model)}:generateContent?key=${opts.apiKey}`
  /**
   * 요청 본문. **생각 깊이를 뺀 판을 따로 세울 수 있어야** 하므로 함수로 둔다.
   *
   * 모델 이름이 별칭(`gemini-flash-latest`)이라 공급자가 그것을 옮기는 날 이 설정을 받지 않는
   * 모델이 설 수 있고, 그때 요청이 통째로 400이 되면 **기능이 통째로 죽는다.** 설정 하나 때문에
   * 초안을 잃어서는 안 되므로, 거절당하면 빼고 한 번 더 보낸다(캐시 실패를 실패로 세지 않는
   * 것과 같은 판단 — contextCache.ts).
   */
  const buildPayload = (withThinking: boolean) =>
    JSON.stringify({
      contents: [{ parts: opts.parts }],
      // 캐시를 쓰면 자료는 여기 실리지 않고 이 이름이 가리킨다. 값이 없으면 키 자체를 보내지
      // 않는다 — 빈 문자열을 보내면 공급자가 없는 캐시를 찾다가 요청을 통째로 거절한다.
      ...(opts.cachedContent ? { cachedContent: opts.cachedContent } : {}),
      generationConfig: {
        // 사실을 옮기는 작업이라 온도를 낮게 둔다(같은 자료에서 같은 답이 나와야 한다).
        temperature: opts.temperature ?? 0.2,
        responseMimeType: 'application/json',
        responseSchema: opts.schema,
        ...(withThinking && opts.thinkingLevel
          ? { thinkingConfig: { thinkingLevel: opts.thinkingLevel } }
          : {}),
      },
    })

  let thinkingSent = opts.thinkingLevel != null
  let payload = buildPayload(thinkingSent)
  let lastFailure: ModelFailure = { message: 'AI 작성에 실패했습니다.', upstream: null }
  let parseFailures = 0
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    // 한 시도가 오래 붙들려 있으면 끊고 다시 보낸다(ATTEMPT_TIMEOUT_MS 주석).
    // **남은 예산보다 길게 기다리지 않는다** — 어차피 바깥이 끊을 시간을 붙들고 있을 이유가 없다.
    const left = opts.deadline ? opts.deadline - Date.now() : Number.POSITIVE_INFINITY
    const gate = attemptGate(opts.signal, Math.max(1_000, Math.min(ATTEMPT_TIMEOUT_MS, left)))
    let resp: Response
    try {
      resp = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: gate.signal,
        body: payload,
      })
    } catch (e) {
      const wasSlow = gate.slow
      gate.done()
      // 전체가 끝났거나 담당자가 취소했다 — 여기서 다시 보내지 않는다(위가 처리한다).
      if (!wasSlow || !isAbort(e)) throw e
      lastFailure = {
        message: 'AI 응답이 오래 걸려 중단됐습니다. 잠시 후 다시 시도해 주세요.',
        upstream: null,
      }
      const budgetLeft = opts.deadline ? opts.deadline - Date.now() : Number.POSITIVE_INFINITY
      console.error(
        '[ai-fill] 응답 지연',
        JSON.stringify({
          group: opts.label ?? null,
          attempt,
          limitMs: ATTEMPT_TIMEOUT_MS,
          budgetLeftMs: Number.isFinite(budgetLeft) ? Math.round(budgetLeft) : null,
        }),
      )
      // **기다리지 않고 곧바로 다시 보낸다.** 무작위 지연이라 다음 시도는 대개 정상 속도이고,
      // 여기서 더 기다리면 두 번째 시도가 들어갈 자리가 없어진다(지연 대기는 몰림에만 쓴다).
      //
      // **남은 예산이 모자라면 다시 보내지 않고 곧바로 접는다.** 실패가 뻔한 시도에 남은 시간을
      // 쓰면 이미 끝난 묶음의 작문까지 함께 날아간다 — 이 묶음 하나를 살리려다 전체를 잃는다.
      if (attempt < MAX_ATTEMPTS - 1 && budgetLeft >= MIN_RETRY_BUDGET_MS) continue
      return { failure: lastFailure }
    }
    gate.done()

    if (!resp.ok) {
      const body = await resp.text().catch(() => '')
      const reason = upstreamReason(resp.status, body)
      console.error('[ai-fill] gemini 오류', resp.status, reason)
      lastFailure = { message: friendly(resp.status, reason), upstream: resp.status }
      // 생각 깊이를 받지 않는 모델이다. 설정을 빼고 한 번 더 보낸다 — 초안을 잃는 것보다
      // 비싸게 받는 편이 낫고, 어느 쪽인지는 로그가 답한다.
      if (resp.status === 400 && thinkingSent && /thinking/i.test(reason)) {
        console.warn('[ai-fill] 생각 깊이 설정을 이 모델이 받지 않아 빼고 다시 보냅니다', opts.model)
        thinkingSent = false
        payload = buildPayload(false)
        continue
      }
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
      cachedTokens: num(usage.cachedContentTokenCount),
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
        '[ai-fill] 모델 사용량',
        JSON.stringify({
          group: opts.label ?? null,
          cards: opts.cards.length,
          // 어느 깊이로 받은 답인지. 이 값이 없으면 생각 토큰의 변화를 설정 탓으로 돌릴 수 없다.
          thinking: thinkingSent ? (opts.thinkingLevel ?? null) : null,
          ...telemetry,
        }),
      )
      const normalized = opts.normalize(parsed)
      return { ...normalized, telemetry }
    }

    // 200인데 읽을 것이 없으면 이유는 응답 안에 있다 — 안전 차단이거나 답이 잘린 것이다.
    // 그 둘은 "해석하지 못했다"와 다음 행동이 달라서 갈라 말한다.
    const blocked = data.promptFeedback?.blockReason
    const finish = candidate?.finishReason
    // **답의 앞머리를 찍지 않는다.** 파싱이 실패한 답에도 기업 자료에서 온 글이 들어 있고,
    // 로그는 자료가 나가지 않기로 한 곳이다. 왜 못 읽었는지는 길이와 첫 글자면 답한다
    // (코드펜스로 감쌌는가 · 설명 문장을 붙였는가 · 아예 비었는가).
    console.error(
      '[ai-fill] 파싱 실패',
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
          ? '한 요청이 맡은 카드가 많아 답이 중간에 끊겼습니다. 작성할 카드를 줄여 나눠 실행하세요.'
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
