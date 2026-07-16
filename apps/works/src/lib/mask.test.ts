import { describe, expect, it } from 'vitest'
import { maskEmail, maskPhone } from '@/lib/mask'

describe('maskEmail', () => {
  it('아이디 첫 글자만 남기고 마스킹한다', () => {
    expect(maskEmail('hong@example.com')).toBe('h***@example.com')
  })

  it('빈 값은 대시로 표시한다', () => {
    expect(maskEmail(null)).toBe('-')
    expect(maskEmail('')).toBe('-')
  })

  it('이메일 형식이 아니면 원문을 그대로 반환한다', () => {
    expect(maskEmail('not-an-email')).toBe('not-an-email')
  })
})

describe('maskPhone', () => {
  it('중간 자리를 마스킹한다', () => {
    expect(maskPhone('010-1234-5678')).toBe('010-****-5678')
    expect(maskPhone('01012345678')).toBe('010-****-5678')
  })

  it('빈 값은 대시로 표시한다', () => {
    expect(maskPhone(null)).toBe('-')
  })

  it('자릿수가 부족하면 원문을 그대로 반환한다', () => {
    expect(maskPhone('1234')).toBe('1234')
  })
})
