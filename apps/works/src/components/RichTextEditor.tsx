import { EditorContent, useEditor, useEditorState, type Editor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { Placeholder } from '@tiptap/extension-placeholder'
import { Image } from '@tiptap/extension-image'
import { TextAlign } from '@tiptap/extension-text-align'
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bold,
  Code,
  Heading1,
  Heading2,
  Heading3,
  ImagePlus,
  Italic,
  Link as LinkIcon,
  List,
  ListOrdered,
  Minus,
  Quote,
  Redo2,
  SquareCode,
  Strikethrough,
  Underline as UnderlineIcon,
  Undo2,
} from 'lucide-react'
import { useEffect, useRef, type ReactNode } from 'react'

function buildExtensions(placeholder: string) {
  return [
    StarterKit.configure({
      heading: { levels: [1, 2, 3] },
      link: { openOnClick: false, autolink: true },
    }),
    Placeholder.configure({ placeholder }),
    Image.configure({ inline: false, allowBase64: true }),
    TextAlign.configure({ types: ['heading', 'paragraph'] }),
  ]
}

const extensions = buildExtensions('내용을 입력하세요…')

/** 읽기 전용 렌더러: 저장된 HTML을 에디터 스키마로 파싱해 안전하게 표시한다. */
export function RichTextViewer({ html }: { html: string }) {
  const editor = useEditor({
    extensions,
    content: html,
    editable: false,
    immediatelyRender: false,
  })
  useEffect(() => {
    editor?.commands.setContent(html)
  }, [editor, html])
  if (!editor) return null
  return (
    <div className="rte">
      <EditorContent editor={editor} />
    </div>
  )
}

export interface RichTextEditorProps {
  value: string
  onChange: (html: string) => void
  placeholder?: string
}

/** 편집 가능한 리치 텍스트 에디터(툴바 + 본문). 값은 HTML 문자열. */
export function RichTextEditor({ value, onChange, placeholder }: RichTextEditorProps) {
  const editor = useEditor({
    extensions: placeholder ? buildExtensions(placeholder) : extensions,
    content: value,
    immediatelyRender: false,
    editorProps: {
      attributes: { class: 'px-4 py-3' },
    },
    onUpdate: ({ editor }) => onChange(editor.getHTML()),
  })

  if (!editor) return null

  return (
    <div className="rte overflow-hidden rounded-radius-md border border-gray-300 bg-white shadow-soft focus-within:border-brand/50">
      <Toolbar editor={editor} />
      <EditorContent editor={editor} />
    </div>
  )
}

