import { describe, expect, it } from 'vitest'
import { missingCards, planTopup } from './topup.ts'
import { extractsFromRows, readPendingExtracts } from './extractsIn.ts'
import type { CardGroup } from './groups.ts'

/**
 * 보완 호출과 분석 글자 주입의 회귀 테스트.
 *
 * 여기서 지키는 것 둘 — **보완이 한 번을 넘지 않는 것**(빠진 카드가 없으면 아예 나가지 않는다)과
 * **값이 null로 온 카드를 빠진 것으로 세지 않는 것**이다. 뒤엣것을 놓치면 모든 실행이 보완
 * 호출을 한 번씩 더 하게 되고, 그 시간은 이미 손에 든 초안을 돌려주는 데서 빠진다.
 *
 * 근거: docs/docs_planning/3_3_5_startup_ai_fill.md §16.6·§16.10
 */

describe('빠진 카드 고르기', () => {
  it('답이 온 카드는 값이 null이어도 빠진 것이 아니다', () => {
    expect(missingCards(['business', 'revenue'], ['business', 'revenue'], [])).toEqual([])
  })

  it('봉투에 없고 실패하지도 않은 카드만 고른다', () => {
    expect(missingCards(['business', 'revenue', 'team'], ['business'], ['team'])).toEqual(['revenue'])
  })

  it('화면 순서로 세운다(체크한 차례에 따라 요청이 달라지지 않게)', () => {
    expect(missingCards(['revenue', 'business'], [], [])).toEqual(['business', 'revenue'])
  })
})

describe('보완 요청 세우기', () => {
  const groups: CardGroup[] = [
    { cards: ['business', 'summary'], sourceKeys: ['a', 'b'] },
    { cards: ['revenue'], sourceKeys: ['c'] },
  ]

  it('빠진 카드가 없으면 요청을 세우지 않는다', () => {
    expect(planTopup([], groups)).toBeNull()
  })

  it('빠진 카드들이 걸린 묶음의 자료를 합집합으로 모은다', () => {
    expect(planTopup(['business', 'revenue'], groups)).toEqual({
      cards: ['business', 'revenue'],
      sourceKeys: ['a', 'b', 'c'],
    })
  })

  it('가리키는 자료가 없으면 부르지 않는다(근거 없이 물으면 지어낼 자리만 생긴다)', () => {
    expect(planTopup(['ip'], groups)).toBeNull()
  })
})

describe('캐시 행에서 글자 꺼내기', () => {
  const body = { chunks: [{ kind: 'sheet', location: '시트: 손익', text: '매출\t1200', tables: [] }] }

  it('ready 행만 담는다(original·failed는 옛 경로로 흘러가야 한다)', () => {
    const out = extractsFromRows([
      { attachment_id: 'A1', status: 'ready', body },
      { attachment_id: 'A2', status: 'original', body: null },
      { attachment_id: 'A3', status: 'failed', body: null },
    ])
    expect([...out.keys()]).toEqual(['A1'])
    expect(out.get('A1')).toBe('[시트: 손익]\n매출\t1200')
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
    expect(out.get('file:1:계획서.xlsx')?.text).toContain('매출')
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
    expect(out.get('k')?.text).not.toContain('<script>')
  })
})
