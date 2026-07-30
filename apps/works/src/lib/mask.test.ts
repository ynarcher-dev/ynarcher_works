import { describe, expect, it } from 'vitest'
import { maskBy, maskEmail, maskName, maskPhone } from '@/lib/mask'

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

describe('maskName', () => {
  it('첫 글자와 끝 글자만 남긴다', () => {
    expect(maskName('홍길동')).toBe('홍*동')
    expect(maskName('남궁민수')).toBe('남**수')
  })

  it('두 글자 이름은 뒤 한 글자를 가린다', () => {
    expect(maskName('김철')).toBe('김*')
  })

  it('한 글자 이름과 빈 값은 그대로 둔다', () => {
    expect(maskName('김')).toBe('김')
    expect(maskName(null)).toBe('-')
    expect(maskName('   ')).toBe('-')
  })

  it('"외 N" 꼬리와 쉼표 목록은 이름 부분만 가린다', () => {
    expect(maskName('홍길동 외 2')).toBe('홍*동 외 2')
    expect(maskName('홍길동, 김철수')).toBe('홍*동, 김*수')
  })
})

describe('maskBy', () => {
  it('필드 종류에 맞는 마스킹을 적용한다', () => {
    expect(maskBy('name', '홍길동')).toBe('홍*동')
    expect(maskBy('email', 'hong@example.com')).toBe('h***@example.com')
    expect(maskBy('phone', '010-1234-5678')).toBe('010-****-5678')
  })
})
