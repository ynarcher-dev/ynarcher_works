/**
 * 서버가 적어 보낸 사유를 사람이 읽을 한 문장으로.
 *
 * 예산 규칙은 대부분 DB에서 `raise exception`으로 막히고, 그 문장은 이미 고칠 수 있는 말로
 * 적혀 있다(예산을 넘었습니다 / 승인된 품의만 근거로 쓸 수 있습니다). 화면이 그것을
 * '권한을 확인하세요'로 덮으면 **고칠 수 있는 문제가 권한 문제로 읽히고**, 담당자는
 * 자기가 못 고치는 일이라고 판단해 멈춘다.
 *
 * 사유가 없으면 null이다 — 그때는 부르는 쪽이 자기 맥락의 기본 문장을 쓴다.
 */
export function errorText(e: unknown): string | null {
  if (typeof e === 'string') return e.trim() || null
  if (typeof e !== 'object' || e === null) return null
  const message = (e as { message?: unknown }).message
  if (typeof message !== 'string') return null
  const text = message.trim()
  if (!text) return null
  // PostgREST가 붙이는 기술적 접두사는 사람이 읽을 문장이 아니다.
  return /^(JSON object requested|new row violates|permission denied)/i.test(text)
    ? null
    : text
}
