/**
 * 서버가 거절한 이유를 그대로 보여 준다.
 *
 * RPC·트리거·정책이 던지는 문구에는 판정 근거가 담겨 있다 — '이미 같은 이름의 모듈이
 * 있습니다', '모듈 기간은 제안 기간 또는 운영 기간 내에서만…', '담당자는 사업 담당자 풀에
 * 있는 사용자만…'. 이것을 '저장에 실패했습니다'로 덮으면 담당자는 무엇을 고쳐야 하는지
 * 알 수 없고, 같은 값을 다시 넣어 보는 것 말고 할 수 있는 일이 없어진다.
 *
 * 차단 안내는 접지 않는다는 규칙(왜 못 누르는지)이 실패 문구에도 그대로 적용된다.
 *
 * Supabase 오류는 Error 인스턴스가 아니라 message를 가진 평범한 객체로 오므로
 * instanceof로 거르지 않는다.
 */
export function failureText(e: unknown, fallback: string): string {
  const message = (e as { message?: unknown } | null)?.message
  return typeof message === 'string' && message ? message : fallback
}
