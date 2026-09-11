/**
 * 사업자등록번호 — 스타트업·M&A 원장의 **확실한 키**(2026-09-11, 3_3_8 §3).
 *
 * 규칙은 DB(`app.norm_biz_reg_no`·`app.format_biz_reg_no`·`app.is_valid_biz_reg_no`)와 같다.
 * 화면이 먼저 보여 주고 DB가 마지막으로 막는다 — 화면에서 숨기는 것은 보안이 아니다.
 *
 * **저장 모양은 하나다**(`XXX-XX-XXXXX`). 표기가 갈리면 같은 번호를 두 모양으로 세게 되어
 * 유일 인덱스가 중복을 놓친다. 판정용 값을 따로 저장하지 않고(같은 사실을 두 곳에 적지
 * 않는다) 대조할 때만 숫자로 접는다(`bizRegNoDigits`).
 */

/** 숫자만 남긴다. 빈 값은 빈 문자열. */
export function bizRegNoDigits(v: unknown): string {
  return String(v ?? '').replace(/\D/g, '')
}

/**
 * 저장 모양(`XXX-XX-XXXXX`). 10자리가 아니면 숫자만 돌려준다 — 형식이 맞는지는
 * `bizRegNoError`가 답하고, 여기서는 모양만 맞춘다(DB `app.format_biz_reg_no`와 같다).
 */
export function formatBizRegNo(v: unknown): string {
  const d = bizRegNoDigits(v)
  if (d.length !== 10) return d
  return `${d.slice(0, 3)}-${d.slice(3, 5)}-${d.slice(5)}`
}

/**
 * 국세청 체크섬. 가중치 1,3,7,1,3,7,1,3,5를 곱해 더하고 아홉째 자리는 ×5의 십의 자리까지
 * 더한 뒤, 10에서 뺀 일의 자리가 마지막 숫자여야 한다.
 */
export function isValidBizRegNo(v: unknown): boolean {
  const d = bizRegNoDigits(v)
  if (d.length !== 10) return false
  const w = [1, 3, 7, 1, 3, 7, 1, 3, 5]
  let s = 0
  for (let i = 0; i < 9; i += 1) s += Number(d[i]) * w[i]!
  s += Math.floor((Number(d[8]) * 5) / 10)
  return (10 - (s % 10)) % 10 === Number(d[9])
}

/**
 * 입력 칸의 오류 문구. 비어 있으면 오류가 아니다(번호는 발굴 단계에서 선택이다 — 보육·투자로
 * 올라갈 때 서버가 요구한다).
 */
export function bizRegNoError(v: unknown): string | null {
  const d = bizRegNoDigits(v)
  if (d.length === 0) return null
  if (d.length !== 10) return '사업자등록번호는 숫자 10자리입니다.'
  if (!isValidBizRegNo(d)) return '사업자등록번호 검증에 실패했습니다. 숫자를 다시 확인하세요.'
  return null
}
