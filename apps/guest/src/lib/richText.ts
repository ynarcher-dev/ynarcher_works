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

/** 허용 태그. 서식 표현에 필요한 최소 집합이며, 그 밖의 태그는 내용만 남기고 벗긴다. */
const ALLOWED_TAGS = new Set([
  'P', 'BR', 'STRONG', 'B', 'EM', 'I', 'U', 'S', 'CODE', 'PRE',
  'UL', 'OL', 'LI', 'BLOCKQUOTE', 'A',
  'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'HR',
])

/** 허용 속성. 링크의 주소 하나뿐이다 — style·class·on*은 전부 떨어진다. */
const ALLOWED_ATTRS: Record<string, Set<string>> = { A: new Set(['href']) }

/** 링크 주소 허용 스킴. javascript:·data:는 그 자체가 실행 경로다. */
function safeHref(href: string | null): string | null {
  if (!href) return null
  return /^https?:\/\//i.test(href.trim()) ? href.trim() : null
}

function scrub(node: Element): void {
  for (const child of Array.from(node.children)) scrub(child)

  if (!ALLOWED_TAGS.has(node.tagName)) {
    // 태그는 버리되 글자는 남긴다 — 통째로 지우면 본문이 소리 없이 사라진다.
    node.replaceWith(...Array.from(node.childNodes))
    return
  }

  const allowed = ALLOWED_ATTRS[node.tagName]
  for (const attr of Array.from(node.attributes)) {
    if (!allowed?.has(attr.name)) node.removeAttribute(attr.name)
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
