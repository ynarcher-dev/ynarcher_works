import { describe, expect, it } from 'vitest'
import { runPool } from './pool.ts'

/**
 * 병렬 실행의 회귀 테스트.
 *
 * 재는 것은 셋이다 — **정말 동시에 도는가**(순차면 상한 시간을 넘긴다), **상한을 지키는가**
 * (지키지 않으면 요율 제한에 걸려 오히려 느려진다), **한 건의 실패가 나머지를 버리지 않는가**
 * (버리면 부분 성공이라는 계약이 성립하지 않는다).
 */

const tick = () => new Promise((r) => setTimeout(r, 5))

describe('runPool — 동시에 돌되 상한을 지킨다', () => {
  it('상한만큼 함께 돌고 그 이상은 넘지 않는다', async () => {
    let running = 0
    let peak = 0
    await runPool([1, 2, 3, 4, 5, 6], 3, async () => {
      running += 1
      peak = Math.max(peak, running)
      await tick()
      running -= 1
    })
    expect(peak).toBe(3)
  })

  it('항목이 상한보다 적으면 전부 함께 돈다(순차로 떨어지지 않는다)', async () => {
    let peak = 0
    let running = 0
    await runPool([1, 2], 3, async () => {
      running += 1
      peak = Math.max(peak, running)
      await tick()
      running -= 1
    })
    expect(peak).toBe(2)
  })

  it('빈 목록은 아무것도 부르지 않는다', async () => {
    expect(await runPool([], 3, () => Promise.reject(new Error('불리면 안 된다')))).toEqual([])
  })
})

describe('runPool — 한 건의 실패가 나머지를 버리지 않는다', () => {
  it('실패는 값으로 돌아오고 나머지는 그대로 성공한다', async () => {
    const results = await runPool([1, 2, 3], 3, async (n) => {
      if (n === 2) throw new Error('두 번째만 실패')
      return n * 10
    })
    expect(results.map((r) => r.status)).toEqual(['fulfilled', 'rejected', 'fulfilled'])
    expect(results[0]).toMatchObject({ value: 10 })
    expect(results[2]).toMatchObject({ value: 30 })
  })

  it('결과는 먼저 끝난 순서가 아니라 넣은 순서다', async () => {
    // 어느 묶음의 답인지를 index로 맞추므로 순서가 어긋나면 실패 카드가 뒤바뀐다.
    const results = await runPool([30, 10, 20], 3, async (ms) => {
      await new Promise((r) => setTimeout(r, ms))
      return ms
    })
    expect(results.map((r) => (r.status === 'fulfilled' ? r.value : null))).toEqual([30, 10, 20])
  })
})
