import { useRef, useState } from 'react'

/**
 * 자료 첨부 입력 영역(공용). 드래그앤드롭 + 클릭 파일 선택을 제공하고,
 * 선택된 파일 목록을 `onFiles`로 전달한다. 실제 업로드/보류 처리는 호출부가 결정한다.
 * 등록 폼(보류 첨부)과 상세 수정 폼(즉시 업로드)이 동일한 UI를 공유하기 위한 컴포넌트다.
 *
 * **영역 전체가 버튼이다**(2026-09-05). 종전에는 문장 속의 '클릭' 두 글자만 눌렸고, 파일 선택창을
 * 여는 진짜 자리는 카드 헤더의 '업로드' 버튼이었다 — 같은 일을 하는 자리가 셋(헤더 버튼·문장 속
 * 링크·드롭)이라 어느 것이 이 카드의 입구인지 화면이 답하지 못했고, 점선 상자는 문구가 그렇게
 * 적혀 있는데도 눌러지지 않는 장식이었다. 지금은 헤더 버튼을 걷고 이 상자 하나로 모았다.
 *
 * 업로드가 도는 동안(`busy`)에는 상자가 잠기고 문구가 진행 상태를 대신 말한다 — 진행을 알리던
 * 헤더 버튼이 사라졌으므로 그 말도 이 자리로 함께 옮겨 온다.
 */
export function MaterialDropZone({
  onFiles,
  busy = false,
}: {
  onFiles: (files: File[]) => void
  /** 업로드 진행 중. 상자를 잠그고 문구를 진행 상태로 바꾼다. */
  busy?: boolean
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)

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
      <button
        type="button"
        disabled={busy}
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => {
          if (busy) return
          e.preventDefault()
          setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          if (busy) return
          e.preventDefault()
          setDragging(false)
          emit(e.dataTransfer.files)
        }}
        className={`w-full rounded-radius-md border border-dashed px-4 py-6 text-center text-body transition-colors duration-fast focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand/10 disabled:cursor-not-allowed disabled:opacity-55 ${
          dragging
            ? 'border-brand bg-brand/5 text-brand-600'
            : 'border-gray-300 bg-gray-50 text-gray-700 hover:border-gray-400 hover:bg-gray-100 hover:text-gray-900'
        }`}
      >
        {busy ? '업로드 중…' : '파일을 여기로 끌어다 놓거나 클릭하여 첨부'}
      </button>
    </>
  )
}
