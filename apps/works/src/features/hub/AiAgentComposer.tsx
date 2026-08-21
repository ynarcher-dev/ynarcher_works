import { IconButton, cn, formText } from '@ynarcher/ui'
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
      {/* 카드가 아니라 입력 상자다 — 안에 담긴 것을 보여주는 면이 아니라 글을 받는 자리이고,
          그래서 focus-within으로 테두리·그림자가 반응한다. 카드 셸로 바꾸면 그 반응이 사라진다.
          모서리가 카드와 같은 단계인 것은 이 상자가 대화 영역의 바닥 전체를 차지하기 때문이다. */}
      {/* eslint-disable-next-line no-restricted-syntax -- 위 사유로 CardShell 대상이 아니다. */}
      <div className="flex items-end gap-2 rounded-radius-lg border border-gray-300 bg-white p-2 shadow-soft transition-colors focus-within:border-brand/50 focus-within:shadow-popover">
        <IconButton
          variant="ghost"
          label="첨부"
          icon={<Plus className="h-5 w-5" strokeWidth={1.75} />}
        />

        <textarea
          ref={ref}
          rows={1}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="AI 에이전트에게 무엇이든 물어보세요"
          className="max-h-40 flex-1 resize-none self-center border-0 bg-transparent py-1.5 text-body text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-0"
        />

        <button
          type="button"
          onClick={onSubmit}
          disabled={!canSend}
          aria-label="전송"
          // 브랜드 채움 아이콘 버튼은 IconButton의 3종(outline·ghost·selected) 밖이라 여기서
          // 만들지만, 모서리·포커스 링·크기는 아이콘 버튼 규격을 그대로 따른다.
          className="grid size-icon-card shrink-0 place-items-center rounded-radius-md bg-brand text-white transition-all hover:bg-brand-600 active:scale-95 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand/10 disabled:cursor-not-allowed disabled:bg-gray-200 disabled:text-gray-400"
        >
          <ArrowUp className="h-5 w-5" strokeWidth={2} />
        </button>
      </div>

      <p className={cn('mt-2 text-center', formText.hint)}>
        AI 에이전트는 미리보기 단계입니다. 답변에는 부정확한 내용이 포함될 수 있습니다.
      </p>
    </div>
  )
}
