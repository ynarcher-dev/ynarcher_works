import { describe, expect, it } from 'vitest'
import type { ExtractChunk } from '../docParse/types.ts'
import {
  buildIndex,
  chunkBytes,
  renderChunk,
  renderSource,
  selectChunks,
  sourceId,
  toSourceChunks,
  type SourceRef,
} from './chunks.ts'

/**
 * 조각 다루기의 회귀 테스트.
 *
 * 여기서 지키는 것 셋 —
 *   * **예산 안에서는 아무것도 고르지 않는다.** 이 기능이 채우는 카드 상당수는 "연도별 매출
 *     전부·투자 내역 전부"라, 고르는 순간 빠짐없이 뽑는다는 계약이 흔들린다. 선별은 회수를
 *     높이는 수단이 아니라 **버리는 것을 줄이는 수단**으로만 돌아야 한다.
 *   * **골라 담은 뒤에는 문서 순서로 되돌린다.** 점수 순서로 보내면 앞뒤 문맥이 끊기고 같은
 *     조합이 실행마다 다른 요청이 된다.
 *   * **id는 요청 안에서 유일하고 짧다.** 조각마다 프롬프트에 실리는 값이라, 첨부 uuid를
 *     그대로 쓰면 조각 300개에 36자씩 든다.
 *
 * 근거: docs/docs_planning/3_3_5_startup_ai_fill.md §16.14
 */

const ref = (over: Partial<SourceRef> = {}): SourceRef => ({
  id: 's1',
  key: 'A1',
  name: '사업계획서.xlsx',
  attachmentId: 'A1',
  kind: 'other',
  verifiable: true,
  ...over,
})

const raw = (text: string, location = '시트: 손익'): ExtractChunk => ({
  kind: 'sheet',
  location,
  text,
  tables: [],
})

describe('조각 세우기', () => {
  it('자료 순번이 그대로 id가 된다(요청 안에서만 통하면 된다)', () => {
    expect(sourceId(0)).toBe('s1')
    expect(sourceId(4)).toBe('s5')
  })

  it('조각 id는 자료 id + 배열 순번이다', () => {
    const out = toSourceChunks(ref(), [raw('가'), raw('나')])
    expect(out.map((c) => c.id)).toEqual(['s1#1', 's1#2'])
  })

  it('글자가 빈 조각은 세우지 않는다 — 가리킬 수는 있는데 대조할 것이 없는 주소가 된다', () => {
    const out = toSourceChunks(ref(), [raw('가'), raw('   '), raw('다')])
    expect(out.map((c) => c.text)).toEqual(['가', '다'])
    // 빠진 조각의 순번은 **되메우지 않는다**. 되메우면 같은 파일의 같은 조각이 실행마다
    // 다른 id를 갖게 되어, 저장된 근거를 나중에 되짚을 수 없다.
    expect(out.map((c) => c.id)).toEqual(['s1#1', 's1#3'])
  })

  it('머리글에 id와 자리를 함께 적는다 — id는 되짚을 주소, 자리는 모델이 읽을 문맥이다', () => {
    const [c] = toSourceChunks(ref(), [raw('매출\t1200')])
    expect(renderChunk(c)).toBe('[s1#1 | 시트: 손익]\n매출\t1200')
  })

  it('자료명은 조각마다가 아니라 앞에 한 번 선다', () => {
    const chunks = toSourceChunks(ref(), [raw('가'), raw('나')])
    const out = renderSource(ref(), chunks)
    expect(out.startsWith('[자료 s1: 사업계획서.xlsx]')).toBe(true)
    expect(out.match(/사업계획서/g)).toHaveLength(1)
  })
})

describe('예산 안에서 조각 고르기', () => {
  const chunks = toSourceChunks(ref(), [raw('가'.repeat(100)), raw('나'.repeat(100)), raw('다'.repeat(100))])

  it('예산 안에 들면 전부 담고 순위를 매기지 않는다', () => {
    const picked = selectChunks(chunks, 1_000_000, () => {
      throw new Error('예산 안에서는 순위를 묻지 않아야 한다')
    })
    expect(picked.kept).toHaveLength(3)
    expect(picked.dropped).toBe(0)
  })

  it('예산을 넘으면 들어가는 만큼만 담고 몇 개가 빠졌는지 말한다', () => {
    const budget = chunkBytes(chunks[0]) * 2
    const picked = selectChunks(chunks, budget)
    expect(picked.kept).toHaveLength(2)
    expect(picked.dropped).toBe(1)
    expect(picked.bytes).toBeLessThanOrEqual(budget)
  })

  it('순위가 있으면 점수 높은 것부터 담되 순서는 문서 순서로 되돌린다', () => {
    const budget = chunkBytes(chunks[0]) * 2
    // 셋째 조각을 가장 높게 매긴다 — 담기는 것은 1·3이고 서는 순서도 1·3이어야 한다.
    const picked = selectChunks(chunks, budget, (c) => (c.id === 's1#3' ? 2 : c.id === 's1#1' ? 1 : 0))
    expect(picked.kept.map((c) => c.id)).toEqual(['s1#1', 's1#3'])
  })

  it('점수가 0인 조각도 자리가 남으면 담긴다(순위는 버릴 것을 고르는 일이지 거를 일이 아니다)', () => {
    const picked = selectChunks(chunks, 1_000_000, () => 0)
    expect(picked.kept).toHaveLength(3)
  })
})

describe('이번 요청의 지도', () => {
  it('실은 조각과 자료만 담는다 — 근거는 본 것만 가리킬 수 있다', () => {
    const chunks = toSourceChunks(ref(), [raw('가')])
    const index = buildIndex([ref(), ref({ id: 's2', key: 'B1', name: 'IR.pdf', verifiable: false })], chunks)
    expect(index.chunks.get('s1#1')?.text).toBe('가')
    expect(index.sources.get('s2')?.verifiable).toBe(false)
    expect(index.chunks.has('s2#1')).toBe(false)
  })
})
