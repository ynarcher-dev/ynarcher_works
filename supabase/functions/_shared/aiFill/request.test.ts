import { describe, expect, it } from 'vitest'

import { readConcurrency, readThinkingLevel } from './request.ts'

// 이 판정들은 **잘못돼도 조용히 틀린다** — 오타가 섞인 시크릿은 오류가 아니라 다른 값으로
// 동작하고, 그 차이는 요금 고지서에서야 드러난다. 그래서 기본값으로 떨어지는 경로를 못 박는다.

describe('readThinkingLevel', () => {
  it('세 값만 받는다', () => {
    expect(readThinkingLevel('low')).toBe('low')
    expect(readThinkingLevel('medium')).toBe('medium')
    expect(readThinkingLevel('high')).toBe('high')
  })

  it('대소문자·앞뒤 공백은 흡수한다(시크릿은 손으로 적는 값이다)', () => {
    expect(readThinkingLevel(' HIGH ')).toBe('high')
    expect(readThinkingLevel('Medium')).toBe('medium')
  })

  it('비어 있거나 모르는 값이면 low다 — 이 기능이 하는 일은 추론이 아니라 옮겨 적기다', () => {
    expect(readThinkingLevel(undefined)).toBe('low')
    expect(readThinkingLevel('')).toBe('low')
    expect(readThinkingLevel('none')).toBe('low')
    // 공급자가 Flash 계열에서 받지 않는 값. 선택지로 두면 그것을 고른 날 요청이 통째로 죽는다.
    expect(readThinkingLevel('minimal')).toBe('low')
    expect(readThinkingLevel('off')).toBe('low')
  })
})

describe('readConcurrency', () => {
  it('내리는 쪽은 열고 올리는 쪽은 막는다', () => {
    expect(readConcurrency('1')).toBe(1)
    expect(readConcurrency('2')).toBe(2)
    expect(readConcurrency('9')).toBe(4)
  })

  it('값이 없거나 이상하면 기본값이다', () => {
    expect(readConcurrency(undefined)).toBe(3)
    expect(readConcurrency('0')).toBe(3)
    expect(readConcurrency('abc')).toBe(3)
  })
})
