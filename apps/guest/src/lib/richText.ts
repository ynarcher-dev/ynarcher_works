/**
 * 운영자가 WORKS 에디터로 쓴 본문을 게스트 화면에 안전하게 그리기 위한 정화기.
 *
 * WORKS는 같은 HTML을 TipTap 읽기 전용 에디터로 그린다. 그쪽은 파싱 단계에서 자기 스키마에
 * 없는 노드를 버리므로 결과적으로 정화가 함께 일어나지만, GUEST는 에디터를 싣지 않는다 —
 * 읽기만 하는 화면에 편집기 런타임을 통째로 들이는 값이 크다. 그래서 같은 일을 **허용 목록**
 * 으로 명시한다.
 *
 * 저장된 본문은 내부 임직원이 쓴 것이지만, 그 사실을 방어의 근거로 삼지 않는다. 이 문자열은
 * 원장을 거쳐 다른 오리진(GUEST 앱)에서 실행되며, 그 오리진에는 게스트 세션 토큰이 있다.
 * "UI에서 숨기는 것은 보안이 아니다"의 짝은 "출처를 믿는 것도 보안이 아니다"이다.
 */

/**
 * 정화된 본문의 조판. 에디터 런타임 없이 클래스만으로, WORKS `.rte`(global.css)와 같은
 * 모양을 세운다 — 같은 에디터로 쓴 글은 어느 화면에서든 같은 모양이어야 한다.
 * 글쓰기 본문과 NOTICE가 같은 한 벌을 쓴다. Tailwind 리셋이 제목·코드·구분선을 본문
 * 크기로 눕혀 두므로, 허용 태그에는 반드시 여기 조판이 한 줄씩 있어야 한다.
 */
export const RICH_BODY_CLASS =
  'text-body text-gray-800 [&_p]:mb-2 [&_ul]:mb-2 [&_ul]:list-disc [&_ul]:pl-5 ' +
  '[&_ol]:mb-2 [&_ol]:list-decimal [&_ol]:pl-5 [&_a]:text-brand [&_a]:underline ' +
  '[&_strong]:font-semibold [&_blockquote]:border-l-2 [&_blockquote]:border-gray-300 ' +
  '[&_blockquote]:pl-3 [&_blockquote]:text-gray-600 ' +
  '[&_img]:my-2 [&_img]:h-auto [&_img]:max-w-full [&_img]:rounded-radius-sm ' +
  '[&_h1]:mb-2 [&_h1]:text-title-md [&_h1]:font-bold [&_h1]:text-gray-900 ' +
  '[&_h2]:mb-2 [&_h2]:text-title-sm [&_h2]:font-bold [&_h2]:text-gray-900 ' +
  '[&_h3]:mb-2 [&_h3]:font-semibold [&_h3]:text-gray-900 ' +
  '[&_code]:rounded-radius-sm [&_code]:bg-gray-100 [&_code]:px-1 [&_code]:py-0.5 [&_code]:text-caption ' +
  '[&_pre]:mb-2 [&_pre]:overflow-x-auto [&_pre]:rounded-radius-sm [&_pre]:bg-gray-900 ' +
  '[&_pre]:p-3 [&_pre]:text-caption [&_pre]:text-gray-0 ' +
  '[&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_pre_code]:text-gray-0 ' +
  '[&_hr]:my-3 [&_hr]:border-t [&_hr]:border-gray-300'

/** 허용 태그. 서식 표현에 필요한 최소 집합이며, 그 밖의 태그는 내용만 남기고 벗긴다. */
const ALLOWED_TAGS = new Set([
  'P', 'BR', 'STRONG', 'B', 'EM', 'I', 'U', 'S', 'CODE', 'PRE',
  'UL', 'OL', 'LI', 'BLOCKQUOTE', 'A', 'IMG',
  'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'HR',
])

/** 허용 속성. 링크의 주소와 이미지의 주소·대체 텍스트뿐이다 — style·class·on*은 전부 떨어진다. */
const ALLOWED_ATTRS: Record<string, Set<string>> = {
  A: new Set(['href']),
  IMG: new Set(['src', 'alt']),
}

/** 링크 주소 허용 스킴. javascript:·data:는 그 자체가 실행 경로다. */
function safeHref(href: string | null): string | null {
  if (!href) return null
  return /^https?:\/\//i.test(href.trim()) ? href.trim() : null
}

/**
 * 이미지 주소 허용 스킴. WORKS 에디터는 이미지를 base64 `data:image/…`로 본문에 인라인
 * 저장하므로 이것을 막으면 사진이 통째로 사라진다. `<img>`의 src는 링크 href와 달리 실행
 * 경로가 아니다 — data: SVG를 포함해 img 문맥에서는 스크립트가 돌지 않는다. 그래도 이미지
 * MIME으로 좁혀 두고, 추후 업로드 경로 전환에 대비해 https도 함께 허용한다.
 */
function safeImgSrc(src: string | null): string | null {
  if (!src) return null
  const trimmed = src.trim()
  return /^(data:image\/|https:\/\/)/i.test(trimmed) ? trimmed : null
}

/** 정렬을 보존할 블록 태그와 값. 에디터(TextAlign 확장)는 문단·제목에만 정렬을 건다. */
const ALIGNABLE_TAGS = new Set(['P', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6'])
const ALIGN_VALUES = new Set(['left', 'center', 'right', 'justify'])

function scrub(node: Element): void {
  for (const child of Array.from(node.children)) scrub(child)

  if (!ALLOWED_TAGS.has(node.tagName)) {
    // 태그는 버리되 글자는 남긴다 — 통째로 지우면 본문이 소리 없이 사라진다.
    node.replaceWith(...Array.from(node.childNodes))
    return
  }

  // style은 통째로 벗기되 정렬 하나만 값 검증 후 되살린다 — 에디터의 가운데·오른쪽
  // 정렬은 클래스가 아니라 인라인 text-align으로 저장되기 때문이다.
  const align =
    node instanceof HTMLElement && ALIGNABLE_TAGS.has(node.tagName)
      ? node.style.textAlign
      : ''

  const allowed = ALLOWED_ATTRS[node.tagName]
  for (const attr of Array.from(node.attributes)) {
    if (!allowed?.has(attr.name)) node.removeAttribute(attr.name)
  }

  if (align && ALIGN_VALUES.has(align) && node instanceof HTMLElement) {
    node.style.textAlign = align
  }

  if (node.tagName === 'IMG') {
    const src = safeImgSrc(node.getAttribute('src'))
    if (!src) {
      // 이미지는 남길 글자가 없으므로 통째로 지운다.
      node.remove()
      return
    }
    node.setAttribute('src', src)
    node.setAttribute('loading', 'lazy')
  }

  if (node.tagName === 'A') {
    const href = safeHref(node.getAttribute('href'))
    if (!href) {
      node.replaceWith(...Array.from(node.childNodes))
      return
    }
    node.setAttribute('href', href)
    node.setAttribute('target', '_blank')
    node.setAttribute('rel', 'noopener noreferrer')
  }
}

/** 허용 목록만 남긴 HTML. 입력이 비면 빈 문자열. */
export function sanitizeRichText(html: string | null | undefined): string {
  if (!html) return ''
  // DOMParser는 문서를 만들지 않고 파싱만 하므로 이 단계에서 스크립트가 실행되지 않는다.
  const doc = new DOMParser().parseFromString(html, 'text/html')
  doc.querySelectorAll('script, style, iframe, object, embed').forEach((el) => el.remove())
  Array.from(doc.body.children).forEach((el) => scrub(el))
  return doc.body.innerHTML
}
