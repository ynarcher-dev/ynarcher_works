import { ArrowUp, Plus } from 'lucide-react'
import { useEffect, useRef, type KeyboardEvent } from 'react'

interface AiAgentComposerProps {
  value: string
  onChange: (value: string) => void
  onSubmit: () => void
  /** 응답 생성 중에는 전송을 잠급니다. */
  busy: boolean
}

/** 하단 고정 입력 컴포저 — 자동 높이 조절 텍스트영역 + 전송 버튼. */
export function AiAgentComposer({
  value,
  onChange,
  onSubmit,
  busy,
}: AiAgentComposerProps) {
  const ref = useRef<HTMLTextAreaElement>(null)
  const canSend = value.trim().length > 0 && !busy

  // 입력 길이에 따라 텍스트영역 높이를 자동 확장(최대 5줄 상당).
  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`
  }, [value])

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault()
      if (canSend) onSubmit()
    }
  }

  return (
    <div className="shrink-0 pt-2">
      <div className="flex items-end gap-2 rounded-radius-lg border border-gray-300 bg-white p-2 shadow-soft transition-colors focus-within:border-brand/50 focus-within:shadow-popover">
        <button
          type="button"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-radius-sm text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
          aria-label="첨부"
        >
          <Plus className="h-5 w-5" strokeWidth={1.75} />
        </button>

        <textarea
          ref={ref}
          rows={1}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="AI 에이전트에게 무엇이든 물어보세요"
          className="max-h-40 flex-1 resize-none self-center border-0 bg-transparent py-1.5 text-body text-gray-800 placeholder:text-gray-400 focus:outline-none focus:ring-0"
        />

        <button
          type="button"
          onClick={onSubmit}
          disabled={!canSend}
          aria-label="전송"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-radius-sm bg-brand text-white shadow-sm shadow-brand/20 transition-all hover:bg-brand-600 active:scale-95 disabled:cursor-not-allowed disabled:bg-gray-200 disabled:text-gray-400 disabled:shadow-none"
        >
          <ArrowUp className="h-5 w-5" strokeWidth={2} />
        </button>
      </div>

      <p className="mt-2 text-center text-caption text-gray-600">
        AI 에이전트는 미리보기 단계입니다. 답변에는 부정확한 내용이 포함될 수 있습니다.
      </p>
    </div>
  )
}
