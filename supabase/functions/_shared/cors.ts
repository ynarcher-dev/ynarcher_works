// 공용 CORS 처리 (P0-6: 운영 origin 제한)
// - ALLOWED_ORIGINS 환경 변수(쉼표 구분)가 설정되면 등록 origin + 로컬 개발
//   origin만 허용하고, 그 외 origin은 preflight 403 + CORS 헤더 미반환으로 차단한다.
//   예) supabase secrets set ALLOWED_ORIGINS=https://works.ynarcher.com,https://guest.ynarcher.com
// - 미설정(마이그레이션 유예): 기존 동작(모든 origin 허용)을 유지하되 경고를 남긴다.
//   운영 도메인 확정 즉시 ALLOWED_ORIGINS를 설정해 차단을 활성화해야 한다.
// - Origin 헤더가 없는 호출(서버 간, curl)은 CORS 대상이 아니므로 통과시키되,
//   인증·권한은 각 함수 본문이 별도로 강제한다.

const LOCAL_ORIGIN = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/

function isAllowedOrigin(origin: string): boolean {
  if (LOCAL_ORIGIN.test(origin)) return true
  const raw = Deno.env.get('ALLOWED_ORIGINS')
  if (raw && raw.trim()) {
    return raw
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
      .includes(origin)
  }
  // 유예 모드: 목록 미설정 시 차단하지 않는다(운영 전 반드시 설정할 것).
  console.warn(`[cors] ALLOWED_ORIGINS 미설정 — origin 허용(유예): ${origin}`)
  return true
}

/** 요청 origin이 허용 목록에 있으면 그 origin으로 한정된 CORS 헤더를, 아니면 빈 객체. */
export function corsHeadersFor(req: Request): Record<string, string> {
  const origin = req.headers.get('origin')
  if (!origin || !isAllowedOrigin(origin)) return {}
  return {
    'Access-Control-Allow-Origin': origin,
    Vary: 'Origin',
    'Access-Control-Allow-Headers':
      'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  }
}

/**
 * 핸들러 래퍼: preflight 처리 + 응답에 per-request CORS 헤더 부착.
 * 각 함수는 Deno.serve(withCors(handler))로 감싸기만 하면 된다.
 */
export function withCors(
  handler: (req: Request) => Response | Promise<Response>,
): (req: Request) => Promise<Response> {
  return async (req: Request): Promise<Response> => {
    const cors = corsHeadersFor(req)
    if (req.method === 'OPTIONS') {
      // 브라우저 preflight: 미허용 origin은 403(CORS 헤더 없음)으로 거부
      if (req.headers.get('origin') && Object.keys(cors).length === 0) {
        return new Response('forbidden', { status: 403 })
      }
      return new Response('ok', { headers: cors })
    }
    const res = await handler(req)
    if (Object.keys(cors).length === 0) return res
    const headers = new Headers(res.headers)
    for (const [k, v] of Object.entries(cors)) headers.set(k, v)
    return new Response(res.body, { status: res.status, headers })
  }
}

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}
