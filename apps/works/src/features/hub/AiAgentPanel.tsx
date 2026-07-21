import { Button } from '@ynarcher/ui'
import { SquarePen } from 'lucide-react'
import { useRef, useState } from 'react'
import { useAuthStore } from '@/auth/authStore'
import { AiAgentComposer } from '@/features/hub/AiAgentComposer'
import { AiAgentThread } from '@/features/hub/AiAgentThread'
import { AiAgentWelcome } from '@/features/hub/AiAgentWelcome'
import { draftPreviewReply, type AiMessage } from '@/features/hub/aiAgent'

/**
 * HUB AI 에이전트 — 대화형 어시스턴트 UI.
 *
 * 현재는 UI 미리보기 단계로, 응답은 임시 프리뷰 텍스트입니다.
 * Gemini RAG/Text-to-SQL 파이프라인 확정 후 `draftPreviewReply`를
 * 실제 스트리밍 호출로 대체하면 됩니다.
 */
export function AiAgentPanel() {
  const userName = useAuthStore((s) => s.user?.name ?? '동료')
  const [messages, setMessages] = useState<AiMessage[]>([])
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const seq = useRef(0)
  const nextId = () => `m${(seq.current += 1)}`

  function send(text: string) {
    const content = text.trim()
    if (!content || busy) return

    const pendingId = nextId()
    setMessages((prev) => [
      ...prev,
      { id: nextId(), role: 'user', content },
      { id: pendingId, role: 'assistant', content: '', pending: true },
    ])
    setDraft('')
    setBusy(true)

    // 모델 연동 전까지 임시 프리뷰 응답을 지연 렌더링(타이핑 인디케이터 노출).
    window.setTimeout(() => {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === pendingId
            ? { ...m, content: draftPreviewReply(content), pending: false }
            : m,
        ),
      )
      setBusy(false)
    }, 900)
  }

  function reset() {
    setMessages([])
    setDraft('')
    setBusy(false)
  }

  const hasConversation = messages.length > 0

  return (
    <div className="mx-auto flex h-[calc(100vh-13rem)] min-h-[28rem] w-full max-w-3xl flex-col">
      {hasConversation && (
        <div className="flex shrink-0 justify-end pb-2">
          <Button variant="ghost" onClick={reset}>
            <SquarePen className="h-4 w-4" strokeWidth={1.75} />
            대화 새로하기
          </Button>
        </div>
      )}

      {hasConversation ? (
        <AiAgentThread messages={messages} />
      ) : (
        <AiAgentWelcome userName={userName} onPick={send} />
      )}

      <AiAgentComposer
        value={draft}
        onChange={setDraft}
        onSubmit={() => send(draft)}
        busy={busy}
      />
    </div>
  )
}
