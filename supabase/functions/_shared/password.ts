// 게스트 비밀번호 해시 — PBKDF2-SHA256 (Deno Web Crypto)
//
// 프로바이더가 필요 없는 방식을 고른 이유: 이 인증은 발송 수단 없이도 성립해야 한다.
// 저장 형식은 자기 서술적이다 — `pbkdf2$sha256$<반복수>$<salt(b64)>$<hash(b64)>`.
// 반복수를 값 안에 담아 두면 나중에 강도를 올려도 옛 해시를 그대로 검증할 수 있다.
//
// 원문은 어디에도 저장하지 않으며, 비교는 시간 일정 비교(timingSafeEqual)로 한다 —
// 바이트 단위 조기 반환은 응답 시간으로 정답을 흘린다.

const ITERATIONS = 120_000
const KEY_BITS = 256
const SALT_BYTES = 16

function toB64(bytes: Uint8Array): string {
  let bin = ''
  bytes.forEach((b) => (bin += String.fromCharCode(b)))
  return btoa(bin)
}

function fromB64(s: string): Uint8Array {
  return Uint8Array.from(atob(s), (c) => c.charCodeAt(0))
}

async function derive(password: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    { name: 'PBKDF2' },
    false,
    ['deriveBits'],
  )
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
    key,
    KEY_BITS,
  )
  return new Uint8Array(bits)
}

function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i += 1) diff |= a[i] ^ b[i]
  return diff === 0
}

/** 비밀번호 → 저장 문자열. */
export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES))
  const hash = await derive(password, salt, ITERATIONS)
  return `pbkdf2$sha256$${ITERATIONS}$${toB64(salt)}$${toB64(hash)}`
}

/** 저장 문자열과 입력 비밀번호 대조. 형식이 깨졌으면 false(예외를 던지지 않는다). */
export async function verifyPassword(password: string, stored: string | null): Promise<boolean> {
  if (!stored) return false
  const parts = stored.split('$')
  if (parts.length !== 5 || parts[0] !== 'pbkdf2' || parts[1] !== 'sha256') return false
  const iterations = Number(parts[2])
  if (!Number.isFinite(iterations) || iterations <= 0) return false
  try {
    const salt = fromB64(parts[3])
    const expected = fromB64(parts[4])
    const actual = await derive(password, salt, iterations)
    return timingSafeEqual(actual, expected)
  } catch {
    return false
  }
}

/** 전화번호 표기 흔들림(하이픈·공백·국가번호 접두)을 흡수한 숫자열. */
export function normalizePhone(raw: unknown): string {
  return String(raw ?? '').replace(/\D/g, '')
}

/**
 * 새 비밀번호 규칙. 외부 참여자가 쓰는 자리라 복잡도보다 길이를 본다 —
 * 기억하지 못할 규칙은 결국 메모지에 적힌다.
 */
export function passwordPolicyError(password: string, initialPassword: string): string | null {
  const pw = String(password ?? '')
  if (pw.length < 8) return '비밀번호는 8자 이상이어야 합니다.'
  if (pw.length > 72) return '비밀번호는 72자 이하여야 합니다.'
  if (/^\d+$/.test(pw)) return '숫자로만 이루어진 비밀번호는 사용할 수 없습니다.'
  if (normalizePhone(pw) && normalizePhone(pw) === normalizePhone(initialPassword)) {
    return '초기 비밀번호(연락처)와 다른 값을 사용하세요.'
  }
  return null
}
