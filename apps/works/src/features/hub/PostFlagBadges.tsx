import { Badge } from '@ynarcher/ui'
import type { BoardPost } from '@/features/hub/boardData'

/**
 * 게시글 노출 플래그 표식(공통). 게시판·자료실·공지사항 목록과 게시글 상세가 공유한다.
 *
 * - 전체 공지: 배지가 아니라 제목 앞 `[공지]` 적색 텍스트. 배지 형태는 제목과 무게가 비슷해
 *   목록에서 제목 읽기를 방해했고, 게시판 관례상 말머리 표기가 더 빨리 읽힌다.
 * - 게시판 고정: 목록에서는 No. 칸의 핀 이모지(`pinMark`), 상세에서는 `info` 배지.
 *   고정 행은 순번이 의미를 잃으므로 번호 자리를 쓰는 편이 제목 앞을 비워 읽기 좋다.
 */
export function PostFlagBadges({
  post,
  /** 공지사항 목록처럼 전 항목이 공지인 화면에서는 공지 배지를 숨긴다. */
  showNotice = true,
  /** 목록(No. 칸에 핀 표식을 쓰는 화면)에서는 고정 배지를 숨긴다. */
  showPinned = true,
}: {
  post: Pick<BoardPost, 'globalNotice' | 'pinned'>
  showNotice?: boolean
  showPinned?: boolean
}) {
  return (
    <>
      {showNotice && post.globalNotice && (
        <span className="shrink-0 text-body font-semibold text-danger-700">[공지]</span>
      )}
      {showPinned && post.pinned && <Badge tone="info">고정</Badge>}
    </>
  )
}

/**
 * 목록 No. 칸의 상단 고정 표식. `DataTable`의 `meta.rowMark`에 연결해 번호를 대체한다.
 * 고정이 아니면 `undefined`를 돌려 원래 번호가 그대로 보이게 한다.
 */
export function pinMark(pinned: boolean | undefined) {
  if (!pinned) return undefined
  return (
    <span role="img" aria-label="상단 고정" title="상단 고정" className="text-body">
      📌
    </span>
  )
}
