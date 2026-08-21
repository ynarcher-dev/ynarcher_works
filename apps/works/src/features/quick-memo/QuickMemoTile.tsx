import { Badge, cardText, cn, pinMark } from '@ynarcher/ui'
import { memoSurface } from './quickMemoColors'
import type { QuickMemo } from './quickMemoStore'

function formatTime(value: string) {
  const date = new Date(value)
  return date.toDateString() === new Date().toDateString()
    ? date.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })
    : date.toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' })
}

function preview(memo: QuickMemo) {
  if (memo.type === 'NOTE') return memo.content.trim() || '내용이 없습니다.'
  return `${memo.items.filter((item) => item.completed).length}/${memo.items.length} 완료`
}

function checklistStatus(memo: QuickMemo) {
  const completed = memo.items.filter((item) => item.completed).length
  if (completed === 0) return { label: '대기', tone: 'neutral' as const }
  if (completed === memo.items.length) return { label: '완료', tone: 'success' as const }
  return { label: '진행중', tone: 'info' as const }
}

/**
 * 메모 한 장(타일) — 색 바탕 위에 고정 핀·제목·미리보기·시각을 얹은 목록 줄.
 *
 * 퀵 메모 슬라이드오버 목록과 OFFICE 대시보드 카드가 **같은 한 벌을 나눠 쓴다.** 두 자리가
 * 같은 것을 보여 주므로, 타일 모양이 갈리지 않도록 이 파일 하나만 고치면 둘이 함께 따라온다.
 *
 * `titleOnly`는 대시보드 카드의 자리다 — 거기서는 메모를 읽는 것이 아니라 무엇이 쌓여 있는지만
 * 훑으므로 내용(미리보기) 줄을 걷고 제목 한 줄로 선다. 읽는 자리(패널 목록)는 내용을 남긴다.
 */
export function QuickMemoTile({
  memo,
  onClick,
  titleOnly = false,
}: {
  memo: QuickMemo
  onClick: () => void
  titleOnly?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'w-full rounded-radius-md p-3 text-left transition-[filter] hover:brightness-[0.98]',
        memoSurface(memo.color),
      )}
    >
      <div className={cn('flex justify-between gap-3', titleOnly ? 'items-center' : 'items-start')}>
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            {pinMark(memo.pinned)}
            <p className={`truncate ${cardText.subhead}`}>{memo.title || '제목 없는 메모'}</p>
            {memo.type === 'CHECKLIST' && (
              <Badge tone={checklistStatus(memo).tone} dot>
                {checklistStatus(memo).label}
              </Badge>
            )}
          </div>
          {!titleOnly && <p className={`mt-1 line-clamp-2 ${cardText.subtitle}`}>{preview(memo)}</p>}
        </div>
        <span className={`shrink-0 ${cardText.meta}`}>{formatTime(memo.updatedAt)}</span>
      </div>
    </button>
  )
}
