import { describe, expect, it } from 'vitest'
import { bizRegNoDigits, bizRegNoError, formatBizRegNo, isValidBizRegNo } from '@/lib/bizRegNo'

/** DB `app.is_valid_biz_reg_no`와 같은 답을 내야 한다 — 실제 원장 값으로 고정한다. */
describe('bizRegNo', () => {
  it('숫자만 남기고 저장 모양으로 맞춘다', () => {
    expect(bizRegNoDigits(' 742-87-02461 ')).toBe('7428702461')
    expect(formatBizRegNo('7428702461')).toBe('742-87-02461')
    expect(formatBizRegNo('742 87 02461')).toBe('742-87-02461')
    // 10자리가 아니면 모양을 만들지 않는다(형식 오류는 bizRegNoError가 답한다).
    expect(formatBizRegNo('12345')).toBe('12345')
    expect(formatBizRegNo('')).toBe('')
  })

  it('체크섬 — 실제 번호는 통과하고 자리를 바꾼 번호는 떨어진다', () => {
    expect(isValidBizRegNo('742-87-02461')).toBe(true)
    expect(isValidBizRegNo('479-88-02430')).toBe(true)
    expect(isValidBizRegNo('120-88-01280')).toBe(true)
    expect(isValidBizRegNo('123-45-67890')).toBe(false)
    expect(isValidBizRegNo('221-81-00102')).toBe(false)
    expect(isValidBizRegNo('742-87-0246')).toBe(false)
  })

  it('빈 값은 오류가 아니고, 자릿수·검증 실패는 각각 다른 문구다', () => {
    expect(bizRegNoError('')).toBeNull()
    expect(bizRegNoError('   ')).toBeNull()
    expect(bizRegNoError('742-87')).toMatch(/10자리/)
    expect(bizRegNoError('123-45-67890')).toMatch(/검증/)
    expect(bizRegNoError('742-87-02461')).toBeNull()
  })
})
