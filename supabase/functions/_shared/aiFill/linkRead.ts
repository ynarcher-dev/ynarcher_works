// [AI 작성하기] 링크 자료를 모델이 읽을 수 있는 것으로 바꾼다.
//
// 자료 관리가 링크를 담게 되면서(2026-09-06) AI도 그것을 읽어야 한다. 주소를 모델에 그대로
// 넘기지 않고 **우리가 가져온다**. 이유는 둘이다 —
//   * 무엇을 읽었는지 우리가 안다. 모델이 대신 가져오면 감사 기록에 남길 대상이 없다.
//   * SSRF 방어가 우리 손에 있다. 바깥 주소를 서버가 두드리는 일이므로 사설망으로 향하는
//     주소를 막아야 하고, 그 판정을 남에게 맡길 수 없다.
//
// 구글 문서·시트·슬라이드는 특별히 다룬다. 내보내기 주소가 있어서 **구글이 대신 변환해 준다** —
// 시트는 표(CSV)로, 문서와 슬라이드는 PDF로. 우리가 엑셀·워드 파서를 만들 필요가 없어지는
// 자리라, 이 함수에서 가장 값어치 있는 부분이다.
//
// 다만 그 내보내기는 **링크 공유가 켜져 있을 때만** 열린다. 닫혀 있으면 오류가 아니라 로그인
// 페이지(HTML)가 돌아오므로, 그 경우를 형식으로 가려내 "공유를 열어 달라"고 말해야 한다.
// 가리지 않으면 로그인 페이지의 글자가 그대로 모델에 들어가 엉뚱한 초안이 나온다.
//
// **크기 상한은 호출자가 준다.** 링크는 가져오기 전에는 얼마나 될지 알 수 없어 파일처럼 미리
// 셀 수 없고, 그래서 한 건씩 고정 상한으로 막으면 여러 건이 합쳐 예산을 넘긴다. 남은 예산을
// 받아 그 안에서만 읽는다.
//
// 근거: docs/docs_planning/3_3_5_startup_ai_fill.md §2.1,
//       supabase/functions/_shared/urlFetch.ts(SSRF 방어)

import { CRAWLER_UA, fetchWithSsrfGuard, safeUrl } from '../urlFetch.ts'
import { resolveMime } from './formats.ts'
import { MAX_LINK_CHARS, MAX_SINGLE_BYTES, mb } from './limits.ts'

/** 링크 한 건당 대기 시간. 느린 사이트 하나가 전체를 지연시키지 않게 짧게 둔다. */
const TIMEOUT_MS = 15_000

export interface LinkContent {
  /** 모델에 보낼 MIME. */
  mime: string
  /** 파일로 보낼 바이트(PDF·CSV 등). 글로 보낼 때는 null. */
  bytes: ArrayBuffer | null
  /** 글로 보낼 본문(HTML에서 뽑은 것). 파일로 보낼 때는 null. */
  text: string | null
  /** 본문이 길어 앞부분만 읽었는가. 담당자에게 그대로 알린다. */
  truncated: boolean
}

export interface LinkError {
  message: string
}

/**
 * 구글 문서 계열이면 내보내기 주소로 바꾼다. 아니면 null.
 *
 * 문서·슬라이드는 PDF로 받는다(레이아웃을 그대로 보므로 표와 그림이 살아 있다).
 * 시트는 CSV로 받는다 — PDF로 받으면 넓은 표가 여러 쪽으로 잘려 열이 어긋난다.
 * 시트의 CSV 내보내기는 **첫 시트 한 장**만 준다(그것이 이 경로의 한계다).
 */
export function googleExportUrl(raw: string): string | null {
  let u: URL
  try {
    u = new URL(raw)
  } catch {
    return null
  }
  if (u.hostname !== 'docs.google.com') return null
  const m = /^\/(document|spreadsheets|presentation)\/d\/([^/]+)/.exec(u.pathname)
  if (!m) return null
  const [, kind, id] = m
  if (kind === 'spreadsheets') return `https://docs.google.com/spreadsheets/d/${id}/export?format=csv`
  if (kind === 'document') return `https://docs.google.com/document/d/${id}/export?format=pdf`
  return `https://docs.google.com/presentation/d/${id}/export/pdf`
}

