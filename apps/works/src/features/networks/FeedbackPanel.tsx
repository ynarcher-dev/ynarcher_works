import { Badge, Button, IconButton, Spinner, TextArea, tableText } from '@ynarcher/ui'
import { Trash2 } from 'lucide-react'
import { useState } from 'react'
import { useAuthStore } from '@/auth/authStore'
import { DetailPanelCard } from '@/features/networks/DetailPanelCard'
import { MiniPager, usePaged } from '@/features/networks/MiniPager'
import {
  useCreateFeedback,
  useDeleteFeedback,
  useFeedback,
  type Feedback,
} from '@/features/networks/feedbackHooks'

function formatDateTime(v: string): string {
  return v.length >= 16 ? v.slice(0, 16).replace('T', ' ') : v.slice(0, 10)
}

/**
 * 코멘트 패널(공용). 게시판 댓글과 유사한 레코드 단위 코멘트 스레드.
 * 작성/조회/삭제(소프트)를 entity_feedback 다형 테이블로 처리한다.
 * 국내·글로벌 상세페이지가 공유하며, 대상은 `targetType`/`targetId`로 주입한다.
 */
export function FeedbackPanel({
  targetType,
  targetId,
}: {
  /** 피드백 대상 유형(예: 'expert' | 'investor' | 'global_network'). */
  targetType: string
  /** 피드백 대상 레코드 id. */
  targetId: string
}) {
  const [body, setBody] = useState('')
  const { data: items, isLoading } = useFeedback(targetType, targetId)
  const create = useCreateFeedback(targetType, targetId)
  const remove = useDeleteFeedback(targetType, targetId)
  const me = useAuthStore((s) => s.user)

  const submit = () => {
    const text = body.trim()
    if (!text || create.isPending) return
    create.mutate(text, { onSuccess: () => setBody('') })
  }

  /** 본인 글 또는 admin만 삭제 노출(서버 RLS가 최종 강제). */
  const canDelete = (f: Feedback) =>
    me?.role === 'super_admin' || (me?.id != null && f.author_id === me.id)

  const list = items ?? []
  const { pageItems, page, setPage, pageCount } = usePaged(list)

  return (
    <DetailPanelCard title="코멘트" count={list.length}>
      <div className="space-y-2">
        <TextArea
          rows={2}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="코멘트를 입력하세요. (Enter 등록, Shift+Enter 줄바꿈)"
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
            disabled={!body.trim() || create.isPending}
            onClick={submit}
          >
            {create.isPending ? '등록 중…' : '등록'}
          </Button>
        </div>
        {create.isError && (
          <p className="text-caption text-brand">등록에 실패했습니다. 다시 시도해 주세요.</p>
        )}
      </div>

      <div className="mt-3 border-t border-gray-100 pt-3">
        {isLoading ? (
          <div className="py-4">
            <Spinner />
          </div>
        ) : list.length > 0 ? (
          <>
          <ul className="space-y-2.5">
            {pageItems.map((f, idx) => {
              // 목록은 최신순 정렬이므로 첫 페이지의 첫 항목이 가장 최신 코멘트다.
              const isNewest = page === 0 && idx === 0
              return (
              <li key={f.id} className="border-t border-gray-100 pt-2.5 first:border-0 first:pt-0">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    {/* 작성자는 식별 값, 일시는 메타 — 종전에는 둘이 같은 색이라 구분이 없었다. */}
                    <span className={tableText.primary}>{f.author_name ?? '-'}</span>
                    <span className={`tabular-nums ${tableText.meta}`}>
                      {formatDateTime(f.created_at)}
                    </span>
                    {isNewest && (
                      <Badge tone="danger">
                        최신
                      </Badge>
                    )}
                  </div>
                  {canDelete(f) && (
                    <IconButton
                      variant="ghost"
                      danger
                      label="코멘트 삭제"
                      disabled={remove.isPending && remove.variables === f.id}
                      onClick={() => {
                        if (window.confirm('코멘트를 삭제하시겠습니까?')) remove.mutate(f.id)
                      }}
                      icon={<Trash2 className="size-3.5" />}
                    />
                  )}
                </div>
                <p className="mt-0.5 whitespace-pre-wrap text-body text-gray-800">{f.body}</p>
              </li>
              )
            })}
          </ul>
          <MiniPager page={page} pageCount={pageCount} onPage={setPage} />
          </>
        ) : (
          <p className="text-body text-gray-600">등록된 코멘트가 없습니다.</p>
        )}
      </div>
    </DetailPanelCard>
  )
}
