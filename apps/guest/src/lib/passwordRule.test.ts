import { describe, expect, it } from 'vitest'
import { PASSWORD_RULE_TEXT, passwordRuleOk } from '@/lib/passwordRule'

/**
 * 새 비밀번호 사전 검사 — 서버 규칙(`_shared/password.ts`의 `passwordPolicyError`)의 사본이
 * 같은 경계를 말하는지 본다. 어긋나면 화면과 서버의 판정이 갈려 이유 없는 거절로 보인다.
 * 서버 쪽 경계는 guest-auth-login/handler.test.ts가 함께 못박는다.
 */
describe('passwordRuleOk', () => {
  it('영문+숫자 8자 이상을 통과시킨다', () => {
    expect(passwordRuleOk('newPass2026')).toBe(true)
    expect(passwordRuleOk('abcdefg1')).toBe(true)
    // 특수문자는 자유다(요구하지도, 막지도 않는다).
    expect(passwordRuleOk('abc!@#123')).toBe(true)
  })

  it('8자 미만은 막는다 — 경계는 8이다', () => {
    expect(passwordRuleOk('abcdef1')).toBe(false)
    expect(passwordRuleOk('abcdefg1')).toBe(true)
  })

  it('72자를 넘기면 막는다 — 서버 상한과 같은 값이다', () => {
    expect(passwordRuleOk(`${'a'.repeat(71)}1`)).toBe(true)
    expect(passwordRuleOk(`${'a'.repeat(72)}1`)).toBe(false)
  })

  it('한 종류만으로는 통과하지 못한다', () => {
    expect(passwordRuleOk('abcdefghij')).toBe(false)
    expect(passwordRuleOk('0101234567')).toBe(false)
  })

  it('빈 값도 막는다', () => {
    expect(passwordRuleOk('')).toBe(false)
  })

  it('안내 문구가 규칙의 두 축(영문·숫자, 8자)을 모두 말한다', () => {
    expect(PASSWORD_RULE_TEXT).toContain('영문')
    expect(PASSWORD_RULE_TEXT).toContain('숫자')
    expect(PASSWORD_RULE_TEXT).toContain('8자')
  })
})
