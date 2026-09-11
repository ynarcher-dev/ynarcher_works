import { Field, Input } from '@ynarcher/ui'
import { useMemo } from 'react'
import { RichTextEditor } from '@/components/RichTextEditor'
import {
  htmlTemplateSlotKind,
  htmlTemplateTokens,
  isSystemHtmlToken,
  type HtmlTemplateValue,
} from '@/features/approval/fields'
import {
  fillHtmlTemplate,
  sanitizeHtmlTemplate,
  type HtmlTemplateContext,
} from '@/features/approval/htmlTemplate'

export type { HtmlTemplateContext } from '@/features/approval/htmlTemplate'

interface HtmlTemplateFieldProps {
  templateHtml: string
  assets?: Record<string, string>
  context: HtmlTemplateContext
  value: HtmlTemplateValue
  onChange?: (value: HtmlTemplateValue) => void
}

function previewDocument(html: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src 'self' https: http: data: blob:; style-src 'unsafe-inline'; font-src https: data:;"><style>html,body{margin:0;padding:0;background:#fff}body{padding:12px;box-sizing:border-box;overflow-x:auto}</style></head><body>${html}</body></html>`
}

/** 범용 HTML 양식 — 원문 속 표식을 입력칸으로 만들고 결과를 격리된 미리보기로 보여 준다. */
export function HtmlTemplateField({
  templateHtml,
  assets,
  context,
  value,
  onChange,
}: HtmlTemplateFieldProps) {
  const editableTokens = useMemo(
    () => htmlTemplateTokens(templateHtml).filter((token) => !isSystemHtmlToken(token)),
    [templateHtml],
  )
  const rendered = useMemo(
    () => sanitizeHtmlTemplate(fillHtmlTemplate(templateHtml, value, context), assets),
    [assets, context, templateHtml, value],
  )
  const srcDoc = useMemo(() => previewDocument(rendered), [rendered])
  const setSlot = (token: string, slotValue: string) =>
    onChange?.({ slots: { ...value.slots, [token]: slotValue } })

  return (
    <div className="space-y-4">
      {onChange && editableTokens.length > 0 && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {editableTokens.map((token) => {
            const kind = htmlTemplateSlotKind(token)
            if (kind === 'richtext') {
              return (
                <Field key={token} as="div" label={token} className="sm:col-span-2">
                  <RichTextEditor
                    value={value.slots[token] ?? ''}
                    onChange={(html) => setSlot(token, html)}
                    placeholder={`${token} 입력`}
                  />
                </Field>
              )
            }
            return (
              <Field key={token} label={token}>
                <Input
                  type={kind === 'date' ? 'date' : 'text'}
                  value={value.slots[token] ?? ''}
                  onChange={(event) => setSlot(token, event.target.value)}
                />
              </Field>
            )
          })}
        </div>
      )}

      <div className="overflow-hidden rounded-radius-md border border-gray-200 bg-white">
        <iframe
          title="HTML 양식 미리보기"
          sandbox="allow-same-origin"
          srcDoc={srcDoc}
          className="block min-h-48 w-full border-0"
          onLoad={(event) => {
            const height = event.currentTarget.contentDocument?.documentElement.scrollHeight ?? 0
            event.currentTarget.style.height = `${Math.min(Math.max(height + 8, 192), 2400)}px`
          }}
        />
      </div>
    </div>
  )
}
