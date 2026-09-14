import { useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { cn } from '../utils/cn'

export interface FileDropZoneProps {
  /** 고르거나 끌어다 놓은 파일. 실제 업로드·보류 처리는 호출부가 정한다. */
  onFiles: (files: File[]) => void
  /** 업로드가 도는 중 — 상자를 잠그고 문구를 진행 상태로 바꾼다. */
  busy?: boolean
  /** 업로드 말고 다른 이유로 잠긴 경우(다른 작업이 도는 중 등). */
  disabled?: boolean
  /** 쉬고 있을 때의 문구. */
  label?: ReactNode
  /** `busy`일 때의 문구. */
  busyLabel?: ReactNode
  /** 여러 개를 한 번에 고를 수 있는가. */
  multiple?: boolean
  accept?: string
  className?: string
}

/**
 * 파일을 받는 자리(공용) — 끌어다 놓기와 눌러서 고르기를 한 상자로 묶는다.
 *
 * **상자 전체가 버튼이다**(2026-09-05, WORKS 자료 관리에서 정한 규격). 문장 속 '클릭' 두 글자만
 * 눌리고 진짜 입구는 헤더 버튼이던 시절에는 같은 일을 하는 자리가 셋이라 어디가 입구인지
 * 화면이 답하지 못했고, 점선 상자는 문구와 달리 눌러지지 않는 장식이었다.
 *
 * WORKS(자료 관리·파일첨부)와 GUEST(파일받기)가 같은 상자를 쓴다 — 파일을 올리는 동작은 두 앱이
 * 같은 일이므로 모양도 하나여야 한다. 앱마다 다른 것은 올린 뒤의 처리이지 받는 자리가 아니다.
 */
export function FileDropZone({
  onFiles,
  busy = false,
  disabled = false,
  label = '파일을 여기로 끌어다 놓거나 클릭하여 첨부',
  busyLabel = '업로드 중…',
  multiple = true,
  accept,
  className,
}: FileDropZoneProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)
  const locked = busy || disabled

  const emit = (files: FileList | null) => {
    if (!files || files.length === 0) return
    onFiles(Array.from(files))
  }

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        multiple={multiple}
        accept={accept}
        className="hidden"
        onChange={(e) => {
          emit(e.target.files)
          // 같은 파일을 연달아 고를 수 있도록 값을 비운다(고르기를 취소하면 아무 일도 없다).
          e.target.value = ''
        }}
      />
      <button
        type="button"
        disabled={locked}
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => {
          if (locked) return
          e.preventDefault()
          setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          if (locked) return
          e.preventDefault()
          setDragging(false)
          emit(e.dataTransfer.files)
        }}
        className={cn(
          'w-full rounded-radius-md border border-dashed px-4 py-6 text-center text-body transition-colors duration-fast focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand/10 disabled:cursor-not-allowed disabled:opacity-55',
          dragging
            ? 'border-brand bg-brand/5 text-brand-600'
            : 'border-gray-300 bg-gray-50 text-gray-700 hover:border-gray-400 hover:bg-gray-100 hover:text-gray-900',
          className,
        )}
      >
        {busy ? busyLabel : label}
      </button>
    </>
  )
}
