import { Badge, Button, TextArea } from '@ynarcher/ui'
import { useState } from 'react'
import { DetailPanelCard } from '@/features/networks/DetailPanelCard'
import type { BoardComment } from '@/features/hub/boardData'

export interface CommentPanelProps {
  comments: BoardComment[]
  onAdd: (content: string) => void
}

/**
 * 게시글 댓글 패널: 작성 입력 + 목록.
 * 상세페이지 공용 패널(자료 관리·변동 이력)과 카드 톤·구성을 맞추기 위해
 * NETWORKS `DetailPanelCard` 래퍼와 코멘트 패널(FeedbackPanel) 레이아웃을 재사용한다.
 */
export function CommentPanel({ comments, onAdd }: CommentPanelProps) {
  const [draft, setDraft] = useState('')

  const submit = () => {
    const text = draft.trim()
    if (!text) return
    onAdd(text)
    setDraft('')
  }

  // 최신 댓글이 위로 오도록 표시만 뒤집는다(저장은 등록순 유지).
  const list = [...comments].reverse()

  return (
    <DetailPanelCard title="댓글" count={comments.length}>
      <div className="space-y-2">
        <TextArea
          rows={2}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="댓글을 입력하세요. (Enter 등록, Shift+Enter 줄바꿈)"
          onKeyDown={(e) => {
            // Enter로 등록, Shift+Enter는 줄바꿈. 한글 등 IME 조합 중에는 등록하지 않는다.
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault()
              submit()
            }
          }}
        />
        <div className="flex justify-end">
          <Button
            // 비활성 시 투명도 대신 회색으로 표시(디자인 요청).
            className="disabled:bg-gray-100 disabled:!text-gray-400 disabled:opacity-100"
            disabled={!draft.trim()}
            onClick={submit}
          >
            등록
          </Button>
        </div>
      </div>

      <div className="mt-3 border-t border-gray-100 pt-3">
        {list.length > 0 ? (
          <ul className="space-y-2.5">
            {list.map((c, idx) => (
              <li
                key={c.id}
                className="border-t border-gray-100 pt-2.5 first:border-0 first:pt-0"
              >
                <div className="flex items-center gap-2">
                  <span className="text-caption font-medium text-gray-700">{c.author}</span>
                  <span className="text-caption tabular-nums text-gray-700">{c.createdAt}</span>
                  {idx === 0 && (
                    <Badge tone="danger">
                      최신
                    </Badge>
                  )}
                </div>
                <p className="mt-0.5 whitespace-pre-wrap break-words text-body text-gray-800">
                  {c.content}
                </p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-body text-gray-600">등록된 댓글이 없습니다.</p>
        )}
      </div>
    </DetailPanelCard>
  )
}
