// [스타트업 미디어] URL → OG 메타데이터 미리보기
// 요청: { url }
// 응답: { url, title, description, image, siteName, type } | 4xx/5xx
//
// 보안:
// - 인증된 내부 사용자만 호출 가능(세션 토큰 검증). UI 숨김 ≠ 보안.
// - SSRF 방지: http/https 스킴만 허용하고 localhost·사설망 호스트를 차단한다.
// - 응답 본문은 앞부분만 읽고(과도한 페이로드 차단), 6초 타임아웃을 둔다.
// - DB를 건드리지 않는다(메타데이터만 파싱해 반환). 저장은 상위 통합 수정 폼이 담당.
// 근거: docs/docs_dev/11_migration_security_gate.md,
//       supabase/functions/employee-create/index.ts(인증 검증 패턴)
import { jsonResponse, withCors } from '../_shared/cors.ts'
import { CRAWLER_UA, fetchWithSsrfGuard, safeUrl } from '../_shared/urlFetch.ts'
import { supabaseAdmin } from '../_shared/supabaseAdmin.ts'

/**
 * YouTube 영상 ID를 추출한다(youtu.be / watch / shorts / embed 지원). 아니면 null.
 * YouTube는 서버 스크래핑 시 동의 페이지를 주는 일이 잦아 oEmbed로 별도 처리한다.
 */
function youtubeId(u: URL): string | null {
  const host = u.hostname.replace(/^www\./, '').replace(/^m\./, '')
  if (host === 'youtu.be') return u.pathname.slice(1).split('/')[0] || null
  if (host === 'youtube.com' || host === 'music.youtube.com') {
    if (u.pathname === '/watch') return u.searchParams.get('v')
    const m = u.pathname.match(/^\/(?:shorts|embed|v)\/([^/?#]+)/)
    if (m) return m[1]
  }
  return null
}

/** 최소 HTML 엔티티 디코드(메타 태그 content용). */
function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0*39;|&#x0*27;|&apos;/gi, "'")
    .replace(/&nbsp;/g, ' ')
}

/** <meta property|name="..."> 중 지정 키의 content를 앞에서부터 찾는다. */
function findMeta(html: string, keys: string[]): string | undefined {
  const wanted = new Set(keys.map((k) => k.toLowerCase()))
  const tags = html.match(/<meta\b[^>]*>/gi) ?? []
  for (const tag of tags) {
    const key = tag.match(/(?:property|name)\s*=\s*["']([^"']+)["']/i)?.[1]?.toLowerCase()
    if (key && wanted.has(key)) {
      const content = tag.match(/content\s*=\s*["']([^"']*)["']/i)?.[1]
      if (content && content.trim()) return decodeEntities(content.trim())
    }
  }
  return undefined
}

Deno.serve(withCors(async (req: Request) => {
  if (req.method !== 'POST') return jsonResponse({ error: 'method_not_allowed' }, 405)

  try {
    // 1) 호출자 인증(내부 사용자) --------------------------------------------
    const token = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '')
    if (!token) return jsonResponse({ error: 'unauthorized' }, 401)
    const { data: authData, error: authErr } = await supabaseAdmin().auth.getUser(token)
    if (authErr || !authData.user) return jsonResponse({ error: 'unauthorized' }, 401)

    // 2) URL 검증(SSRF 방지) --------------------------------------------------
    const body = await req.json().catch(() => ({}))
    const url = safeUrl(String(body.url ?? '').trim())
    if (!url) return jsonResponse({ error: 'invalid_url', message: '유효한 http/https URL이 아닙니다.' }, 400)

    // 3) fetch(타임아웃 6초). YouTube는 oEmbed로, 그 외는 OG 스크래핑으로 처리. --
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 6000)
    try {
      // 3-a) YouTube: 서버 스크래핑 시 동의 페이지를 주는 일이 많아 oEmbed API 사용
      const yt = youtubeId(url)
      if (yt) {
        const watch = `https://www.youtube.com/watch?v=${yt}`
        const thumb = `https://i.ytimg.com/vi/${yt}/hqdefault.jpg`
        const oe = await fetch(
          `https://www.youtube.com/oembed?url=${encodeURIComponent(watch)}&format=json`,
          { signal: controller.signal, headers: { 'User-Agent': CRAWLER_UA, Accept: 'application/json' } },
        ).catch(() => null)
        if (oe && oe.ok) {
          const o = (await oe.json().catch(() => ({}))) as {
            title?: string
            author_name?: string
            thumbnail_url?: string
          }
          return jsonResponse({
            url: watch,
            title: o.title ?? null,
            description: o.author_name ?? null,
            image: o.thumbnail_url ?? thumb,
            siteName: 'YouTube',
            type: 'video',
          })
        }
        // oEmbed 실패(비공개·삭제 등) 시 최소한 썸네일이라도 제공
        return jsonResponse({ url: watch, title: null, description: null, image: thumb, siteName: 'YouTube', type: 'video' })
      }

      // 3-b) 일반 페이지: OG/메타 스크래핑(본문 앞부분만) -----------------------
      // redirect는 수동 추적하며 매 홉 호스트를 재검사한다(SSRF 방어).
      const guarded = await fetchWithSsrfGuard(url, {
        method: 'GET',
        signal: controller.signal,
        headers: { 'User-Agent': CRAWLER_UA, Accept: 'text/html,application/xhtml+xml' },
      })
      if (guarded === 'blocked') {
        return jsonResponse({ error: 'invalid_url', message: '허용되지 않는 대상입니다.' }, 400)
      }
      const { resp, finalUrl } = guarded
      if (!resp.ok) return jsonResponse({ error: 'fetch_failed', message: `대상 응답 오류(${resp.status})` }, 502)

      // 허용 콘텐츠 타입: HTML 계열만 파싱한다(바이너리/JSON 등 차단).
      const contentType = resp.headers.get('content-type') ?? ''
      if (!/text\/html|application\/xhtml/i.test(contentType)) {
        await resp.body?.cancel()
        return jsonResponse({ error: 'unsupported_content', message: 'HTML 문서가 아닙니다.' }, 415)
      }

      const html = (await resp.text()).slice(0, 500_000)

      const title =
        findMeta(html, ['og:title', 'twitter:title']) ??
        html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1]?.trim().replace(/\s+/g, ' ')
      const description = findMeta(html, ['og:description', 'twitter:description', 'description'])
      let image = findMeta(html, ['og:image', 'og:image:url', 'twitter:image', 'twitter:image:src'])
      const siteName = findMeta(html, ['og:site_name']) ?? new URL(finalUrl).hostname
      const type = findMeta(html, ['og:type'])

      // 상대경로 이미지 → 절대 URL 보정
      if (image) {
        try {
          image = new URL(image, finalUrl).toString()
        } catch {
          image = undefined
        }
      }

      return jsonResponse({
        url: finalUrl,
        title: title ? decodeEntities(title) : null,
        description: description ?? null,
        image: image ?? null,
        siteName,
        type: type ?? null,
      })
    } finally {
      clearTimeout(timer)
    }
  } catch (e) {
    const aborted = e instanceof DOMException && e.name === 'AbortError'
    return jsonResponse(
      { error: aborted ? 'timeout' : 'server_error', message: aborted ? '대상 응답이 지연되어 취소했습니다.' : '메타데이터를 불러오지 못했습니다.' },
      aborted ? 504 : 500,
    )
  }
}))
