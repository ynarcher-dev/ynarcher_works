import { describe, expect, it } from 'vitest'
import type { EntityRow } from '@/features/master/entityHooks'
import { applyAiDraft, outcomeSummary, type AiFillEnvelope } from '@/features/startup/startupAiMerge'
import { defaultCardSelection } from '@/features/startup/startupAiCards'

/**
 * 'AI 작성하기' 병합 규칙 회귀 테스트.
 *
 * 여기서 지키는 것은 기능이 아니라 **잃지 않음**이다 — 체크하지 않은 카드, 같은 컬럼을 나눠
 * 쓰는 다른 카드의 키, AI가 근거를 못 찾은 칸이 조용히 비워지는지를 본다. 이 셋이 이 기능에서
 * 되돌릴 수 없는 사고가 나는 유일한 자리다.
 *
 * 근거: docs/docs_planning/3_3_5_startup_ai_fill.md §15
 */

/** 모든 카드에 값이 있는 기존 행. */
function fullRecord(): EntityRow {
  return {
    id: 'S1',
    name: '테스트',
    business_profile: {
      oneLiner: '기존 한 줄',
      businessModel: '기존 BM',
      targetMarket: '기존 시장',
      revenueModel: '기존 수익',
      salesChannel: '기존 채널',
      supplyMode: '기존 공급',
      strengths: ['강점1'],
      improvements: ['보완1'],
      needs: ['필요1'],
    },
    tech_profile: { product: '기존 제품', devStage: 'MVP', coreTech: '기존 기술' },
    team_profile: { founderStrength: '기존 대표', members: [{ name: '홍길동' }], capabilities: ['기존역량'] },
    ip_profile: { rights: [{ kind: '특허', title: '기존특허' }], certifications: [], govProjects: [] },
    business_status: [{ date: '2024-01', content: '기존 연혁' }],
    growth_metrics: {
      traction: [{ metric: 'MAU', period: '2025-01', value: 100 }],
      customers: [{ name: '기존고객' }],
      revenue: [{ year: 2024, revenue: 1000 }],
      finance: [{ year: 2024, assets: 2000 }],
      employee: [{ year: 2024, employeeCount: 5 }],
      investment: [{ date: '2024-03', round: 'Seed' }],
    },
    shareholders: [{ date: '2024-01-01', holders: [{ name: '대표' }] }],
  }
}

const envelope = (cards: AiFillEnvelope['cards']): AiFillEnvelope => ({ cards, notes: {}, evidence: {} })

describe('applyAiDraft — 보존 키 규칙', () => {
  it('트랙션만 채워도 같은 컬럼의 매출·재무·고용·투자는 그대로다', () => {
    const before = fullRecord()
    const { record } = applyAiDraft(
      before,
      envelope({ traction: { traction: [{ metric: 'DAU', period: '2025-06', value: 9 }], customers: [] } }),
      ['traction'],
    )
    const g = record.growth_metrics as Record<string, unknown>
    expect(g.traction).toEqual([{ metric: 'DAU', period: '2025-06', value: 9 }])
    // 나머지 네 목록은 원본과 같은 값이어야 한다 — 여기가 빠지면 표 하나가 통째로 사라진다.
    expect(g.revenue).toEqual([{ year: 2024, revenue: 1000 }])
    expect(g.finance).toEqual([{ year: 2024, assets: 2000 }])
    expect(g.employee).toEqual([{ year: 2024, employeeCount: 5 }])
    expect(g.investment).toEqual([{ date: '2024-03', round: 'Seed' }])
    // 고객은 빈 배열로 왔으므로 기존 값이 남는다(빈 배열은 '없다'가 아니라 '못 찾았다').
    expect(g.customers).toEqual([{ name: '기존고객' }])
  })

  it('비즈니스를 채워도 요약 3축(강점·보완점·필요사항)은 그대로다', () => {
    const { record } = applyAiDraft(fullRecord(), envelope({ business: { oneLiner: '새 한 줄' } }), ['business'])
    const b = record.business_profile as Record<string, unknown>
    expect(b.oneLiner).toBe('새 한 줄')
    expect(b.strengths).toEqual(['강점1'])
    expect(b.improvements).toEqual(['보완1'])
    expect(b.needs).toEqual(['필요1'])
  })

  it('실적 카드 둘을 함께 채워도 서로의 결과를 지우지 않는다', () => {
    const { record } = applyAiDraft(
      fullRecord(),
      envelope({
        revenue: { revenue: [{ year: 2025, revenue: 50 }], finance: [] },
        employee: [{ year: 2025, employeeCount: 12 }],
      }),
      ['revenue', 'employee'],
    )
    const g = record.growth_metrics as Record<string, unknown>
    expect(g.revenue).toEqual([{ year: 2025, revenue: 50 }])
    expect(g.employee).toEqual([{ year: 2025, employeeCount: 12 }])
  })
})

