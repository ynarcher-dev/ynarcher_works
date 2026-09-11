import { IconButton } from '@ynarcher/ui'
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bold,
  Italic,
  Link as LinkIcon,
  List,
  ListOrdered,
  Redo2,
  Strikethrough,
  Underline,
  Undo2,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, type ReactNode } from 'react'
import type { HtmlTemplateValue } from '@/features/approval/fields'
import {
  fillHtmlTemplate,
  sanitizeHtmlTemplate,
  type HtmlTemplateContext,
} from '@/features/approval/htmlTemplate'

export type { HtmlTemplateContext } from '@/features/approval/htmlTemplate'

interface HtmlTemplateFieldProps {
  assets?: Record<string, string>
  context: HtmlTemplateContext
  value: HtmlTemplateValue
  onChange?: (value: HtmlTemplateValue) => void
}

function editorDocument(html: string, editable: boolean): string {
  return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src 'self' https: http: data: blob:; style-src 'unsafe-inline'; font-src https: data:;"><style>html,body{margin:0;padding:0;background:#fff}body{min-height:168px;padding:16px;box-sizing:border-box;overflow-wrap:anywhere;overflow-x:auto}${editable ? 'body{cursor:text;outline:none}' : ''}</style></head><body>${html}</body></html>`
}

const MIN_HEIGHT = 200
const MAX_HEIGHT = 2400

/**
 * 관리자가 저장한 HTML을 별도 입력 칸으로 분해하지 않고 그대로 편집면으로 사용한다.
 * iframe으로 앱 CSS와 격리하되, 작성 화면에서는 body 자체를 contenteditable로 열어
 * 표·병합 셀·인라인 스타일을 눈으로 본 위치에서 직접 수정할 수 있게 한다.
 */
