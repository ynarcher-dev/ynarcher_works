/**
 * 새 비밀번호 규칙(클라이언트 사전 검사).
 *
 * 판정의 원천은 서버(supabase/functions/_shared/password.ts의 passwordPolicyError)이며,
 * 여기는 제출 전에 같은 규칙을 미리 보여 주기 위한 복사본이다. 서버 규칙을 바꾸면
 * 이 파일과 안내 문구를 함께 맞출 것.
 */
export const PASSWORD_RULE_TEXT =
  '영문과 숫자를 모두 포함해 8자 이상으로, 최초 비밀번호와 다른 값으로 입력해 주세요.'

/**
 * 고정 개시 비밀번호. **여기에 적혀 있어도 비밀이 아니다** — 이 값으로는 세션이 열리지 않고
 * 비밀번호 설정 화면까지만 간다(서버 `_shared/password.ts`가 그 판정을 가진다). 화면에
 * 그대로 찍지 않는 이유는 보안이 아니라 안내의 문제다: 로그인 칸 옆에 값을 적어 두면
 * 담당자가 전달하는 절차가 유명무실해진다.
 */
const INITIAL_PASSWORD = 'ynarcher'

export function passwordRuleOk(pw: string): boolean {
  // 개시 비밀번호 금지는 서버와 같이 대소문자를 접는다 — 금지는 넓게 보는 쪽이 안전하다.
  if (pw.toLowerCase() === INITIAL_PASSWORD) return false
  return pw.length >= 8 && pw.length <= 72 && /[A-Za-z]/.test(pw) && /\d/.test(pw)
}
