import { describe, expect, it } from 'vitest'
import { buildIndex, toSourceChunks, type SourceRef } from './chunks.ts'
import { verifyEvidence } from './evidence.ts'

/**
 * 근거 대조의 회귀 테스트.
 *
 * 이 파일이 지키는 것은 하나다 — **구조를 지시하는 것만으로는 아무것도 검증되지 않는다.**
 * `{ chunkId, quote }`를 내라고 해도 모델은 둘 다 지어낼 수 있고, 지어낸 근거는 담당자에게
 * 있는 그대로 '확인된 근거'로 보인다. 그래서 여기서 세 갈래를 갈라 시험한다.
 *   * 확인됨 — 이번 요청에 실린 조각을 가리켰고 인용문도 그 안에 있다.
 *   * 미검증 — 우리가 열지 않은 자료(PDF)를 가리켰다. 대조할 글자가 없을 뿐 지어낸 것이 아니다.
 *   * 버림 — 없는 id이거나, 그 조각에 없는 문장을 인용했다.
 *
 * 근거: docs/docs_planning/3_3_5_startup_ai_fill.md §16.15
 */

const sheet: SourceRef = { id: 's1', key: 'A1', name: '재무.xlsx', attachmentId: 'A1', verifiable: true }
const pdf: SourceRef = { id: 's2', key: 'B1', name: 'IR.pdf', attachmentId: 'B1', verifiable: false }

const chunks = toSourceChunks(sheet, [
  { kind: 'sheet', location: '시트: 손익', text: '2025년\t매출액\t1,200,000,000\n영업이익\t-320,000,000', tables: [] },
])
const index = buildIndex([sheet, pdf], chunks)

describe('확인된 근거', () => {
  it('그 조각에 있는 문장을 인용하면 통과하고, 파일명과 자리는 서버가 붙인다', () => {
    const out = verifyEvidence([{ chunkId: 's1#1', quote: '매출액\t1,200,000,000' }], index)
    expect(out.stats).toEqual({ verified: 1, unverified: 0, rejected: 0 })
    expect(out.evidence[0]).toEqual({
      verified: true,
      fileName: '재무.xlsx',
      location: '시트: 손익',
      quote: '매출액\t1,200,000,000',
      attachmentId: 'A1',
    })
  })

  it('표에서 흔한 표기 차이는 통과시킨다 — 여기서 떨어뜨리면 검증이 잡음이 되고 아무도 안 본다', () => {
    // 원문은 `1,200,000,000`인데 모델은 쉼표 없이 옮기고 탭을 공백으로 바꿔 적는다.
    const out = verifyEvidence([{ chunkId: 's1#1', quote: '매출액 1200000000' }], index)
    expect(out.stats.verified).toBe(1)
  })
})

describe('미검증 근거', () => {
  it('우리가 열지 않은 자료는 자료 id로 가리킬 수 있고, 미검증으로 남는다', () => {
    const out = verifyEvidence([{ chunkId: 's2', quote: '시장 규모 3조원' }], index)
    expect(out.stats).toEqual({ verified: 0, unverified: 1, rejected: 0 })
    expect(out.evidence[0].verified).toBe(false)
    expect(out.evidence[0].fileName).toBe('IR.pdf')
  })

  it('조각으로 세운 자료를 통째로 가리키는 것은 인정하지 않는다', () => {
    // "어디서 봤는지 말하지 않겠다"와 같다. 우리가 열어 조각까지 붙여 보낸 자료다.
    const out = verifyEvidence([{ chunkId: 's1', quote: '매출액' }], index)
    expect(out.stats.rejected).toBe(1)
    expect(out.evidence).toHaveLength(0)
  })
})

describe('버려지는 근거', () => {
  it('이번 요청에 없던 id는 버린다(지어낸 주소다)', () => {
    const out = verifyEvidence([{ chunkId: 's9#3', quote: '매출액' }], index)
    expect(out.stats.rejected).toBe(1)
  })

  it('그 조각에 없는 문장은 버린다 — 검증이 통과 도장이 되면 있으나 마나다', () => {
    const out = verifyEvidence([{ chunkId: 's1#1', quote: '2026년 매출 목표 50억' }], index)
    expect(out.stats.rejected).toBe(1)
    expect(out.evidence).toHaveLength(0)
  })

  it('인용이 없거나 너무 짧으면 버린다(어느 문서에나 있는 글자는 근거가 되지 못한다)', () => {
    expect(verifyEvidence([{ chunkId: 's1#1' }], index).stats.rejected).toBe(1)
    expect(verifyEvidence([{ chunkId: 's1#1', quote: '매' }], index).stats.rejected).toBe(1)
  })

  it('모양이 어긋난 줄은 그 줄만 버린다', () => {
    const out = verifyEvidence([null, 'p.3', { chunkId: 's1#1', quote: '영업이익' }], index)
    expect(out.stats.verified).toBe(1)
  })

  it('배열이 아니면 빈 결과다(모델이 봉투를 통째로 어긋나게 낼 수 있다)', () => {
    expect(verifyEvidence('p.3 재무', index).evidence).toEqual([])
  })
})

describe('상한', () => {
  it('한 카드에 다섯 줄까지만 남긴다(화면이 접어 두는 값이라 길게 받을 이유가 없다)', () => {
    const many = Array.from({ length: 12 }, () => ({ chunkId: 's1#1', quote: '영업이익' }))
    expect(verifyEvidence(many, index).evidence).toHaveLength(5)
  })
})
