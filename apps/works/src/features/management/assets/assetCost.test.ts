import { describe, expect, it } from 'vitest'
import {
  annualizedAmount,
  billingPeriods,
  contractTotal,
  formatCycleAmount,
  formatPeriods,
  summarizeCosts,
  type CostBasis,
} from '@/features/management/assets/assetCost'

/** 월 55,000원 구독을 2026-01-01에 개시해 2027-12-31에 만료(24회차). */
const monthly: CostBasis = {
  amount: 55000,
  billingCycle: 'MONTHLY',
  acquiredOn: '2026-01-01',
  returnDue: '2027-12-31',
}

/** 연 660,000원 구독을 같은 기간으로(2회차). */
const yearly: CostBasis = { ...monthly, amount: 660000, billingCycle: 'YEARLY' }

/** 완납 노트북 — 기간이 없어도 계산이 성립해야 한다. */
const oneTime: CostBasis = {
  amount: 2500000,
  billingCycle: 'ONE_TIME',
  acquiredOn: '2026-03-01',
  returnDue: null,
}

describe('billingPeriods', () => {
  it('완납은 언제나 한 번이다(기간을 보지 않는다)', () => {
    expect(billingPeriods(oneTime)).toBe(1)
    expect(billingPeriods({ ...oneTime, acquiredOn: null })).toBe(1)
  })

  it('월 구독은 결제일이 돌아온 횟수를 센다', () => {
    expect(billingPeriods(monthly)).toBe(24)
    expect(billingPeriods({ ...monthly, returnDue: '2026-01-31' })).toBe(1)
    // 1/15 개시 → 2/14 만료는 결제일이 한 번만 돌아왔다.
    expect(billingPeriods({ ...monthly, acquiredOn: '2026-01-15', returnDue: '2026-02-14' })).toBe(1)
    expect(billingPeriods({ ...monthly, acquiredOn: '2026-01-15', returnDue: '2026-02-15' })).toBe(2)
  })

  it('연 구독도 같은 방식으로 센다', () => {
    expect(billingPeriods(yearly)).toBe(2)
    expect(billingPeriods({ ...yearly, returnDue: '2026-12-31' })).toBe(1)
  })

  it('기간을 모르거나 뒤집혀 있으면 null이다 — 0으로 접지 않는다', () => {
    expect(billingPeriods({ ...monthly, returnDue: null })).toBeNull()
    expect(billingPeriods({ ...monthly, acquiredOn: null })).toBeNull()
    expect(billingPeriods({ ...monthly, returnDue: '2025-12-31' })).toBeNull()
  })
})

describe('annualizedAmount', () => {
  it('월 구독은 12배, 연 구독·완납은 그대로', () => {
    expect(annualizedAmount(monthly)).toBe(660000)
    expect(annualizedAmount(yearly)).toBe(660000)
    expect(annualizedAmount(oneTime)).toBe(2500000)
  })

  it('금액이 없으면 계산하지 않는다', () => {
    expect(annualizedAmount({ ...monthly, amount: null })).toBeNull()
  })

  it('주기가 달라도 연 환산은 같은 자로 비교된다', () => {
    expect(annualizedAmount(monthly)).toBe(annualizedAmount(yearly))
  })
})

describe('contractTotal', () => {
  it('회차 × 금액이다', () => {
    expect(contractTotal(monthly)).toBe(55000 * 24)
    expect(contractTotal(yearly)).toBe(660000 * 2)
    expect(contractTotal(oneTime)).toBe(2500000)
  })

  it('기간을 모르는 구독은 총액도 알 수 없다', () => {
    expect(contractTotal({ ...monthly, returnDue: null })).toBeNull()
  })
})

describe('표기', () => {
  it('금액에 주기 단위를 붙인다', () => {
    expect(formatCycleAmount(55000, 'MONTHLY')).toBe('55,000/월')
    expect(formatCycleAmount(660000, 'YEARLY')).toBe('660,000/년')
    expect(formatCycleAmount(2500000, 'ONE_TIME')).toBe('2,500,000')
    expect(formatCycleAmount(null, 'MONTHLY')).toBe('—')
  })

  it('회차는 구독일 때만 적는다', () => {
    expect(formatPeriods(monthly)).toBe('24개월')
    expect(formatPeriods(yearly)).toBe('2년')
    expect(formatPeriods(oneTime)).toBeNull()
    expect(formatPeriods({ ...monthly, returnDue: null })).toBeNull()
  })
})

describe('summarizeCosts', () => {
  it('연 환산과 계약 총액을 각각 합친다', () => {
    const s = summarizeCosts([monthly, yearly, oneTime])
    expect(s.count).toBe(3)
    expect(s.annualized).toBe(660000 + 660000 + 2500000)
    expect(s.total).toBe(55000 * 24 + 660000 * 2 + 2500000)
    expect(s.unknown).toBe(0)
  })

  it('계산할 수 없는 행은 합계에서 빼고 그 건수를 알린다', () => {
    const s = summarizeCosts([monthly, { ...monthly, amount: null }, { ...monthly, returnDue: null }])
    expect(s.annualized).toBe(660000 * 2) // 금액 없는 한 건만 빠진다
    expect(s.total).toBe(55000 * 24) // 기간 없는 건도 총액에서 빠진다
    expect(s.unknown).toBe(2)
  })

  it('빈 선택은 0이다', () => {
    expect(summarizeCosts([])).toEqual({ count: 0, annualized: 0, total: 0, unknown: 0 })
  })
})
