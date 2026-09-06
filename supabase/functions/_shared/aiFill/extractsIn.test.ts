import { describe, expect, it } from 'vitest'
import { extractsFromRows, readPendingExtracts } from './extractsIn.ts'

/**
 * 분석 결과 주입의 회귀 테스트.
 *
 * 여기서 지키는 것 셋 — **`ready`만 담는 것**(나머지는 원본 경로로 흘러가야 한다), **조각을
 * 조각인 채로 넘기는 것**(글자로 이어 붙이면 예산을 넘길 때 자료를 통째로 버리게 되고 근거를
 * 되짚을 주소도 사라진다), **요청에 실려 온 것을 다시 되세우는 것**이다. 마지막 것을 놓치면
 * 저장을 거치지 않는 등록 모드가 그대로 구멍이 된다.
 *
 * 근거: docs/docs_planning/3_3_5_startup_ai_fill.md §16.5·§16.6·§16.14
 */

const body = { chunks: [{ kind: 'sheet', location: '시트: 손익', text: '매출\t1200', tables: [] }] }

describe('캐시 행에서 조각 꺼내기', () => {
  it('ready 행만 담는다(original·failed는 옛 경로로 흘러가야 한다)', () => {
    const out = extractsFromRows([
      { attachment_id: 'A1', status: 'ready', body },
      { attachment_id: 'A2', status: 'original', body: null },
      { attachment_id: 'A3', status: 'failed', body: null },
    ])
    expect([...out.keys()]).toEqual(['A1'])
  })

  it('조각을 조각인 채로 넘긴다 — 이어 붙이면 예산을 넘길 때 통째로 버리게 된다', () => {
    const out = extractsFromRows([{ attachment_id: 'A1', status: 'ready', body }])
    expect(out.get('A1')).toEqual([
      { kind: 'sheet', location: '시트: 손익', text: '매출\t1200', tables: [] },
    ])
  })

  it('배열이 아닌 값이 조각인 척 들어오면 그 행을 버린다', () => {
    const out = extractsFromRows([{ attachment_id: 'A1', status: 'ready', body: { chunks: 'not-an-array' } }])
    expect(out.size).toBe(0)
  })

  it('글자가 하나도 없는 결과는 없는 것과 같다(빈 글로 모델을 부르지 않는다)', () => {
    const out = extractsFromRows([
      { attachment_id: 'A1', status: 'ready', body: { chunks: [{ kind: 'text', location: 'x', text: '   ', tables: [] }] } },
    ])
    expect(out.size).toBe(0)
  })
})

describe('등록 모드로 실려 온 결과', () => {
  it('되세운 뒤 담는다(저장을 거치지 않는 경로라 여기가 유일한 관문이다)', () => {
    const out = readPendingExtracts({
      'file:1:계획서.xlsx': {
        name: '계획서.xlsx',
        body: { chunks: [{ kind: 'sheet', location: '시트: A', text: '매출\t10', tables: [] }] },
      },
    })
    expect(out.get('file:1:계획서.xlsx')?.name).toBe('계획서.xlsx')
    expect(out.get('file:1:계획서.xlsx')?.chunks[0].text).toContain('매출')
  })

  it('모양이 어긋난 줄만 버리고 나머지는 담는다', () => {
    const out = readPendingExtracts({
      bad: { name: 'x', body: { chunks: 'not-an-array' } },
      good: { name: 'y', body: { chunks: [{ kind: 'text', location: '본문', text: '읽을 수 있는 글자', tables: [] }] } },
    })
    expect([...out.keys()]).toEqual(['good'])
  })

  it('제어문자와 태그는 여기서도 걷힌다', () => {
    const out = readPendingExtracts({
      k: { name: 'n', body: { chunks: [{ kind: 'text', location: '본문', text: '앞<script>x</script>뒤', tables: [] }] } },
    })
    expect(out.get('k')?.chunks.map((c) => c.text).join('')).not.toContain('<script>')
  })
})
