import { useEffect, useRef } from 'react'
import { cn } from '@ynarcher/ui'
import type { AiMessage } from '@/features/hub/aiAgent'
import { YnarcherMark } from '@/features/hub/YnarcherMark'

interface AiAgentThreadProps {
  messages: AiMessage[]
}

/** 대화 스레드 — 사용자/에이전트 메시지 버블 렌더링 + 자동 하단 스크롤. */
export function AiAgentThread({ messages }: AiAgentThreadProps) {
  const endRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [messages])

  return (
    <div className="flex-1 space-y-6 overflow-y-auto px-1 py-4">
      {messages.map((m) =>
        m.role === 'user' ? (
          <div key={m.id} className="flex justify-end">
            <div className="max-w-[80%] whitespace-pre-wrap rounded-radius-md rounded-tr-sm border border-gray-300 bg-white px-4 py-2.5 text-body text-gray-800 shadow-soft">
              {m.content}
            </div>
          </div>
        ) : (
          <div key={m.id} className="flex gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-radius-sm bg-gradient-to-br from-brand to-brand-700 text-white shadow-soft">
              <YnarcherMark className="w-6" />
            </span>
            <div className="min-w-0 flex-1 pt-0.5">
              {m.pending ? (
                <TypingDots />
              ) : (
                <div className="whitespace-pre-wrap text-body leading-relaxed text-gray-800">
                  {m.content}
                </div>
              )}
            </div>
          </div>
        ),
      )}
      <div ref={endRef} />
    </div>
  )
}

/** 응답 생성 대기 인디케이터(점 3개 애니메이션). */
function TypingDots() {
  return (
    <div className="flex items-center gap-1 py-1.5">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className={cn(
            'h-2 w-2 animate-bounce rounded-full bg-gray-300',
          )}
          style={{ animationDelay: `${i * 0.15}s` }}
        />
      ))}
    </div>
  )
}