/** HTML에서 글자만 남긴다. 스크립트·스타일은 통째로 버리고 태그를 지운 뒤 빈 줄을 접는다. */
export function htmlToText(html: string): string {
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, ' ')
    // 문단·줄바꿈 태그는 줄바꿈으로 바꿔 문장이 붙어 버리지 않게 한다.
    .replace(/<\/(p|div|li|tr|h[1-6])>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0*39;|&apos;/g, "'")
    .replace(/[ \t]+/g, ' ')
    // 여는 태그가 남긴 공백이 줄머리에 붙는다(`</p><p>` → `\n `). 줄 앞뒤 공백을 걷어야
    // 모델이 받는 글이 원문의 들여쓰기처럼 보이지 않는다.
    .replace(/[ \t]*\n[ \t]*/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/**
 * 링크 하나를 읽어 모델에 넣을 수 있는 형태로 돌려준다.
 *
 * 실패는 전부 사람이 읽을 문구로 돌려준다 — 링크가 안 읽히는 이유는 대부분 담당자가 고칠 수
 * 있는 것(공유 설정·로그인·죽은 주소)이라, 원인을 말해야 다음 행동이 정해진다.
 *
 * @param limitBytes 이 링크가 쓸 수 있는 바이트. 앞선 자료가 쓰고 남은 예산이다.
 */
export async function readLink(rawUrl: string, limitBytes: number): Promise<LinkContent | LinkError> {
  const exported = googleExportUrl(rawUrl)
  const isGoogleDoc = exported !== null
  const target = safeUrl(exported ?? rawUrl)
  if (!target) return { message: `열 수 없는 주소입니다: ${rawUrl}` }

  // 남은 예산 안에서, 한 건이 전부를 먹지 않도록 한 건 상한도 함께 건다.
  const cap = Math.min(Math.max(limitBytes, 0), MAX_SINGLE_BYTES)
  if (cap <= 0) return { message: `앞선 자료로 용량을 다 써서 읽지 못했습니다: ${target.hostname}` }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const guarded = await fetchWithSsrfGuard(target, {
      method: 'GET',
      signal: controller.signal,
      headers: { 'User-Agent': CRAWLER_UA, Accept: '*/*' },
    })
    if (guarded === 'blocked') return { message: `허용되지 않는 대상입니다: ${target.hostname}` }
    const { resp } = guarded
    if (!resp.ok) {
      await resp.body?.cancel()
      return { message: `주소를 열지 못했습니다(${resp.status}): ${target.hostname}` }
    }

    const contentType = (resp.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase()

    // 구글 내보내기가 HTML을 주면 문서가 닫혀 있다는 뜻이다(로그인 페이지). 그 글자를
    // 그대로 모델에 넣으면 엉뚱한 초안이 나오므로 여기서 끊고 무엇을 해야 하는지 말한다.
    if (isGoogleDoc && contentType.startsWith('text/html')) {
      await resp.body?.cancel()
      return { message: '구글 문서가 비공개입니다. 링크가 있는 사람은 볼 수 있도록 공유를 열어 주세요.' }
    }

    const buf = await resp.arrayBuffer()
    if (buf.byteLength > cap) {
      return { message: `내용이 너무 큽니다(${mb(cap)} 초과): ${target.hostname}` }
    }

    // 모델이 그대로 받는 형식이면 바이트째로 넘긴다(구글 문서의 PDF·시트의 CSV가 여기로 온다).
    const mime = resolveMime(contentType, target.pathname)
    if (mime && mime !== 'text/html') return { mime, bytes: buf, text: null, truncated: false }

    // 일반 웹페이지는 글자만 뽑아 넘긴다. HTML을 그대로 보내도 되지만, 스크립트·스타일이
    // 입력 예산의 대부분을 먹고 정작 본문은 뒤로 밀린다.
    if (contentType.startsWith('text/html') || mime === 'text/html') {
      const full = htmlToText(new TextDecoder().decode(buf))
      if (full.length < 40) {
        return { message: `본문을 읽지 못했습니다(화면을 스크립트로 그리는 페이지일 수 있습니다): ${target.hostname}` }
      }
      // 바이트가 작아도 글자는 많을 수 있다. 자를 때는 그 사실을 함께 돌려준다.
      const truncated = full.length > MAX_LINK_CHARS
      return {
        mime: 'text/plain',
        bytes: null,
        text: truncated ? full.slice(0, MAX_LINK_CHARS) : full,
        truncated,
      }
    }

    return { message: `읽을 수 없는 형식입니다(${contentType || '알 수 없음'}): ${target.hostname}` }
  } catch (e) {
    const aborted = e instanceof DOMException && e.name === 'AbortError'
    return { message: aborted ? `응답이 늦어 취소했습니다: ${target.hostname}` : `주소를 열지 못했습니다: ${target.hostname}` }
  } finally {
    clearTimeout(timer)
  }
}