/** 툴바: 활성 상태는 useEditorState로 구독해 하이라이트한다. */
function Toolbar({ editor }: { editor: Editor }) {
  const imageInputRef = useRef<HTMLInputElement>(null)

  const state = useEditorState({
    editor,
    selector: ({ editor }) => ({
      bold: editor.isActive('bold'),
      italic: editor.isActive('italic'),
      underline: editor.isActive('underline'),
      strike: editor.isActive('strike'),
      h1: editor.isActive('heading', { level: 1 }),
      h2: editor.isActive('heading', { level: 2 }),
      h3: editor.isActive('heading', { level: 3 }),
      bullet: editor.isActive('bulletList'),
      ordered: editor.isActive('orderedList'),
      quote: editor.isActive('blockquote'),
      code: editor.isActive('code'),
      codeBlock: editor.isActive('codeBlock'),
      link: editor.isActive('link'),
      alignLeft: editor.isActive({ textAlign: 'left' }),
      alignCenter: editor.isActive({ textAlign: 'center' }),
      alignRight: editor.isActive({ textAlign: 'right' }),
      canUndo: editor.can().undo(),
      canRedo: editor.can().redo(),
    }),
  })

  const chain = () => editor.chain().focus()

  const setLink = () => {
    const prev = editor.getAttributes('link').href as string | undefined
    const url = window.prompt('링크 URL', prev ?? 'https://')
    if (url === null) return
    if (url === '') {
      chain().extendMarkRange('link').unsetLink().run()
      return
    }
    chain().extendMarkRange('link').setLink({ href: url }).run()
  }

  // 데모: 이미지를 base64 data URL로 인라인 삽입한다(서버 연동 시 업로드 경로로 대체).
  const insertImage = (file?: File) => {
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      const src = reader.result
      if (typeof src === 'string') chain().setImage({ src }).run()
    }
    reader.readAsDataURL(file)
  }

  return (
    <div className="flex flex-wrap items-center gap-0.5 border-b border-gray-200 bg-gray-25 px-2 py-1.5">
      <Btn active={state.h1} onClick={() => chain().toggleHeading({ level: 1 }).run()} label="제목 1"><Heading1 className="size-4" /></Btn>
      <Btn active={state.h2} onClick={() => chain().toggleHeading({ level: 2 }).run()} label="제목 2"><Heading2 className="size-4" /></Btn>
      <Btn active={state.h3} onClick={() => chain().toggleHeading({ level: 3 }).run()} label="제목 3"><Heading3 className="size-4" /></Btn>
      <Divider />
      <Btn active={state.bold} onClick={() => chain().toggleBold().run()} label="굵게"><Bold className="size-4" /></Btn>
      <Btn active={state.italic} onClick={() => chain().toggleItalic().run()} label="기울임"><Italic className="size-4" /></Btn>
      <Btn active={state.underline} onClick={() => chain().toggleUnderline().run()} label="밑줄"><UnderlineIcon className="size-4" /></Btn>
      <Btn active={state.strike} onClick={() => chain().toggleStrike().run()} label="취소선"><Strikethrough className="size-4" /></Btn>
      <Divider />
      <Btn active={state.alignLeft} onClick={() => chain().setTextAlign('left').run()} label="왼쪽 정렬"><AlignLeft className="size-4" /></Btn>
      <Btn active={state.alignCenter} onClick={() => chain().setTextAlign('center').run()} label="가운데 정렬"><AlignCenter className="size-4" /></Btn>
      <Btn active={state.alignRight} onClick={() => chain().setTextAlign('right').run()} label="오른쪽 정렬"><AlignRight className="size-4" /></Btn>
      <Divider />
      <Btn active={state.bullet} onClick={() => chain().toggleBulletList().run()} label="글머리 목록"><List className="size-4" /></Btn>
      <Btn active={state.ordered} onClick={() => chain().toggleOrderedList().run()} label="번호 목록"><ListOrdered className="size-4" /></Btn>
      <Btn active={state.quote} onClick={() => chain().toggleBlockquote().run()} label="인용"><Quote className="size-4" /></Btn>
      <Btn active={state.code} onClick={() => chain().toggleCode().run()} label="인라인 코드"><Code className="size-4" /></Btn>
      <Btn active={state.codeBlock} onClick={() => chain().toggleCodeBlock().run()} label="코드 블록"><SquareCode className="size-4" /></Btn>
      <Btn active={state.link} onClick={setLink} label="링크"><LinkIcon className="size-4" /></Btn>
      <Divider />
      <Btn onClick={() => imageInputRef.current?.click()} label="이미지"><ImagePlus className="size-4" /></Btn>
      <Btn onClick={() => chain().setHorizontalRule().run()} label="구분선"><Minus className="size-4" /></Btn>
      <Divider />
      <Btn disabled={!state.canUndo} onClick={() => chain().undo().run()} label="실행 취소"><Undo2 className="size-4" /></Btn>
      <Btn disabled={!state.canRedo} onClick={() => chain().redo().run()} label="다시 실행"><Redo2 className="size-4" /></Btn>

      <input
        ref={imageInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          insertImage(e.target.files?.[0])
          e.target.value = ''
        }}
      />
    </div>
  )
}

function Btn({
  onClick,
  active,
  disabled,
  label,
  children,
}: {
  onClick: () => void
  active?: boolean
  disabled?: boolean
  label: string
  children: ReactNode
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active}
      disabled={disabled}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className={`grid size-8 place-items-center rounded-radius-sm transition-colors duration-fast disabled:opacity-30 ${
        active
          ? 'bg-brand/10 text-brand'
          : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
      }`}
    >
      {children}
    </button>
  )
}

function Divider() {
  return <span className="mx-1 h-5 w-px bg-gray-200" aria-hidden />
}
