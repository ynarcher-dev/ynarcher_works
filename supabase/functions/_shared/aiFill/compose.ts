// [AI 작성하기] 2단계 — **자료를 다시 읽지 않고 문장만 다시 쓴다.**
//
// ## 왜 두 번 묻는가
//
// 한 요청에서 "빠짐없이 담기"와 "읽히게 쓰기"를 함께 시키면 둘이 서로를 방해한다. 매끄러운
// 문장을 만들려는 순간 모델은 값을 버리고(연도 하나·제품 하나가 조용히 빠진다), 빠짐없이
// 담으라고 조이면 명사구를 가운뎃점으로 이은 나열이 나온다. 실제로 그랬다 — 값은 정확한데
// 사람이 쓴 문서가 아니라 데이터 시트였다.
//
// 그래서 1단계는 사실만 뽑고(프로파일의 추출 프롬프트), 2단계는 **그 사실만 입력으로 받아**
// 문장을 세운다. 두 번째 요청에 자료가 실리지 않는 것이 이 설계의 핵심이다 —
//   * 지어낼 자리가 없다. 손에 있는 것이 1단계가 확정한 값뿐이라 새 사실을 만들 근거가 없다.
//   * 값이 다시 뽑히지 않으므로 **1단계의 숫자가 그대로 살아남는다**(표는 아예 대상이 아니다).
//   * 입력이 작아 문체 지시에 자리를 다 쓸 수 있다. 큰 PDF를 다시 실으면 그 지시가 묻힌다.
//
// ## 두 가지를 하지 않는다
//
// **근거를 다시 묻지 않는다.** 이 요청에는 조각이 실리지 않아 대조할 지도가 없고, 지도 없이
// 받은 근거는 검증할 수 없는 문자열이다(evidence.ts가 애초에 그것을 없애려고 만들어졌다).
// 1단계가 대조를 마친 근거가 그대로 남는다 — 문장을 다듬는다고 그 값의 출처가 바뀌지 않는다.
//
// **빈 값으로 덮지 않는다.** 2단계가 어떤 칸을 못 썼으면 1단계의 값이 그대로 선다. 다듬는
// 일이 지우는 일이 되어서는 안 된다(엔진 전체를 관통하는 규칙 — AI는 값을 지우지 못한다).
//
// Deno API를 쓰지 않는다(works vitest가 이 병합을 직접 돌린다).
// 근거: docs/docs_planning/3_3_5_startup_ai_fill.md §17 · 3_6_1_ma_seller_quick_review.md §5.7

import type { DraftEnvelope } from './envelope.ts'
import type { SchemaNode } from './schema.ts'

/**
 * 한 대상의 작문 패스 규격 — **무엇을 어떤 문체로 다시 쓰는가**만 담는다.
 *
 * 프로파일이 이 값을 갖지 않으면 작문 패스는 아예 돌지 않는다(모델 호출이 늘지 않는다).
 * 대상마다 문장이 필요한지가 다르기 때문이다 — 원장의 칸을 채우는 대상(STARTUP)에서는
 * 1단계의 명사구가 그대로 최종본이고, 읽는 사람을 앞에 둔 문서(퀵 리뷰)에서만 필요하다.
 */
export interface ComposeSpec<K extends string, C> {
  /**
   * 다시 쓰는 절과, **그 절에서 다시 쓰는 칸만** 담은 스키마.
   *
   * 절 전체가 아니라 칸을 고르는 것이 요점이다. 절을 통째로 다시 받으면 회사명·주주·연도 표가
   * 두 번째 모델을 한 번 더 통과하게 되고, 그 왕복에서 숫자 한 자리가 바뀌어도 우리는 알 수
   * 없다. 문장이 아닌 값은 1단계에서 확정되고 여기서는 손대지 않는다.
   */
  cardSchemas: Partial<Record<K, SchemaNode>>
  /** 문체 지시. 사실 묶음(JSON)은 엔진이 앞에 붙이므로 여기 담지 않는다. */
  buildPrompt(cards: K[], subject: string, context: C): string
  /**
   * 이 패스에만 쓸 모델을 담은 환경변수 이름.
   *
   * 두 단계가 서로 다른 일을 하므로 저울도 다르다 — 1단계는 큰 자료를 빠르고 싸게 훑어야
   * 하고, 2단계는 입력이 작은 대신 글을 써야 한다. 값이 없으면 1단계와 같은 모델을 쓴다
   * (설정하지 않은 환경에서 조용히 달라지지 않는다).
   */
  modelEnv?: string
  /** 이 패스의 온도. 없으면 1단계와 같다. */
  temperature?: number
}

