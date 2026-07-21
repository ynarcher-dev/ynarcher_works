import { Download, File, Paperclip, X } from 'lucide-react'
import { useRef, useState } from 'react'
import type { BoardAttachment } from '@/features/hub/boardData'

/** 바이트를 사람이 읽는 단위로 변환. */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  const units = ['KB', 'MB', 'GB']
  let n = bytes / 1024
  let i = 0
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024
    i += 1
  }
  return `${n.toFixed(n < 10 ? 1 : 0)} ${units[i]}`
}

/** File → BoardAttachment(세션 objectURL 포함). */
function toAttachment(file: File): BoardAttachment {
  return {
    id: `att-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name: file.name,
    size: file.size,
    type: file.type || 'application/octet-stream',
    url: URL.createObjectURL(file),
  }
}

export interface AttachmentFieldProps {
  value: BoardAttachment[]
  onChange: (next: BoardAttachment[]) => void
}

/** 첨부파일 입력: 드래그&드롭 + 파일 선택 + 목록/삭제. */
export function AttachmentField({ value, onChange }: AttachmentFieldProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)

  const add = (files: FileList | null) => {
    if (!files || files.length === 0) return
    onChange([...value, ...Array.from(files).map(toAttachment)])
  }

  const remove = (id: string) => {
    const target = value.find((a) => a.id === id)
    if (target?.url) URL.revokeObjectURL(target.url)
    onChange(value.filter((a) => a.id !== id))
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1.5 text-caption font-semibold text-gray-600">
        <Paperclip className="size-3.5" /> 첨부파일
      </div>

      <div
        onDragOver={(e) => {
          e.preventDefault()
          setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault()
          setDragging(false)
          add(e.dataTransfer.files)
        }}
        onClick={() => inputRef.current?.click()}
        className={`flex cursor-pointer flex-col items-center justify-center gap-1 rounded-radius-md border border-dashed px-4 py-5 text-center transition-colors duration-fast ${
          dragging
            ? 'border-brand bg-brand/5'
            : 'border-gray-300 bg-gray-25 hover:border-gray-400'
        }`}
      >
        <p className="text-body text-gray-600">
          파일을 여기로 끌어다 놓거나 <span className="font-semibold text-brand">클릭</span>하여 선택
        </p>
        <p className="text-caption text-gray-600">여러 파일을 한 번에 첨부할 수 있습니다.</p>
        <input
          ref={inputRef}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => {
            add(e.target.files)
            e.target.value = ''
          }}
        />
      </div>

      {value.length > 0 && (
        <ul className="space-y-1.5">
          {value.map((a) => (
            <li
              key={a.id}
              className="flex items-center gap-2 rounded-radius-sm border border-gray-200 bg-white px-3 py-2"
            >
              <File className="size-4 shrink-0 text-gray-400" />
              <span className="min-w-0 flex-1 truncate text-body text-gray-800">{a.name}</span>
              <span className="shrink-0 tabular-nums text-caption text-gray-600">
                {formatBytes(a.size)}
              </span>
              <button
                type="button"
                aria-label="첨부 삭제"
                onClick={() => remove(a.id)}
                className="grid size-6 shrink-0 place-items-center rounded-radius-sm text-gray-400 transition-colors duration-fast hover:bg-danger-subtle hover:text-danger"
              >
                <X className="size-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/** 첨부파일 읽기 목록: 다운로드 링크. */
export function AttachmentList({ attachments }: { attachments: BoardAttachment[] }) {
  if (attachments.length === 0) return null
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1.5 text-caption font-semibold text-gray-600">
        <Paperclip className="size-3.5" /> 첨부파일 {attachments.length}
      </div>
      <ul className="space-y-1.5">
        {attachments.map((a) => (
          <li
            key={a.id}
            className="flex items-center gap-2 rounded-radius-sm border border-gray-200 bg-white px-3 py-2"
          >
            <File className="size-4 shrink-0 text-gray-400" />
            <span className="min-w-0 flex-1 truncate text-body text-gray-800">{a.name}</span>
            <span className="shrink-0 tabular-nums text-caption text-gray-600">
              {formatBytes(a.size)}
            </span>
            <a
              href={a.url ?? '#'}
              download={a.name}
              aria-label={`${a.name} 다운로드`}
              className={`grid size-6 shrink-0 place-items-center rounded-radius-sm transition-colors duration-fast ${
                a.url
                  ? 'text-gray-500 hover:bg-gray-100 hover:text-gray-900'
                  : 'pointer-events-none text-gray-300'
              }`}
            >
              <Download className="size-4" />
            </a>
          </li>
        ))}
      </ul>
    </div>
  )
}
