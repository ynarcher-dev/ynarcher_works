import { approvalFormAssetUrl } from '@/features/approval/approvalFormAssets'
import { htmlTemplateSlotKind, type HtmlTemplateValue } from '@/features/approval/fields'

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

/** 하이웍스 표식은 양식마다 새 코드를 만들지 않고 같은 치환 규칙으로 처리한다. */
export function fillHtmlTemplate(
  templateHtml: string,
  value: HtmlTemplateValue,
  context: HtmlTemplateContext,
): string {
  return templateHtml.replace(/{{#\s*([^{}]+?)\s*}}/g, (_whole, rawToken: string) => {
    const token = rawToken.trim()
    if (token === '문서 번호' || token === '문서번호') return escapeHtml(context.docNo ?? '미채번')
    if (token === '문서 제목' || token === '문서제목') return escapeHtml(context.title)
    const slotValue = value.slots[token] ?? ''
    return htmlTemplateSlotKind(token) === 'richtext' ? slotValue : escapeHtml(slotValue)
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
 * 원문의 표·셀 병합·인라인 스타일은 보존한다. 실행 코드와 폼만 걷고 sandbox iframe에 넣어,
 * 하드코딩한 HTML이 앱 DOM·세션에 접근하지 못하게 한다.
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
