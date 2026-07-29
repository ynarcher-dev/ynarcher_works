import { describe, expect, it } from 'vitest'
import { formatPaidRate, formatThousands, toNum } from '@/features/fund/capitalCallDraft'

describe('formatPaidRate — 납입률 = 총 실 납입액 ÷ 총 약정액', () => {
  it('납입이 없으면 0%', () => {
    expect(formatPaidRate(0, 50_000_000_000)).toBe('0%')
  })

  it('약정액이 0이면 0%(0으로 나누지 않는다)', () => {
    expect(formatPaidRate(1_000, 0)).toBe('0%')
  })

  it('10% 이상은 정수로 반올림', () => {
    expect(formatPaidRate(18_000_000_000, 50_000_000_000)).toBe('36%')
    expect(formatPaidRate(50_000_000_000, 50_000_000_000)).toBe('100%')
  })

  it('1~10%는 소수 첫째 자리', () => {
    expect(formatPaidRate(1_500_000_000, 50_000_000_000)).toBe('3.0%')
  })

  it('1% 미만도 0%로 뭉개지 않는다 — 500억 대비 3,700만', () => {
    expect(formatPaidRate(37_000_000, 50_000_000_000)).toBe('0.07%')
  })

  it('0.01% 미만은 값이 있음을 남긴다', () => {
    expect(formatPaidRate(1_000, 50_000_000_000)).toBe('<0.01%')
  })
})

describe('금액 입력 헬퍼', () => {
  it('숫자만 남겨 천단위 콤마를 찍는다', () => {
    expect(formatThousands('37000000')).toBe('37,000,000')
    expect(formatThousands('3a7,0b00')).toBe('37,000')
    expect(formatThousands('')).toBe('')
  })

  it('콤마를 제거해 숫자로 되돌린다(빈값=0)', () => {
    expect(toNum('37,000,000')).toBe(37_000_000)
    expect(toNum('')).toBe(0)
  })
})
