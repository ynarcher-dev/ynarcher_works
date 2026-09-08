import { describe, expect, it } from 'vitest'
import { applyCompose, buildComposeSchema, composableCards } from './compose.ts'
import type { DraftEnvelope } from './envelope.ts'

/**
 * 작문 패스 회귀 테스트.
 *
 * 여기서 지키는 것은 **다듬는 일이 지우는 일이 되지 않는다**는 규칙 하나다. 2단계는 1단계가
 * 확정한 사실 위에 문장만 얹으므로, 이 병합이 한 칸이라도 넘치게 덮으면 그 순간 값이 조용히
 * 사라진다 — 담당자에게는 오류가 아니라 '왜인지 비어 있는 칸'으로만 보인다.
 */

type K = 'summary' | 'basics' | 'financials' | 'highlights'

const SHAPE: Record<K, 'object' | 'array'> = {
  summary: 'object',
  basics: 'object',
  financials: 'object',
  highlights: 'array',
}

const env = (cards: Partial<Record<K, unknown>>, notes: Partial<Record<K, string[]>> = {}): DraftEnvelope<K> => ({
  cards,
  notes,
  evidence: {},
})

describe('composableCards', () => {
  const spec = { cardSchemas: { summary: { type: 'OBJECT' }, basics: { type: 'OBJECT' } } }
  const order: readonly K[] = ['summary', 'basics', 'financials', 'highlights']

  it('1단계가 비워 둔 절은 보내지 않는다(사실 없이 문장을 쓰라는 지시가 된다)', () => {
    const cards = { summary: { headline: null }, basics: { companyName: '알투씨' } }
    expect(composableCards(['summary', 'basics'], cards, spec, order)).toEqual(['basics'])
  })

  it('스키마가 없는 절은 다시 쓰지 않는다(표는 값이 서는 자리다)', () => {
    const cards = { financials: { pnl: [{ fiscalYear: 2025 }] } }
    expect(composableCards(['financials'], cards, spec, order)).toEqual([])
  })

  it('체크하지 않은 절은 대상이 아니다', () => {
    const cards = { summary: { headline: '한 줄' }, basics: { companyName: '알투씨' } }
    expect(composableCards(['summary'], cards, spec, order)).toEqual(['summary'])
  })

  it('요청 순서가 아니라 문서 순서로 세운다(같은 조합이면 같은 요청이어야 한다)', () => {
    const cards = { summary: { headline: '한 줄' }, basics: { companyName: '알투씨' } }
    expect(composableCards(['basics', 'summary'], cards, spec, order)).toEqual(['summary', 'basics'])
  })
})

describe('applyCompose', () => {
  it('객체형 절에서는 다시 쓴 칸만 얹고 나머지 값은 지킨다', () => {
    const base = env({ basics: { companyName: '㈜알투씨컴퍼니', businessDescription: '옛 문장', shareholders: [{ name: '김동호' }] } })
    const changed = applyCompose(base, env({ basics: { businessDescription: '새 문장' } }), ['basics'], SHAPE, 5)

    expect(changed).toEqual(['basics'])
    expect(base.cards.basics).toEqual({
      companyName: '㈜알투씨컴퍼니',
      businessDescription: '새 문장',
      shareholders: [{ name: '김동호' }],
    })
  })

  it('빈 값으로 덮지 않는다 — 못 쓴 칸은 1단계 문장이 남는다', () => {
    const base = env({ basics: { businessDescription: '옛 문장', note: '단서' } })
    const changed = applyCompose(base, env({ basics: { businessDescription: null, note: '' } }), ['basics'], SHAPE, 5)

    expect(changed).toEqual([])
    expect(base.cards.basics).toEqual({ businessDescription: '옛 문장', note: '단서' })
  })

  it('빈 목록도 덮지 않는다(모델이 그 절을 못 썼다는 뜻이다)', () => {
    const base = env({ highlights: [{ title: '시장 지위', bullets: ['점유율 61.4%'] }] })
    applyCompose(base, env({ highlights: [] }), ['highlights'], SHAPE, 5)

    expect(base.cards.highlights).toEqual([{ title: '시장 지위', bullets: ['점유율 61.4%'] }])
  })

  it('목록형 절은 통째로 갈아 끼운다(제목과 근거 줄이 한 덩어리다)', () => {
    const base = env({ highlights: [{ title: '옛 제목', bullets: ['옛 줄'] }] })
    const next = [{ title: '압도적 시장 지배력 — 카테고리 선점', bullets: ['점유율 61.4% → 가격 결정력'] }]
    const changed = applyCompose(base, env({ highlights: next }), ['highlights'], SHAPE, 5)

    expect(changed).toEqual(['highlights'])
    expect(base.cards.highlights).toEqual(next)
  })

  it('근거는 건드리지 않는다 — 문장을 다듬어도 그 값의 출처는 그대로다', () => {
    const base = env({ summary: { headline: '옛 줄' } })
    base.evidence.summary = [
      { verified: true, fileName: 'IR.pdf', location: 'p.3', quote: '점유율 61.4%', attachmentId: null },
    ]
    applyCompose(base, env({ summary: { headline: '새 줄' } }), ['summary'], SHAPE, 5)

    expect(base.evidence.summary).toHaveLength(1)
  })

  it('2단계 경고는 1단계 경고 뒤에 붙는다', () => {
    const base = env({ summary: { headline: '옛 줄' } }, { summary: ['1단계 경고'] })
    applyCompose(base, env({ summary: { headline: '새 줄' } }, { summary: ['2단계 경고'] }), ['summary'], SHAPE, 5)

    expect(base.notes.summary).toEqual(['1단계 경고', '2단계 경고'])
  })
})

describe('buildComposeSchema', () => {
  it('근거 칸을 두지 않는다 — 조각을 싣지 않아 대조할 지도가 없다', () => {
    const schema = buildComposeSchema(['summary'], { summary: { type: 'OBJECT' } })
    expect(Object.keys(schema.properties ?? {})).toEqual(['cards', 'notes'])
  })

  it('다시 쓰지 않는 절은 스키마에도 없다(자리가 있으면 모델은 채우려 한다)', () => {
    const schema = buildComposeSchema(['summary', 'financials'] as K[], { summary: { type: 'OBJECT' } })
    expect(Object.keys(schema.properties?.cards.properties ?? {})).toEqual(['summary'])
  })
})
