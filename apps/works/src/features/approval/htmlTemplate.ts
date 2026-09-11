import { approvalFormAssetUrl } from '@/features/approval/approvalFormAssets'

export interface HtmlTemplateContext {
  title: string
  docNo: string | null
}

const blockedTags = [
  'script',
  'noscript',
  'iframe',
  'frame',
  'frameset',
  'object',
  'embed',
  'form',
  'input',
  'button',
  'textarea',
  'select',
  'option',
  'meta',
  'base',
  'link',
]

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

/** 문서 원장 값으로 자동 채울 수 있는 시스템 표식만 치환한다. 나머지는 본문에서 직접 고친다. */
export function fillHtmlTemplate(html: string, context: HtmlTemplateContext): string {
  return html.replace(/{{#\s*([^{}]+?)\s*}}/g, (whole, rawToken: string) => {
    const token = rawToken.trim()
    if (token === '문서 번호' || token === '문서번호') return escapeHtml(context.docNo ?? '미채번')
    if (token === '문서 제목' || token === '문서제목') return escapeHtml(context.title)
    return whole
  })
}

function safeUrl(value: string, image: boolean): boolean {
  const compact = Array.from(value.trim())
    .filter((character) => {
      const code = character.charCodeAt(0)
      return code > 32 && code !== 127
    })
    .join('')
    .toLowerCase()
  if (image && compact.startsWith('data:image/')) return true
  if (!image && /^(mailto:|tel:)/.test(compact)) return true
  return /^(https?:|blob:|\/|#|\?|\.\.?\/)/.test(compact)
}

/**
 * 원문의 표·셀 병합·인라인 스타일은 보존한다. 실행 코드와 폼 요소만 제거한 뒤
 * sandbox iframe에 넣어, 하드코딩한 HTML이 앱 DOM과 세션에 접근하지 못하게 한다.
 */
export function sanitizeHtmlTemplate(
  rawHtml: string,
  assets: Record<string, string> = {},
): string {
  if (typeof DOMParser === 'undefined') return rawHtml
  const parsed = new DOMParser().parseFromString(rawHtml, 'text/html')
  parsed.querySelectorAll(blockedTags.join(',')).forEach((element) => element.remove())

  parsed.querySelectorAll('*').forEach((element) => {
    for (const attribute of Array.from(element.attributes)) {
      const name = attribute.name.toLowerCase()
      const originalValue = attribute.value
      if (name.startsWith('on') || name === 'srcdoc' || name === 'action' || name === 'formaction') {
        element.removeAttribute(attribute.name)
        continue
      }
      if (
        name === 'style' &&
        /expression\s*\(|javascript\s*:|behavior\s*:|-moz-binding|@import/i.test(originalValue)
      ) {
        element.removeAttribute(attribute.name)
        continue
      }
      if (name === 'href' && !safeUrl(originalValue, false)) {
        element.removeAttribute(attribute.name)
        continue
      }
      if (name === 'src') {
        if (element.tagName !== 'IMG') {
          element.removeAttribute(attribute.name)
          continue
        }
        const mapped = assets[originalValue]
        const nextValue = mapped ? approvalFormAssetUrl(mapped) : originalValue
        if (!nextValue || !safeUrl(nextValue, true)) element.removeAttribute(attribute.name)
        else element.setAttribute('src', nextValue)
      }
    }
  })

  return parsed.body.innerHTML
}
