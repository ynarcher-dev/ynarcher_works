import { describe, expect, it } from 'vitest'
import { joinNames, memberSummary } from '@/lib/memberLabel'

describe('memberSummary', () => {
  it('인원이 없으면 null', () => {
    expect(memberSummary([])).toBeNull()
  })

  it('1명이면 이름만', () => {
    expect(memberSummary(['김담당'])).toBe('김담당')
  })

  it('2명 이상이면 대표(첫 원소) + 외 N', () => {
    expect(memberSummary(['김담당', '이지원'])).toBe('김담당 외 1')
    expect(memberSummary(['김담당', '이지원', '박지원', '최지원'])).toBe('김담당 외 3')
  })

  it('이름이 비어도 인원 수는 유지한다', () => {
    expect(memberSummary([null, '이지원'])).toBe('알 수 없음 외 1')
    expect(memberSummary(['  ', undefined])).toBe('알 수 없음 외 1')
  })
})

describe('joinNames', () => {
  it('전원을 나열하고, 없으면 null', () => {
    expect(joinNames(['김담당', '이지원'])).toBe('김담당, 이지원')
    expect(joinNames([])).toBeNull()
  })
})
