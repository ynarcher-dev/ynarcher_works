/** 개인정보 목록 마스킹 유틸. 근거: docs_dev/4_security_privacy_policy.md */

/** 이메일: 아이디 앞 한 글자만 남김 (h***@example.com). */
export function maskEmail(email: string | null): string {
  if (!email) return '-'
  const [id, domain] = email.split('@')
  if (!domain || !id) return email
  return `${id.charAt(0)}***@${domain}`
}

/** 전화번호: 중간 자리 마스킹 (010-****-5678). */
export function maskPhone(phone: string | null): string {
  if (!phone) return '-'
  const digits = phone.replace(/\D/g, '')
  if (digits.length < 8) return phone
  return `${digits.slice(0, 3)}-****-${digits.slice(-4)}`
}

/**
 * 이름: 첫 글자와 끝 글자만 남기고 가운데를 가림 (홍*동 / 김*).
 * 담당자 표기처럼 "외 2" 같은 꼬리가 붙은 값은 이름 부분만 가리고 꼬리를 보존한다.
 */
export function maskName(name: string | null): string {
  if (!name) return '-'
  const trimmed = name.trim()
  if (!trimmed) return '-'
  // '홍길동 외 2' / '홍길동, 김철수' 형태를 각 이름 단위로 나눠 가린다.
  const parts = trimmed.split(/(\s*,\s*|\s+외\s+\d+\s*$)/)
  if (parts.length > 1) return parts.map((p, i) => (i % 2 === 0 ? maskOne(p) : p)).join('')
  return maskOne(trimmed)
}

function maskOne(name: string): string {
  if (name.length <= 1) return name
  if (name.length === 2) return `${name[0]}*`
  return `${name[0]}${'*'.repeat(name.length - 2)}${name[name.length - 1]}`
}

/** 필드 종류에 맞는 마스킹 함수를 적용한다(민감정보 정책 소비 지점 공통 진입점). */
export function maskBy(field: 'name' | 'email' | 'phone', value: string | null): string {
  if (field === 'email') return maskEmail(value)
  if (field === 'phone') return maskPhone(value)
  return maskName(value)
}
