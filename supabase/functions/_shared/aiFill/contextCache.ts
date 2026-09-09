// [AI 작성하기] 공급자 컨텍스트 캐시 — **팬아웃의 값을 한 번만 치른다.**
//
// 탐색 축으로 갈린 묶음들은 **같은 자료를 읽고 프롬프트 꼬리만 다르다**(groups.ts). 그래서
// 같은 자료가 요청 수만큼 정가로 실린다. 공급자에게는 앞머리를 재사용하는 암묵적 캐시가
// 있지만 그것은 **첫 응답이 돌아온 뒤에야** 채워지므로, 묶음을 병렬로 보내는 이 구조에서는
// 거의 걸리지 않는다(`cachedContentTokenCount`가 그 사실을 답한다).
//
// 명시적 캐시는 순서를 뒤집는다 — 자료를 **먼저** 올려 두고 묶음들이 그것을 가리킨다. 캐시에
// 든 토큰은 정가의 일부만 청구되므로, 네 묶음이 같은 자료를 읽어도 자료 값은 한 번 남짓이다.
//
// **실패는 실패가 아니다.** 캐시를 못 만들면 종전대로 자료를 요청마다 실어 보낸다. 비용이
// 종전으로 돌아갈 뿐 초안은 똑같이 나온다 — 그래서 이 모듈의 모든 오류 경로는 사유를 담은
// `skipped`이고, 호출자는 그것을 로그에만 남긴다.
//
// **캐시에 담기는 것은 기밀 자료다.** 그래서 TTL을 짧게 잡고(실행 하나가 끝나면 쓸 일이 없다)
// 진입점이 `finally`에서 반드시 지운다 — Files API 자료를 지우는 규약과 같다.
//
// 근거: docs/docs_planning/3_3_6_ai_fill_cost_accuracy_plan.md §4.1(C1)·§5 Phase 1

const BASE = 'https://generativelanguage.googleapis.com/v1beta'

/**
 * 캐시가 성립하려면 넘어야 하는 글자 바이트.
 *
 * 공급자는 캐시에 **최소 토큰 수**를 요구한다(모델마다 1K~4K). 미달이면 400이 오는데, 그
 * 왕복 자체가 낭비이고 로그에 실패가 쌓여 진짜 문제를 가린다. 한글은 UTF-8 3바이트에 대략
 * 1.5자당 1토큰이라 24KB면 약 8천 자·5천 토큰으로, 어느 모델의 하한도 넘는다.
 *
 * **파일 조각이 섞여 있으면 이 검사를 건너뛴다** — 쪽당 258토큰이라 바이트로는 잴 수 없고,
 * 미달이면 공급자가 답한다(그 실패는 그냥 건너뛰기가 된다).
 */
const MIN_CACHE_TEXT_BYTES = 24 * 1024

/** 실행 하나가 쓰고 버린다. 짧게 잡되 보완 호출까지는 살아 있어야 한다(전체 상한 125초). */
const DEFAULT_TTL_SECONDS = 600

export interface ContextCache {
  /** `cachedContents/xxxx`. 요청과 삭제가 이 이름 하나로 가리킨다. */
  name: string
}

export interface CacheSkipped {
  /** 왜 캐시를 쓰지 않았는가. 로그에만 담기며 담당자에게 가지 않는다. */
  skipped: string
}

export interface CreateCacheOptions {
  apiKey: string
  /**
   * 캐시를 만들 모델.
   *
   * 공급자는 캐시에 **버전이 박힌 모델 이름**을 요구할 수 있고 `-latest` 별칭은 거절될 수
   * 있다. 그때 코드를 고쳐 배포하지 않아도 되도록 운영이 `GEMINI_CACHE_MODEL`로 못 박는다
   * (시크릿 변경은 재배포가 필요 없다 — 요율 상한을 `GEMINI_MAX_CONCURRENCY`로 조이는 것과
   * 같은 규약). 값이 없으면 작성에 쓰는 모델을 그대로 시도하고, 거절되면 건너뛴다.
   */
  model: string
  /** 캐시에 담을 자료 조각. 프롬프트는 담지 않는다(묶음마다 다르다). */
  parts: unknown[]
  signal: AbortSignal
  ttlSeconds?: number
}

