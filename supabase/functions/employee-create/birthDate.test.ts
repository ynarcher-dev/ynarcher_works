import { describe, expect, it } from 'vitest'
import { isValidBirthDate } from './birthDate.ts'

const TODAY = new Date('2026-09-11T00:00:00Z')

describe('isValidBirthDate', () => {
  it('실제 달력 날짜만 받는다', () => {
    expect(isValidBirthDate('1990-01-31', TODAY)).toBe(true)
    expect(isValidBirthDate('2000-02-29', TODAY)).toBe(true)
    expect(isValidBirthDate('1900-02-29', TODAY)).toBe(false)
    expect(isValidBirthDate('1990-13-01', TODAY)).toBe(false)
  })

  it('YYYY-MM-DD 형식과 미래 날짜를 거부한다', () => {
    expect(isValidBirthDate('19900131', TODAY)).toBe(false)
    expect(isValidBirthDate('2026-09-12', TODAY)).toBe(false)
    expect(isValidBirthDate('2026-09-11', TODAY)).toBe(true)
  })
})
