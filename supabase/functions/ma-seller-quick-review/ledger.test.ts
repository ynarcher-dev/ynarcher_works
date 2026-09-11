import { describe, expect, it } from 'vitest'

import { hasFacts, toLedgerFacts } from './ledger.ts'
import { buildPrompt } from './prompts.ts'

// 이 조립에서 틀리면 **틀린 값이 그럴듯하게 선다.** 단위가 백만 배로 어긋나도 표는 멀쩡해
// 보이고, 주주 시점이 섞여도 이름과 숫자는 그대로라 읽는 사람이 알아채지 못한다. 그래서
// 여기서 못 박는 것은 모양이 아니라 **숫자의 뜻**이다.

const ROW = {
  name: '(주)가나다',
  representative: '홍길동',
  founded_on: '2017-03',
  location: '서울 강남구',
  company_form: '주식회사',
  business_profile: {
    oneLiner: 'RTD 음료 제조사',
    businessModel: 'CVS 직공급',
    // AI가 쓰지 않는 요약 3축. 프롬프트에 실리지 않아야 한다.
    strengths: '유통망',
  },
  tech_profile: { product: '캔 하이볼', coreTech: '무균 충전 공법' },
  growth_metrics: {
    revenue: [
      { year: 2024, revenue: 55_700_000_000, operatingProfit: 4_200_000_000, netIncome: null },
      { year: 2023, revenue: 42_400_000_000, operatingProfit: -2_924_000_000, netIncome: -3_000_000_000 },
    ],
    finance: [{ year: 2024, assets: 30_000_000_000, liabilities: 12_000_000_000, equity: 18_000_000_000 }],
    // 퀵 리뷰에 설 자리가 없는 축. 조용히 섞여 들어가면 안 된다.
    traction: [{ year: 2024, mau: 1000 }],
  },
  shareholders: [
    { date: '2024-01-01', holders: [{ name: '창업자', ratio: 100 }] },
    { date: '2026-05-31', holders: [{ name: '기타주주', ratio: 20.5 }, { name: '창업자', ratio: 79.5 }] },
  ],
}

describe('toLedgerFacts', () => {
  it('금액을 원에서 백만원으로 옮긴다 — 이 환산이 빠지면 모든 금액이 백만 배가 된다', () => {
    const f = toLedgerFacts(ROW)
    expect(f.revenue[1]).toEqual({ year: 2024, revenue: 55_700, operatingProfit: 4_200, netIncome: null })
    expect(f.finance[0]).toEqual({ year: 2024, assets: 30_000, liabilities: 12_000, equity: 18_000 })
  })

  it('손실은 음수로 남는다', () => {
    expect(toLedgerFacts(ROW).revenue[0].operatingProfit).toBe(-2_924)
  })

  it('연도 오름차순으로 세운다(표가 오래된 해부터 읽히는 자리다)', () => {
    expect(toLedgerFacts(ROW).revenue.map((r) => r.year)).toEqual([2023, 2024])
  })

  it('주주는 가장 최근 한 시점만, 지분율 큰 순으로', () => {
    const { shareholders } = toLedgerFacts(ROW)
    expect(shareholders.asOf).toBe('2026-05-31')
    expect(shareholders.holders.map((h) => h.name)).toEqual(['창업자', '기타주주'])
  })

  it('퀵 리뷰가 쓰지 않는 칸은 담지 않는다', () => {
    const labels = toLedgerFacts(ROW).descriptions.map((d) => d.label)
    expect(labels).toContain('한 줄 소개')
    expect(labels).not.toContain('강점')
  })

  it('빈 행은 사실이 없다고 답한다 — 빈 표제를 프롬프트에 세우지 않기 위해서다', () => {
    expect(hasFacts(toLedgerFacts({}))).toBe(false)
    expect(hasFacts(toLedgerFacts(ROW))).toBe(true)
  })

  it('연도가 없는 줄은 버린다(어느 해의 값인지 말하지 못한다)', () => {
    const f = toLedgerFacts({ growth_metrics: { revenue: [{ revenue: 1_000_000 }, { year: 2024, revenue: 2_000_000 }] } })
    expect(f.revenue).toEqual([{ year: 2024, revenue: 2, operatingProfit: null, netIncome: null }])
  })
})

describe('buildPrompt + 확정 사실', () => {
  const cards = ['basics', 'financials'] as const

  it('연결이 없으면 확정 사실 자리가 통째로 빠진다', () => {
    expect(buildPrompt([...cards], '(주)가나다', null)).not.toContain('이미 확인된 사실')
  })

  it('값이 있으면 단위와 어긋남 처리 규칙이 함께 선다', () => {
    const prompt = buildPrompt([...cards], '(주)가나다', toLedgerFacts(ROW))
    expect(prompt).toContain('이미 확인된 사실')
    expect(prompt).toContain('손익(백만원)')
    expect(prompt).toContain('55,700')
    // 어긋날 때 무엇을 해야 하는지가 블록과 함께 있어야 한다(절마다 다시 적지 않는다).
    expect(prompt).toContain('확인된 사실과 다름')
    // 원장에서 온 값에 근거를 달면 대조에 실패해 버려진다 — 그 규칙이 빠지면 안 된다.
    expect(prompt).toContain('근거(evidence)를 달지 않습니다')
  })

  it('사실이 하나도 없으면 값이 있어도 자리를 세우지 않는다', () => {
    expect(buildPrompt([...cards], '', toLedgerFacts({}))).not.toContain('이미 확인된 사실')
  })
})
