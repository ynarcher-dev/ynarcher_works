import { describe, expect, it } from 'vitest'
import { crossCheckCards } from './crossCheck.ts'
import type { CardKey } from './cards.ts'

/**
 * 절을 가로질러 보는 판정의 회귀 테스트.
 *
 * 실제로 났던 일을 그대로 세워 둔다 — 한줄 요약과 사업내용이 **글자까지 같은 문장**으로 왔다.
 * 여기서 함께 지키는 것은 반대편이다: 짧은 명사구가 두 절에 같이 서는 것은 중복이 아니라
 * 회사를 부르는 이름에 가깝다. 그것까지 경고하면 경고가 잡음이 되어 아무도 보지 않는다.
 */

function warnings(cards: Partial<Record<CardKey, unknown>>): string[] {
  const out: string[] = []
  crossCheckCards(cards, (card, line) => out.push(`${card}: ${line}`))
  return out
}

const LONG = '리워드 기반 데이터 비즈니스 플랫폼 픽플리 운영사로 프리랜서 플랫폼 설문 부문 1위를 달성'

describe('crossCheckCards', () => {
  it('사업내용이 한줄 요약과 같은 문장이면 알린다', () => {
    const out = warnings({ summary: { headline: LONG }, basics: { businessDescription: LONG } })
    expect(out).toEqual(['basics: 사업내용이 한줄 요약과 같은 문장입니다 — 무엇을 파는지만 남기세요'])
  })

  it('쉼표·가운뎃점만 다른 복사본도 잡는다(표기 차이로 놓치면 판정에 뜻이 없다)', () => {
    const out = warnings({
      summary: { headline: LONG },
      basics: { businessDescription: LONG.replace(/ /g, ' · ') },
    })
    expect(out).toHaveLength(1)
  })

  it('뒤에 한 구절을 덧붙인 복사본도 잡는다', () => {
    const out = warnings({
      summary: { headline: `${LONG}하고 2024년 매출 2억 원을 달성함` },
      basics: { businessDescription: LONG },
    })
    expect(out).toHaveLength(1)
  })

  it('짧은 명사구가 겹치는 것은 중복이 아니다(회사를 부르는 이름에 가깝다)', () => {
    const out = warnings({
      summary: { headline: '국내 1위 RTD 브랜드' },
      basics: { businessDescription: '국내 1위 RTD 브랜드' },
    })
    expect(out).toEqual([])
  })

  it('다른 각도로 쓴 두 문장은 통과한다', () => {
    const out = warnings({
      summary: { headline: LONG },
      basics: { businessDescription: '설문 참여자 모집 중개 서비스 · CVS 채널 직공급 · 자체 리워드 크레딧 운영' },
    })
    expect(out).toEqual([])
  })

  it('추가 사실이 본문을 다시 적으면 몇 줄인지 함께 알린다', () => {
    const out = warnings({
      intro: { body: LONG, bullets: [LONG, '2024년 등록 프로젝트 2,699건 및 유료 결제 전환 1,425건 달성'] },
    })
    expect(out).toEqual(['intro: 추가 사실 1줄이 본문과 같은 내용입니다 — 본문에 없는 사실만 남기세요'])
  })

  it('절이 비어 있으면 아무 말도 하지 않는다', () => {
    expect(warnings({})).toEqual([])
    expect(warnings({ summary: null, basics: null })).toEqual([])
  })
})
