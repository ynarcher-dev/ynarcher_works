import { describe, expect, it } from 'vitest'
import { applyAiDraft, type AiFillEnvelope } from '@/features/startup/startupAiMerge'
import {
  buildCardSnapshot,
  toCardState,
  toFormValues,
  type AiCardState,
} from '@/features/startup/startupAiSnapshot'
import { defaultCardSelection } from '@/features/startup/startupAiCards'
import type { StartupDetailFormValues } from '@/features/startup/startupFormValues'

/**
 * 폼 값 ↔ 카드 컬럼 왕복 회귀 테스트.
 *
 * 'AI 작성하기'가 조회 화면에서 편집 폼으로 옮겨 오면서 병합의 기준이 **원장 행에서 지금 폼에
 * 적힌 값으로** 바뀌었다. 그래서 새로 생긴 위험은 병합 규칙이 아니라 왕복이다 — 폼 값을 행
 * 모양으로 세웠다가 되돌리는 사이에 칸 하나가 새면, 담당자가 방금 적은 줄이 AI를 한 번 돌린
 * 대가로 사라진다.
 */

function formValues(over: Partial<StartupDetailFormValues> = {}): StartupDetailFormValues {
  return {
    name: '테스트',
    representative: '김대표',
    company_form: '주식회사',
    founded_on: '2020-01-01',
    biz_reg_no: '123-45-67890',
    stage: 'Seed',
    management_status: 'sourced',
    pool_status: '',
    discovery_source: '데모데이',
    location: '서울',
    address_detail: '강남구',
    email: 'a@b.com',
    phone: '01012345678',
    oneLiner: '손으로 적은 한 줄',
    businessModel: '',
    targetMarket: '',
    revenueModel: '',
    salesChannel: '',
    supplyMode: '',
    product: '손으로 적은 제품',
    devStage: 'MVP',
    coreTech: '',
    devInsourcing: '',
    differentiator: '',
    founderStrength: '',
    orgComposition: '',
    hiringPlan: '',
    members: [{ name: '홍길동', role: 'CTO', background: '', employment: '', joinedAt: '', hasEquity: true }],
    advisors: [],
    ...over,
  }
}

function cardState(over: Partial<AiCardState> = {}): AiCardState {
  return {
    capabilities: ['기존역량'],
    ip: { rights: [{ kind: '특허', title: '기존특허' }], certifications: [], govProjects: [] },
    growth: {
      finance: [{ year: 2024, assets: 100 }],
      revenue: [{ year: 2024, revenue: 200 }],
      employee: [{ year: 2024, employeeCount: 3 }],
      investment: [{ date: '2024-03', round: 'Seed' }],
      traction: [{ metric: 'MAU', period: '2025-01', value: 10 }],
      customers: [{ name: '고객사' }],
    },
    businessStatus: [{ date: '2024-01', content: '설립' }],
    shareholders: [{ date: '2024-01-01', holders: [{ name: '대표', percentage: 100 }] }],
    summary: { strengths: ['강점1'], improvements: [], needs: [] },
    ...over,
  }
}

const envelope = (cards: AiFillEnvelope['cards']): AiFillEnvelope => ({ cards, notes: {}, evidence: {} })

describe('왕복 — 초안 없이 돌려도 값이 그대로다', () => {
  it('폼 값을 행으로 세웠다가 되돌려도 카드 값이 같다', () => {
    const v = formValues()
    const s = cardState()
    const snap = buildCardSnapshot(v, s)
    const back = toFormValues(snap, v)
    expect(back.oneLiner).toBe('손으로 적은 한 줄')
    expect(back.product).toBe('손으로 적은 제품')
    expect(back.devStage).toBe('MVP')
    expect(back.members).toEqual(v.members)
    expect(toCardState(snap, s)).toEqual(s)
  })

  it('카드 밖 값(이름·연락처·구분)은 왕복에 실리지 않고 그대로 흘러간다', () => {
    const v = formValues()
    const back = toFormValues(buildCardSnapshot(v, cardState()), v)
    expect(back.name).toBe('테스트')
    expect(back.email).toBe('a@b.com')
    expect(back.phone).toBe('01012345678')
    expect(back.management_status).toBe('sourced')
    expect(back.discovery_source).toBe('데모데이')
  })
})

describe('저장하지 않은 입력을 지키는가', () => {
  it('AI가 채운 카드 밖에서 방금 적은 값은 남는다', () => {
    const v = formValues()
    const s = cardState()
    // 트랙션만 채운다 — 손으로 적은 한 줄 소개·제품과 나머지 표는 그대로여야 한다.
    const merged = applyAiDraft(
      buildCardSnapshot(v, s),
      envelope({ traction: { traction: [{ metric: 'DAU', period: '2025-06', value: 5 }], customers: [] } }),
      ['traction'],
    )
    const back = toFormValues(merged.record, v)
    expect(back.oneLiner).toBe('손으로 적은 한 줄')
    expect(back.product).toBe('손으로 적은 제품')

    const nextState = toCardState(merged.record, s)
    expect(nextState.growth.traction).toEqual([{ metric: 'DAU', period: '2025-06', value: 5 }])
    expect(nextState.growth.revenue).toEqual([{ year: 2024, revenue: 200 }])
    expect(nextState.growth.customers).toEqual([{ name: '고객사' }])
    expect(nextState.ip).toEqual(s.ip)
  })

  it('AI가 채운 카드 안에서도 근거 없는 칸은 방금 적은 값을 지운다', () => {
    const v = formValues()
    const merged = applyAiDraft(
      buildCardSnapshot(v, cardState()),
      // 제품은 새로 오고 개발 단계는 근거가 없다 → 손으로 고른 MVP가 남아야 한다.
      envelope({ tech: { product: 'AI가 읽은 제품', devStage: null } }),
      ['tech'],
    )
    const back = toFormValues(merged.record, v)
    expect(back.product).toBe('AI가 읽은 제품')
    expect(back.devStage).toBe('MVP')
  })

  it('요약 3축은 AI 대상이 아니므로 왕복에서도 손대지 않는다', () => {
    const s = cardState()
    const merged = applyAiDraft(
      buildCardSnapshot(formValues(), s),
      envelope({ business: { oneLiner: '새 한 줄' } }),
      ['business'],
    )
    expect((merged.record.business_profile as Record<string, unknown>).strengths).toEqual(['강점1'])
    expect(toCardState(merged.record, s).summary).toEqual(s.summary)
  })
})

describe('기본 체크는 저장값이 아니라 화면 값을 본다', () => {
  it('폼에 적기만 하고 저장하지 않은 카드도 꺼진다', () => {
    // 원장은 비어 있어도 폼에 한 줄 소개·제품이 적혀 있으면 그 두 카드는 지킬 대상이다.
    const snap = buildCardSnapshot(formValues(), {
      capabilities: [],
      ip: { rights: [], certifications: [], govProjects: [] },
      growth: { finance: [], revenue: [], employee: [], investment: [], traction: [], customers: [] },
      businessStatus: [],
      shareholders: [],
      summary: { strengths: [], improvements: [], needs: [] },
    })
    const picked = defaultCardSelection(snap)
    expect(picked).not.toContain('business')
    expect(picked).not.toContain('tech')
    expect(picked).not.toContain('team')
    expect(picked).toContain('revenue')
    expect(picked).toContain('shareholders')
  })
})