/** 작문 패스에 넘길 사실 묶음. 절 이름과 값 그대로이며 우리가 요약하지 않는다. */
export function factsOf<K extends string>(cards: Partial<Record<K, unknown>>): string {
  return JSON.stringify(cards, null, 1)
}

/**
 * 작문 패스의 봉투 스키마 — `evidence`가 없는 것이 1단계와의 유일한 차이다.
 *
 * 자리를 두지 않는 것으로 지시를 대신한다. 프롬프트로 "근거를 적지 마시오"라고 말하는 것보다
 * 스키마에 그 칸이 없는 편이 확실하고, 모델이 굳이 적어 보내도 파싱 단계에서 버려진다.
 */
export function buildComposeSchema<K extends string>(
  cards: readonly K[],
  cardSchemas: Partial<Record<K, SchemaNode>>,
): SchemaNode {
  const cardProps: Record<string, SchemaNode> = {}
  const noteProps: Record<string, SchemaNode> = {}
  for (const k of cards) {
    const node = cardSchemas[k]
    if (!node) continue
    cardProps[k] = node
    noteProps[k] = { type: 'ARRAY', items: { type: 'STRING' } }
  }
  return {
    type: 'OBJECT',
    properties: {
      cards: { type: 'OBJECT', properties: cardProps },
      notes: { type: 'OBJECT', properties: noteProps },
    },
    required: ['cards'],
  }
}

/** 값이 실제로 담겼는가. 빈 문자열·빈 목록은 '못 썼다'이지 '없다'가 아니다. */
function hasValue(v: unknown): boolean {
  if (v == null) return false
  if (Array.isArray(v)) return v.length > 0
  if (typeof v === 'string') return v.trim() !== ''
  if (typeof v === 'object') return Object.values(v as Record<string, unknown>).some(hasValue)
  return true
}

/**
 * 다시 쓸 값이 있는 절만 고른다.
 *
 * 1단계가 비워 둔 절은 보내지 않는다 — 사실이 없는데 문장을 쓰라고 하면 그 요청이 곧
 * 지어내라는 지시가 된다. **이 한 줄이 2단계에서 없는 사실이 생기지 않는 이유다.**
 */
export function composableCards<K extends string>(
  requested: K[],
  cards: Partial<Record<K, unknown>>,
  spec: Pick<ComposeSpec<K, unknown>, 'cardSchemas'>,
  order: readonly K[],
): K[] {
  return order.filter((k) => requested.includes(k) && Boolean(spec.cardSchemas[k]) && hasValue(cards[k]))
}

/**
 * 다시 쓴 문장을 1단계 봉투 위에 얹는다 — **덮어쓰기가 아니라 칸 단위 겹치기**다.
 *
 * 목록형 절(핵심 포인트처럼 절 자체가 배열인 것)만 통째로 갈아 끼운다. 그 절은 제목과 근거
 * 줄이 한 덩어리라 절반만 바꾸면 제목과 내용이 어긋나기 때문이다.
 *
 * 객체형 절에서는 **값이 담긴 칸만** 얹는다. 2단계 스키마에 없던 칸(회사명·주주·표)은 애초에
 * 응답에 오지 않고, 스키마에 있었는데 비어 온 칸은 1단계 값이 남는다.
 */
export function applyCompose<K extends string>(
  base: DraftEnvelope<K>,
  written: DraftEnvelope<K>,
  cards: K[],
  cardShape: Record<K, 'object' | 'array'>,
  maxNotes: number,
): K[] {
  const changed: K[] = []
  for (const key of cards) {
    const next = written.cards[key]
    if (!hasValue(next)) continue

    if (cardShape[key] === 'array') {
      base.cards[key] = next
      changed.push(key)
    } else {
      const before = base.cards[key]
      const merged: Record<string, unknown> =
        before && typeof before === 'object' && !Array.isArray(before)
          ? { ...(before as Record<string, unknown>) }
          : {}
      let touched = false
      for (const [field, value] of Object.entries(next as Record<string, unknown>)) {
        if (!hasValue(value)) continue
        merged[field] = value
        touched = true
      }
      if (!touched) continue
      base.cards[key] = merged
      changed.push(key)
    }

    // 2단계가 남긴 관찰은 1단계 경고 뒤에 붙인다 — 앞에 두면 규격 위반 경고가 밀려난다.
    const extra = written.notes[key] ?? []
    if (extra.length > 0) {
      base.notes[key] = [...(base.notes[key] ?? []), ...extra].slice(0, maxNotes * 2)
    }
  }
  return changed
}
