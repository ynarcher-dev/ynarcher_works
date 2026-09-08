// [M&A 셀러 퀵 리뷰] 절을 **가로질러** 보는 판정.
//
// 정규화(validate.ts)는 절 하나만 본다. 엔진이 카드마다 따로 부르기 때문이고, 그래야
// 한 절의 규격이 다른 절의 값에 얽히지 않는다. 그런데 그 자리에서는 답할 수 없는 물음이
// 하나 있다 — **같은 문장이 두 절에 앉지 않았는가.**
//
// 실제로 났던 일이라 만든 파일이다. 한줄 요약과 사업내용이 **글자까지 같은 문장**으로 왔다.
// 두 절이 한 요청(overview 묶음)에서 함께 채워지니 모델이 먼저 쓴 문장을 그대로 복사한
// 것이고, 화면에서는 그 둘이 위아래로 붙어 서므로 문서가 스스로를 반복하는 것으로 보였다.
// 그 순간 나머지 절의 값까지 의심받는다.
//
// **고치지 않고 알리기만 한다.** 둘 중 어느 쪽을 다시 써야 하는지는 문서를 본 사람이 정할
// 일이고, 한쪽을 지우면 맞는 값을 잃을 수 있다(값을 고쳐 맞추지 않는다는 이 대상의 규칙과
// 같은 근거다). 경고 한 줄이 담당자가 그 두 줄을 나란히 읽어 볼 신호가 된다.
//
// Deno API를 쓰지 않는다(works vitest가 이 판정을 직접 돌린다).
// 근거: docs/docs_planning/3_6_1_ma_seller_quick_review.md §5.5

import type { CardKey } from './cards.ts'
import type { Warn as EngineWarn } from '../_shared/aiFill/envelope.ts'

type Rec = Record<string, unknown>
type Warn = EngineWarn<CardKey>

const rec = (v: unknown): Rec => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Rec) : {})

/**
 * 대조를 위한 정규화 — 표기 차이만 지운다.
 *
 * 근거 대조(evidence.ts)와 같은 방식이고 이유도 같다. 모델이 한 문장을 복사하면서 쉼표 하나를
 * 빼거나 가운뎃점을 공백으로 바꾸는 일이 잦은데, 그 차이로 중복을 놓치면 이 판정에 뜻이 없다.
 * 반대로 글자 자체는 남긴다 — 지나치게 느슨하면 다른 문장이 같다고 걸린다.
 */
function normalize(value: string): string {
  return value
    .toLowerCase()
    .replace(/[\s 　]+/g, '')
    .replace(/[,，.。·・‧]/g, '')
    .replace(/[()（）[\]{}<>"'“”‘’`~|/\-]/g, '')
}

/**
 * 짧은 문장은 대조하지 않는다.
 *
 * "국내 1위 RTD 하이볼 브랜드" 같은 짧은 명사구는 두 절에 같이 서는 것이 자연스럽다 — 회사를
 * 부르는 이름에 가까워서다. 겹침이 문제가 되는 것은 **한 절을 통째로 옮긴 길이**부터다.
 */
const MIN_COMPARE_CHARS = 24

/** 문자열 한 칸을 읽는다(값이 없거나 짧으면 null). */
function prose(v: unknown): string | null {
  if (typeof v !== 'string') return null
  const s = v.trim()
  return s ? s : null
}

/** 문자열 목록을 읽는다. */
function proseList(v: unknown): string[] {
  return Array.isArray(v) ? v.map(prose).filter((s): s is string => s !== null) : []
}

/**
 * 둘이 같은 문장인가 — 완전히 같거나, 한쪽이 다른 쪽을 통째로 품고 있는가.
 *
 * 품는 경우까지 보는 것은 복사한 뒤 뒤에 한 구절만 덧붙이는 일이 흔하기 때문이다. 그때도
 * 두 줄을 나란히 읽으면 같은 말이 두 번 선 것으로 보인다.
 */
function sameProse(a: string, b: string): boolean {
  const x = normalize(a)
  const y = normalize(b)
  if (x.length < MIN_COMPARE_CHARS || y.length < MIN_COMPARE_CHARS) return false
  return x === y || x.includes(y) || y.includes(x)
}

/** 절 하나에서 서술 칸(문단)과 줄 목록을 꺼낸다. */
function bodyOf(cards: Partial<Record<CardKey, unknown>>, key: CardKey, field: string): string | null {
  return prose(rec(cards[key])[field])
}

/**
 * 절을 가로질러 같은 문장이 앉았는지 본다.
 *
 * 보는 짝은 **화면에서 위아래로 붙어 서는 것들**뿐이다. 떨어져 있는 절이 같은 사실을 다른
 * 각도로 말하는 것은 중복이 아니라 문서의 구성이고(핵심 포인트가 앞 절의 숫자를 다시 인용하는
 * 것이 그렇다), 그것까지 경고하면 경고가 잡음이 되어 아무도 보지 않는다.
 */
export function crossCheckCards(cards: Partial<Record<CardKey, unknown>>, warn: Warn): void {
  const headline = bodyOf(cards, 'summary', 'headline')
  const business = bodyOf(cards, 'basics', 'businessDescription')
  const introBody = bodyOf(cards, 'intro', 'body')

  // 한줄 요약과 사업내용은 주요내용 카드 안에서 두 줄 사이로 붙어 선다.
  if (headline && business && sameProse(headline, business)) {
    warn('basics', '사업내용이 한줄 요약과 같은 문장입니다 — 무엇을 파는지만 남기세요')
  }
  // 요약과 소개 본문은 카드 하나를 사이에 두고 이어 읽힌다.
  if (headline && introBody && sameProse(headline, introBody)) {
    warn('intro', '소개 본문이 한줄 요약과 같은 문장입니다 — 사업 구조를 적으세요')
  }

  // 본문과 그 아래 줄 목록. 같은 카드 안에서 바로 이어 서는 자리라 겹치면 곧바로 보인다.
  for (const [key, field] of [
    ['intro', 'body'],
    ['products', 'body'],
  ] as const) {
    const body = bodyOf(cards, key, field)
    if (!body) continue
    const repeated = proseList(rec(cards[key]).bullets).filter((line) => sameProse(body, line)).length
    if (repeated > 0) {
      warn(key, `추가 사실 ${repeated}줄이 본문과 같은 내용입니다 — 본문에 없는 사실만 남기세요`)
    }
  }
}
