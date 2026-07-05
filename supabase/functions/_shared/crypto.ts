// Web Crypto 기반 HS256 JWT 서명 및 해시 유틸 (Deno / Edge Runtime)

function base64url(bytes: Uint8Array): string {
  let bin = ''
  bytes.forEach((b) => (bin += String.fromCharCode(b)))
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function base64urlStr(s: string): string {
  return base64url(new TextEncoder().encode(s))
}

/**
 * HS256으로 JWT를 서명한다.
 * secret은 Supabase 프로젝트 JWT 시크릿과 동일해야 PostgREST/RLS가 토큰을 신뢰한다.
 */
export async function signJwt(
  payload: Record<string, unknown>,
  secret: string,
): Promise<string> {
  const header = { alg: 'HS256', typ: 'JWT' }
  const data = `${base64urlStr(JSON.stringify(header))}.${base64urlStr(JSON.stringify(payload))}`
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const sig = new Uint8Array(
    await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data)),
  )
  return `${data}.${base64url(sig)}`
}

/** SHA-256 16진 해시 (OTP 저장용) */
export async function sha256Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(input),
  )
  return [...new Uint8Array(buf)]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

/** 6자리 숫자 OTP 생성 (암호학적 난수) */
export function generateOtp(): string {
  const n = crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000
  return n.toString().padStart(6, '0')
}
