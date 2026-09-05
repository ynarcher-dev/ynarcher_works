// [공용] 바깥 주소를 서버가 가져올 때의 SSRF 방어.
//
// link-metadata(2026-07, OG 미리보기)가 갖고 있던 방어를 그대로 꺼내 공용으로 둔다. 꺼낸 이유는
// startup-ai-fill이 같은 일을 하게 됐기 때문이고(자료 관리의 링크를 AI가 읽는다), **보안 코드를
// 복제하지 않기 위해서**다 — 복제본은 한쪽만 고치는 날이 오고, 그날 뚫리는 쪽은 잊힌 쪽이다.
//
// 막는 것은 하나다: 우리 서버가 **바깥이 아닌 곳**을 대신 두드리는 것. 사용자가 주소를 정하므로
// 그대로 fetch하면 사설망·클라우드 메타데이터 엔드포인트를 우리 권한으로 열어 주는 창구가 된다.
//
// 방어는 네 겹이다.
//   1. 스킴 — http/https만.
//   2. 호스트 문자열 — localhost·사설 대역·링크로컬을 이름으로 먼저 거른다.
//   3. DNS 해석 결과 — 이름은 멀쩡한데 사설 IP로 풀리는 경우(rebinding)를 잡는다.
//   4. 리다이렉트 — 홉마다 1~3을 다시 본다. 자동 추적에 맡기면 첫 홉만 검사한 셈이 된다.
//
// 근거: docs/docs_dev/11_migration_security_gate.md,
//       supabase/functions/link-metadata/index.ts(원본 구현, P1-4.2)

/** 사설망·로컬 호스트(SSRF 표적)를 차단한다. */
export function isBlockedHost(hostname: string): boolean {
  const h = hostname.toLowerCase()
  if (h === 'localhost' || h.endsWith('.local') || h.endsWith('.internal')) return true
  // IPv4 사설/루프백/링크로컬 대역
  if (/^127\./.test(h) || /^10\./.test(h) || /^192\.168\./.test(h)) return true
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(h)) return true
  if (/^169\.254\./.test(h) || h === '0.0.0.0') return true
  // IPv6 루프백/유니크로컬
  if (h === '::1' || h.startsWith('fc') || h.startsWith('fd') || h.startsWith('fe80')) return true
  return false
}

/** 요청 URL을 검증하고 정규화한다. 유효하지 않으면 null. */
export function safeUrl(raw: string): URL | null {
  let u: URL
  try {
    u = new URL(raw)
  } catch {
    return null
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return null
  if (isBlockedHost(u.hostname)) return null
  return u
}

/** DNS 해석 결과가 사설/루프백 IP면 차단(베스트 에포트 — 미지원 런타임은 통과). */
export async function resolvesToBlockedIp(hostname: string): Promise<boolean> {
  try {
    const [a, aaaa] = await Promise.all([
      Deno.resolveDns(hostname, 'A').catch(() => [] as string[]),
      Deno.resolveDns(hostname, 'AAAA').catch(() => [] as string[]),
    ])
    return [...a, ...aaaa].some((ip) => isBlockedHost(ip))
  } catch {
    return false
  }
}

/**
 * SSRF 방어 fetch: redirect를 수동으로 따라가며 각 홉의 호스트를 재검사한다(최대 3회).
 * 차단 대상으로 향하는 redirect는 즉시 중단한다.
 */
export async function fetchWithSsrfGuard(
  start: URL,
  init: RequestInit,
): Promise<{ resp: Response; finalUrl: string } | 'blocked'> {
  let current = start
  for (let hop = 0; hop <= 3; hop++) {
    if (await resolvesToBlockedIp(current.hostname)) return 'blocked'
    const resp = await fetch(current.toString(), { ...init, redirect: 'manual' })
    if ([301, 302, 303, 307, 308].includes(resp.status)) {
      const loc = resp.headers.get('location')
      await resp.body?.cancel()
      if (!loc) return 'blocked'
      let nextRaw: string
      try {
        nextRaw = new URL(loc, current).toString()
      } catch {
        return 'blocked'
      }
      const next = safeUrl(nextRaw)
      if (!next) return 'blocked'
      current = next
      continue
    }
    return { resp, finalUrl: current.toString() }
  }
  return 'blocked'
}

/** 봇/스크래퍼용 공용 User-Agent. */
export const CRAWLER_UA = 'Mozilla/5.0 (compatible; YnarcherBot/1.0; +metadata-preview)'
