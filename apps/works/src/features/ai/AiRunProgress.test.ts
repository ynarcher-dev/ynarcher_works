import { describe, expect, it } from 'vitest'

import { formatClock } from './AiRunProgress'
import { AI_FILL_LIMITS } from './aiFillClient'

describe('실행 타이머 표기', () => {
  it('m:ss로 세고 소수는 버린다', () => {
    expect(formatClock(0)).toBe('0:00')
    expect(formatClock(999)).toBe('0:00')
    expect(formatClock(61_500)).toBe('1:01')
    expect(formatClock(AI_FILL_LIMITS.maxRunMs)).toBe('2:05')
  })

  it('최대 시간은 서버 상한(125초)과 같다', () => {
    expect(AI_FILL_LIMITS.maxRunMs).toBe(125_000)
  })
})
