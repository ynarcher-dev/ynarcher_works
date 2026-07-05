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
