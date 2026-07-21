import { useEffect, useRef, useState, type MutableRefObject } from 'react'

/**
 * 자료 첨부 입력 영역(공용). 드래그앤드롭 + 클릭 파일 선택을 제공하고,
 * 선택된 파일 목록을 `onFiles`로 전달한다. 실제 업로드/보류 처리는 호출부가 결정한다.
 * 등록 폼(보류 첨부)과 상세 수정 폼(즉시 업로드)이 동일한 UI를 공유하기 위한 컴포넌트다.
 */
export function MaterialDropZone({
  onFiles,
  openRef,
}: {
  onFiles: (files: File[]) => void
  /** 외부(패널 헤더의 '업로드' 버튼 등)에서 파일 선택창을 열기 위한 핸들. */
  openRef?: MutableRefObject<(() => void) | null>
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)

  useEffect(() => {
    if (!openRef) return
    openRef.current = () => inputRef.current?.click()
    return () => {
      openRef.current = null
    }
  }, [openRef])

  const emit = (files: FileList | null) => {
    if (!files || files.length === 0) return
    onFiles(Array.from(files))
  }

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        multiple
        className="hidden"
        onChange={(e) => {
          emit(e.target.files)
          e.target.value = ''
        }}
      />
      <div
        onDragOver={(e) => {
          e.preventDefault()
          setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault()
          setDragging(false)
          emit(e.dataTransfer.files)
        }}
        className={`rounded-radius-md border border-dashed px-4 py-6 text-center transition-colors duration-fast ${
          dragging ? 'border-brand bg-brand/5' : 'border-gray-300 bg-gray-50'
        }`}
      >
        <p className="text-body text-gray-700">
          파일을 여기로 끌어다 놓거나{' '}
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="font-semibold text-brand hover:text-brand-600"
          >
            클릭
          </button>
          하여 첨부
        </p>
      </div>
    </>
  )
}
