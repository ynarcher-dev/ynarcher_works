import { describe, expect, it } from 'vitest'
import {
  CARD_KEYS as SERVER_CARD_KEYS,
  CARD_LABELS as SERVER_CARD_LABELS,
} from '../../../../../../supabase/functions/ma-seller-quick-review/cards.ts'
import {
  QUICK_REVIEW_KEYS,
  emptyQuickReview,
  financialSummary,
  growthPct,
  isQuickReviewEmpty,
  isSectionFilled,
  marginPct,
  netDebt,
  readQuickReview,
} from '@/features/mna/parties/quickReview'
import { QUICK_REVIEW_LABEL, applyQuickReviewDraft } from '@/features/mna/parties/quickReviewAi'

/**
 * 퀵 리뷰 회귀 테스트.
 *
 * 여기서 지키는 것 셋 — **화면과 서버가 같은 절 목록을 본다**, **파생값은 표에서 나온다**,
 * **AI 초안은 값을 지우지 못한다**. 셋 다 어긋나도 화면은 오류 없이 그럴듯하게 서므로
 * (없는 절을 채우는 요청 · 옛 비율 · 조용히 비워진 절) 테스트가 아니면 드러날 자리가 없다.
 */

describe('절 목록은 화면과 서버가 한 벌이다', () => {
  it('키와 순서가 서버 cards.ts와 같다', () => {
    // 순서까지 보는 이유는 그것이 곧 요청 순서이기 때문이다 — 갈리면 같은 조합인데
    // 서버가 다른 프롬프트를 만든다.
    expect([...QUICK_REVIEW_KEYS]).toEqual([...SERVER_CARD_KEYS])
  })

  it('라벨도 같다 — 결과 안내가 서버 오류 메시지와 다른 이름을 부르지 않는다', () => {
    expect(QUICK_REVIEW_LABEL).toEqual(SERVER_CARD_LABELS)
  })
})

describe('파생값은 표에서 계산된다', () => {
  it('성장률은 앞 해가 없거나 0이면 계산하지 않는다', () => {
    expect(growthPct(55734, 42468)).toBeCloseTo(31.24, 1)
    expect(growthPct(100, null)).toBeNull()
    expect(growthPct(100, 0)).toBeNull()
  })

  it('적자에서의 성장률은 앞 해의 절대값을 기준으로 본다', () => {
    // -100 → -50은 손실이 절반으로 준 것이라 +50%다. 부호를 그대로 나누면 -50%가 되어
    // 개선을 악화로 읽는다.
    expect(growthPct(-50, -100)).toBeCloseTo(50, 5)
  })

  it('이익률은 순매출이 없으면 계산하지 않는다', () => {
    expect(marginPct(18763, 55734)).toBeCloseTo(33.66, 1)
    expect(marginPct(100, null)).toBeNull()
    expect(marginPct(100, 0)).toBeNull()
  })

  it('Net debt는 이자부채 − 현금이고, 한쪽이 비면 계산하지 않는다', () => {
    const row = readQuickReview({
      financials: { bs: [{ fiscalYear: 2025, cash: 206, interestBearingDebt: 7398 }] },
    }).financials.bs[0]!
    expect(netDebt(row)).toBe(7192)
    expect(netDebt({ ...row, cash: null })).toBeNull()
  })

  it('요약재무는 두 표의 이른 쪽 연도를 기준으로 삼는다', () => {
    // 재무상태표만 최신이면 그 해의 손익이 없다. 늦은 쪽을 적으면 연도만 최신이 된다.
    const qr = readQuickReview({
      financials: {
        pnl: [{ fiscalYear: 2024, netRevenue: 42468 }],
        bs: [{ fiscalYear: 2025, totalAssets: 34262 }],
      },
    })
    expect(financialSummary(qr.financials)?.fiscalYear).toBe(2024)
  })
})

describe('읽기는 옛 행과 깨진 값을 그대로 통과시키지 않는다', () => {
  it('칸 자체가 없는 옛 행도 빈 문서로 선다', () => {
    const qr = readQuickReview(null)
    expect(isQuickReviewEmpty(qr)).toBe(true)
    expect(qr.financials.pnl).toEqual([])
  })

  it('연도가 없는 행은 표에서 빠지고 남은 행은 연도순으로 선다', () => {
    const qr = readQuickReview({
      financials: {
        pnl: [{ fiscalYear: 2025 }, { netRevenue: 1 }, { fiscalYear: 2023 }],
      },
    })
    expect(qr.financials.pnl.map((r) => r.fiscalYear)).toEqual([2023, 2025])
  })

  it('이름 없는 주주는 담지 않는다 — 무엇의 지분율인지 말하지 못한다', () => {
    const qr = readQuickReview({ basics: { shareholders: [{ ratio: 10 }, { name: '박상재', ratio: 53.5 }] } })
    expect(qr.basics.shareholders).toEqual([{ name: '박상재', ratio: 53.5 }])
  })
})

describe('AI 초안은 값을 지우지 못한다', () => {
  const current = readQuickReview({
    summary: { headline: '손으로 적은 요약' },
    valuation: { bullets: ['EV/EBITDA 8배 적용 시 EV 960억'] },
  })

  it('체크하지 않은 절은 건드리지 않는다', () => {
    const { review, outcome } = applyQuickReviewDraft(
      current,
      { cards: { summary: { headline: 'AI가 쓴 요약' } }, notes: {}, evidence: {} },
      ['summary'],
    )
    expect(review.summary.headline).toBe('AI가 쓴 요약')
    // Valuation은 체크하지 않았으므로 그대로다.
    expect(review.valuation.bullets).toEqual(['EV/EBITDA 8배 적용 시 EV 960억'])
    expect(outcome.filled).toEqual(['summary'])
  })

  it('근거를 못 찾은 절은 기존 값을 그대로 두고 "못 찾음"으로 센다', () => {
    const { review, outcome } = applyQuickReviewDraft(
      current,
      { cards: { valuation: { bullets: [] } }, notes: {}, evidence: {} },
      ['valuation'],
    )
    expect(review.valuation.bullets).toEqual(['EV/EBITDA 8배 적용 시 EV 960억'])
    expect(outcome.skipped).toEqual(['valuation'])
    expect(outcome.filled).toEqual([])
  })

  it('요청이 실패한 절은 "못 찾음"과 갈라 센다', () => {
    // 뭉치면 담당자가 실패한 절까지 "자료에 없구나"로 읽고 다시 시도하지 않는다.
    const { outcome } = applyQuickReviewDraft(
      current,
      {
        cards: {},
        notes: {},
        evidence: {},
        failedCards: [{ keys: ['financials'], message: 'AI 요청이 몰려 거절됐습니다.' }],
      },
      ['financials'],
    )
    expect(outcome.skipped).toEqual([])
    expect(outcome.failed[0]?.keys).toEqual(['financials'])
  })
})

describe('절이 채워졌는지 판정', () => {
  it('빈 문서는 어느 절도 채워지지 않았다', () => {
    const qr = emptyQuickReview()
    for (const key of QUICK_REVIEW_KEYS) expect(isSectionFilled(qr, key)).toBe(false)
  })

  it('절반만 찬 절도 채워진 것으로 본다 — 그 절반은 사람이 적은 값이다', () => {
    const qr = readQuickReview({ basics: { representative: '박상재' } })
    expect(isSectionFilled(qr, 'basics')).toBe(true)
    expect(isSectionFilled(qr, 'intro')).toBe(false)
  })
})