export function HtmlTemplateField({
  assets,
  context,
  value,
  onChange,
}: HtmlTemplateFieldProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const onChangeRef = useRef(onChange)
  const assetsRef = useRef(assets)
  const lastEmittedRef = useRef<string | null>(null)
  const editable = Boolean(onChange)
  const sourceHtml = value.html
  const renderedHtml = useMemo(
    () =>
      sanitizeHtmlTemplate(editable ? sourceHtml : fillHtmlTemplate(sourceHtml, context), assets),
    [assets, context, editable, sourceHtml],
  )
  const initialDocumentRef = useRef<string | null>(null)
  if (initialDocumentRef.current === null) {
    initialDocumentRef.current = editorDocument(renderedHtml, editable)
  }

  useEffect(() => {
    onChangeRef.current = onChange
  }, [onChange])

  useEffect(() => {
    assetsRef.current = assets
  }, [assets])

  const resize = useCallback(() => {
    const iframe = iframeRef.current
    const document = iframe?.contentDocument
    if (!iframe || !document) return
    const height = Math.min(
      Math.max(document.documentElement.scrollHeight + 8, MIN_HEIGHT),
      MAX_HEIGHT,
    )
    iframe.style.height = `${height}px`
  }, [])

  const emitDocument = useCallback(() => {
    const html = iframeRef.current?.contentDocument?.body.innerHTML
    if (html === undefined) return
    const sanitized = sanitizeHtmlTemplate(html, assetsRef.current)
    lastEmittedRef.current = sanitized
    onChangeRef.current?.({ html: sanitized })
    resize()
  }, [resize])

  const configureDocument = useCallback(() => {
    const body = iframeRef.current?.contentDocument?.body
    if (!body) return
    body.contentEditable = editable ? 'true' : 'false'
    body.spellcheck = editable
    body.oninput = editable ? emitDocument : null
    body.onblur = editable ? emitDocument : null
    body.onclick = editable
      ? (event) => {
          if ((event.target as Element | null)?.closest?.('a')) event.preventDefault()
        }
      : null
    resize()
    if (editable) emitDocument()
  }, [editable, emitDocument, resize])

  // AI 초안 적용이나 외부 폼 초기화처럼 바깥에서 값이 바뀐 경우만 DOM을 갱신한다.
  // 사용자가 방금 입력해 방출한 값은 다시 주입하지 않아 캐럿이 튀지 않게 한다.
  useEffect(() => {
    const body = iframeRef.current?.contentDocument?.body
    if (!body || renderedHtml === lastEmittedRef.current) return
    if (body.innerHTML !== renderedHtml) body.innerHTML = renderedHtml
    resize()
  }, [renderedHtml, resize])

  const runCommand = (command: string, argument?: string) => {
    const document = iframeRef.current?.contentDocument
    if (!document) return
    document.execCommand(command, false, argument)
    document.body.focus()
    emitDocument()
  }

  const setLink = () => {
    const url = window.prompt('링크 URL', 'https://')
    if (url === null) return
    if (!url.trim()) runCommand('unlink')
    else runCommand('createLink', url.trim())
  }

  return (
    <div className="space-y-2">
      {editable && (
        <>
          <div className="flex flex-wrap items-center gap-0.5 rounded-t-radius-md border border-b-0 border-gray-200 bg-gray-25 px-2 py-1.5">
            <EditorButton label="굵게" onClick={() => runCommand('bold')}>
              <Bold className="size-4" />
            </EditorButton>
            <EditorButton label="기울임" onClick={() => runCommand('italic')}>
              <Italic className="size-4" />
            </EditorButton>
            <EditorButton label="밑줄" onClick={() => runCommand('underline')}>
              <Underline className="size-4" />
            </EditorButton>
            <EditorButton label="취소선" onClick={() => runCommand('strikeThrough')}>
              <Strikethrough className="size-4" />
            </EditorButton>
            <Divider />
            <EditorButton label="왼쪽 정렬" onClick={() => runCommand('justifyLeft')}>
              <AlignLeft className="size-4" />
            </EditorButton>
            <EditorButton label="가운데 정렬" onClick={() => runCommand('justifyCenter')}>
              <AlignCenter className="size-4" />
            </EditorButton>
            <EditorButton label="오른쪽 정렬" onClick={() => runCommand('justifyRight')}>
              <AlignRight className="size-4" />
            </EditorButton>
            <Divider />
            <EditorButton label="글머리 목록" onClick={() => runCommand('insertUnorderedList')}>
              <List className="size-4" />
            </EditorButton>
            <EditorButton label="번호 목록" onClick={() => runCommand('insertOrderedList')}>
              <ListOrdered className="size-4" />
            </EditorButton>
            <EditorButton label="링크" onClick={setLink}>
              <LinkIcon className="size-4" />
            </EditorButton>
            <Divider />
            <EditorButton label="실행 취소" onClick={() => runCommand('undo')}>
              <Undo2 className="size-4" />
            </EditorButton>
            <EditorButton label="다시 실행" onClick={() => runCommand('redo')}>
              <Redo2 className="size-4" />
            </EditorButton>
          </div>
          <p className="sr-only">아래 문서 본문을 클릭해 직접 수정할 수 있습니다.</p>
        </>
      )}

      <div
        className={`overflow-hidden border border-gray-200 bg-white ${editable ? 'rounded-b-radius-md focus-within:border-brand/50' : 'rounded-radius-md'}`}
      >
        <iframe
          ref={iframeRef}
          title={editable ? 'HTML 문서 본문 편집기' : 'HTML 문서 본문'}
          sandbox="allow-same-origin"
          srcDoc={initialDocumentRef.current}
          className="block min-h-48 w-full border-0"
          onLoad={configureDocument}
        />
      </div>
    </div>
  )
}

function EditorButton({
  label,
  onClick,
  children,
}: {
  label: string
  onClick: () => void
  children: ReactNode
}) {
  return (
    <IconButton
      variant="ghost"
      title={label}
      label={label}
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
      icon={children}
    />
  )
}

function Divider() {
  return <span className="mx-1 h-5 w-px bg-gray-200" aria-hidden />
}