describe('applyAiDraft — 체크하지 않은 카드는 불변', () => {
  it('체크하지 않은 카드의 컬럼은 원본과 같은 값이다', () => {
    const before = fullRecord()
    const { record, outcome } = applyAiDraft(
      before,
      // 체크하지 않은 카드를 모델이 채워 보내도 화면까지 흘리지 않는다.
      envelope({ business: { oneLiner: '새 한 줄' }, tech: { product: '몰래 채운 값' } }),
      ['business'],
    )
    expect(record.tech_profile).toEqual(before.tech_profile)
    expect(record.team_profile).toEqual(before.team_profile)
    expect(record.ip_profile).toEqual(before.ip_profile)
    expect(record.business_status).toEqual(before.business_status)
    expect(record.shareholders).toEqual(before.shareholders)
    expect(outcome.filled).toEqual(['business'])
  })

  it('원본 레코드를 변형하지 않는다(취소하면 원래 값이다)', () => {
    const before = fullRecord()
    const snapshot = JSON.stringify(before)
    applyAiDraft(before, envelope({ business: { oneLiner: '새 한 줄' } }), ['business'])
    expect(JSON.stringify(before)).toBe(snapshot)
  })
})

describe('applyAiDraft — AI의 null은 지우지 않는다', () => {
  it('근거 없는 칸(null·빈 문자열)은 기존 값을 유지한다', () => {
    const { record } = applyAiDraft(
      fullRecord(),
      envelope({ business: { oneLiner: '새 한 줄', businessModel: null, targetMarket: '  ' } }),
      ['business'],
    )
    const b = record.business_profile as Record<string, unknown>
    expect(b.oneLiner).toBe('새 한 줄')
    expect(b.businessModel).toBe('기존 BM')
    expect(b.targetMarket).toBe('기존 시장')
  })

  it('카드 전체가 비면 기존 값을 두고 skipped로 보고한다', () => {
    const before = fullRecord()
    const { record, outcome } = applyAiDraft(before, envelope({ ip: null, timeline: [] }), ['ip', 'timeline'])
    expect(record.ip_profile).toEqual(before.ip_profile)
    expect(record.business_status).toEqual(before.business_status)
    expect(outcome.filled).toEqual([])
    expect(outcome.skipped).toEqual(['ip', 'timeline'])
  })

  it('팀 카드의 목록 3종도 빈 배열이면 기존 목록을 지키고 텍스트만 갈린다', () => {
    const { record } = applyAiDraft(
      fullRecord(),
      envelope({ team: { founderStrength: '새 대표', members: [], advisors: [], capabilities: [] } }),
      ['team'],
    )
    const t = record.team_profile as Record<string, unknown>
    expect(t.founderStrength).toBe('새 대표')
    expect(t.members).toEqual([{ name: '홍길동' }])
    expect(t.capabilities).toEqual(['기존역량'])
  })
})

describe('기본 체크 규칙', () => {
  it('값이 있는 카드는 꺼지고 빈 카드만 켜진다', () => {
    expect(defaultCardSelection(fullRecord())).toEqual([])
    const empty = { id: 'S2', name: '빈 기업' } as EntityRow
    expect(defaultCardSelection(empty)).toHaveLength(10)
  })

  it('카드가 절반만 차 있어도 채워진 카드로 보아 꺼진다', () => {
    const half = { id: 'S3', name: '반쯤', tech_profile: { product: '제품만 있음' } } as EntityRow
    expect(defaultCardSelection(half)).not.toContain('tech')
  })
})

describe('outcomeSummary', () => {
  it('채운 카드와 못 찾은 카드를 함께 말한다', () => {
    const text = outcomeSummary({ filled: ['business'], skipped: ['ip'], notes: {}, evidence: {} })
    expect(text).toContain('비즈니스')
    expect(text).toContain('지식재산·인증')
    expect(text).toContain('확인 후 저장')
  })
})
