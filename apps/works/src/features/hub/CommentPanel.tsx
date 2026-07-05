import { Button, TextArea } from '@ynarcher/ui'
import { MessageSquare } from 'lucide-react'
import { useState } from 'react'
import type { BoardComment } from '@/features/hub/boardData'

export interface CommentPanelProps {
  comments: BoardComment[]
  onAdd: (content: string) => void
}

/** 게시글 댓글 패널: 목록 + 작성 입력. */
export function CommentPanel({ comments, onAdd }: CommentPanelProps) {
  const [draft, setDraft] = useState('')

  const submit = () => {
    const text = draft.trim()
    if (!text) return
    onAdd(text)
    setDraft('')
  }

  return (
    <aside className="flex flex-col overflow-hidden rounded-radius-md border border-gray-300 bg-white shadow-soft">
      <header className="flex items-center gap-1.5 border-b border-gray-200 px-4 py-3 text-body font-semibold text-gray-800">
        <MessageSquare className="size-4 text-gray-500" /> 댓글
        <span className="text-caption font-normal text-gray-400">{comments.length}</span>
      </header>

      <div className="space-y-4 px-4 py-4">
        {comments.length === 0 ? (
          <p className="py-8 text-center text-body text-gray-400">
            첫 댓글을 남겨보세요.
          </p>
        ) : (
          comments.map((c) => (
            <div key={c.id} className="space-y-1">
              <div className="flex items-baseline gap-2">
                <span className="text-caption font-semibold text-gray-800">{c.author}</span>
                <span className="tabular-nums text-caption text-gray-400">{c.createdAt}</span>
              </div>
              <p className="whitespace-pre-wrap break-words text-body text-gray-700">
                {c.content}
              </p>
            </div>
          ))
        )}
      </div>

      <div className="space-y-2 border-t border-gray-200 bg-gray-25/60 px-4 py-3">
        <TextArea
          rows={2}
          className="border-gray-300"
          placeholder="댓글을 입력하세요"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            // Ctrl/⌘+Enter로 등록
            if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') submit()
          }}
        />
        <div className="flex justify-end">
          <Button size="sm" onClick={submit} disabled={!draft.trim()}>
            등록
          </Button>
        </div>
      </div>
    </aside>
  )
}
