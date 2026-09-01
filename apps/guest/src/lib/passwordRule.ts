/**
 * 새 비밀번호 규칙(클라이언트 사전 검사).
 *
 * 판정의 원천은 서버(supabase/functions/_shared/password.ts의 passwordPolicyError)이며,
 * 여기는 제출 전에 같은 규칙을 미리 보여 주기 위한 복사본이다. 서버 규칙을 바꾸면
 * 이 파일과 안내 문구를 함께 맞출 것.
 */
export const PASSWORD_RULE_TEXT = '영문과 숫자를 모두 포함해 8자 이상으로 입력해 주세요.'

export function passwordRuleOk(pw: string): boolean {
  return pw.length >= 8 && pw.length <= 72 && /[A-Za-z]/.test(pw) && /\d/.test(pw)
}