const textBytesOf = (parts: unknown[]): number => {
  const encoder = new TextEncoder()
  let bytes = 0
  for (const part of parts) {
    const text = (part as { text?: unknown })?.text
    if (typeof text === 'string') bytes += encoder.encode(text).length
  }
  return bytes
}

const hasFilePart = (parts: unknown[]): boolean =>
  parts.some((p) => {
    const part = p as { fileData?: unknown; inlineData?: unknown }
    return Boolean(part?.fileData || part?.inlineData)
  })

/** 모델 이름 앞에 `models/`를 붙인다(공급자가 그 모양을 요구한다). 이미 붙어 있으면 그대로. */
function qualifyModel(model: string): string {
  return model.startsWith('models/') ? model : `models/${model}`
}

/**
 * 자료 조각을 캐시로 올린다.
 *
 * 돌려주는 것이 `skipped`면 **호출자는 종전 경로로 간다** — 자료를 요청마다 실어 보낸다.
 */
export async function createContextCache(opts: CreateCacheOptions): Promise<ContextCache | CacheSkipped> {
  if (opts.parts.length === 0) return { skipped: 'empty_parts' }
  if (!hasFilePart(opts.parts) && textBytesOf(opts.parts) < MIN_CACHE_TEXT_BYTES) {
    // 캐시 하한에 미달한다. 이 크기에서는 캐시가 아껴 주는 값보다 왕복 하나가 더 비싸다.
    return { skipped: 'below_min_size' }
  }

  const model = qualifyModel(opts.model)
  try {
    const resp = await fetch(`${BASE}/cachedContents?key=${encodeURIComponent(opts.apiKey)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: opts.signal,
      body: JSON.stringify({
        model,
        contents: [{ role: 'user', parts: opts.parts }],
        ttl: `${opts.ttlSeconds ?? DEFAULT_TTL_SECONDS}s`,
      }),
    })
    if (!resp.ok) {
      // 본문을 통째로 남기지 않는다 — 길고, 우리가 보낸 자료 조각이 되비칠 수 있다.
      const body = await resp.text().catch(() => '')
      let reason = `http_${resp.status}`
      try {
        const parsed = JSON.parse(body) as { error?: { message?: string } }
        if (parsed.error?.message) reason = `${reason}:${parsed.error.message.slice(0, 120)}`
      } catch {
        // 상태 코드만으로 충분하다.
      }
      return { skipped: reason }
    }
    const data = (await resp.json().catch(() => null)) as { name?: unknown } | null
    const name = typeof data?.name === 'string' ? data.name : ''
    return name ? { name } : { skipped: 'no_name' }
  } catch (error) {
    // 시간 초과는 위쪽 타이머가 실행 전체를 끊는다. 여기서는 건너뛰기로만 답한다.
    const aborted = error instanceof DOMException && error.name === 'AbortError'
    return { skipped: aborted ? 'aborted' : 'network' }
  }
}

/**
 * 캐시를 지운다. **성공·실패·예외를 가리지 않고 부른다.**
 *
 * 지우는 일이 응답을 붙잡아서는 안 되므로 실패해도 조용히 넘어간다(TTL이 뒤를 받친다).
 * Files API 자료를 지우는 규약과 같은 판단이다.
 */
export async function deleteContextCache(apiKey: string, cache: ContextCache): Promise<void> {
  try {
    await fetch(`${BASE}/${cache.name}?key=${encodeURIComponent(apiKey)}`, { method: 'DELETE' })
  } catch {
    // 지우지 못해도 TTL이 거둔다. 이 실패로 초안을 잃어서는 안 된다.
  }
}
