// [AI 작성하기] 모델 호출과 실패의 해석.
//
// 이 파일이 따로 있는 이유는 **실패를 말하는 일**이 호출만큼 크기 때문이다. 종전에는 모델이
// 무엇을 거절했든 화면에 "AI 작성에 실패했습니다." 한 줄만 갔고, 사유는 함수 로그에만 남았다.
// 담당자는 로그를 볼 수 없으므로 고칠 수 있는 문제(자료가 너무 많다·잠시 몰렸다)와 고칠 수
// 없는 문제(키 설정)를 가르지 못한 채 같은 조합으로 계속 다시 눌렀다.
//
// 그래서 두 가지를 한다 — **잠깐인 실패는 한 번 더 시도하고**(몰림·과부하는 같은 요청이 다음
// 순간 성공한다), **남는 실패는 사유를 그대로 돌려준다**. 구글의 오류 문구는 영어지만, 아무 말도
// 없는 것보다 낫고 대부분 그 안에 무엇을 줄여야 하는지가 들어 있다.
//
// 근거: docs/docs_planning/3_3_5_startup_ai_fill.md §8.2·§10

import type { CardKey } from './cards.ts'
import { buildResponseSchema } from './schema.ts'
import { normalizeEnvelope, parseJson } from './validate.ts'

/** 잠깐인 실패. 같은 요청을 다시 보내면 성공할 수 있는 것들만 담는다. */
const TRANSIENT = new Set([429, 500, 502, 503, 504])
const RETRY_DELAY_MS = 2_000

export interface ModelFailure {
  /** 담당자에게 그대로 보이는 문구. */
  message: string
  /** 구글이 준 상태 코드. 로그와 구분에만 쓴다. */
  upstream: number | null
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
}

/**
 * 모델을 불러 초안 봉투를 받는다.
 *
 * 다시 시도하는 경우는 둘뿐이다 — 잠깐인 실패(몰림·과부하)와 응답이 JSON이 아닌 경우.
 * 그 밖의 오류는 같은 요청을 다시 보내도 같은 답이라 즉시 사유와 함께 돌려준다.
 */
export async function generateDraft(
  opts: GenerateOptions,
): Promise<{ envelope: ReturnType<typeof normalizeEnvelope> } | { failure: ModelFailure }> {
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
  for (let attempt = 0; attempt < 2; attempt += 1) {
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
      if (attempt === 0 && TRANSIENT.has(resp.status)) {
        await new Promise((r) => setTimeout(r, RETRY_DELAY_MS))
        continue
      }
      return { failure: lastFailure }
    }

    const data = (await resp.json().catch(() => ({}))) as {
      candidates?: { content?: { parts?: { text?: string }[] }; finishReason?: string }[]
      promptFeedback?: { blockReason?: string }
    }
    const candidate = data.candidates?.[0]
    const text = candidate?.content?.parts?.map((p) => p.text ?? '').join('') ?? ''
    const parsed = parseJson(text)
    if (parsed) return { envelope: normalizeEnvelope(parsed, opts.cards) }

    // 200인데 읽을 것이 없으면 이유는 응답 안에 있다 — 안전 차단이거나 답이 잘린 것이다.
    // 그 둘은 "해석하지 못했다"와 다음 행동이 달라서 갈라 말한다.
    const blocked = data.promptFeedback?.blockReason
    const finish = candidate?.finishReason
    console.error('[startup-ai-fill] 파싱 실패', attempt, { blocked, finish, head: text.slice(0, 300) })
    lastFailure = {
      message: blocked
        ? `자료가 AI 안전 정책에 걸려 거절됐습니다(${blocked}).`
        : finish === 'MAX_TOKENS'
          ? '작성할 카드가 많아 답이 중간에 끊겼습니다. 카드를 나눠 실행해 주세요.'
          : 'AI 응답을 해석하지 못했습니다.',
      upstream: 200,
    }
    // 차단과 끊김은 다시 보내도 같은 답이다. 형식이 어긋난 경우만 한 번 더 본다.
    if (blocked || finish === 'MAX_TOKENS') return { failure: lastFailure }
  }
  return { failure: lastFailure }
}
