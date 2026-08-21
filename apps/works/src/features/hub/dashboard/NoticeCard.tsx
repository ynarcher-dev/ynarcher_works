import { Badge, Button, Card, EmptyState, Spinner, cardText, pinMark } from '@ynarcher/ui'
import { useNavigate } from 'react-router-dom'
import { isNewPost } from '@/features/hub/boardData'
import { useNotices } from '@/features/hub/boardPostsApi'
import { NewBadge } from '@/features/hub/PostFlagBadges'
import { DASHBOARD_TILE_AREA } from '@/features/hub/dashboard/tileArea'

/** 대시보드에서 바로 훑을 공지 수. 체크리스트 카드와 같은 세 줄 높이를 쓴다. */
const VISIBLE_NOTICES = 3

/**
 * OFFICE 대시보드의 공지사항 카드.
 * 전체 공지 원장을 복제하지 않고 `useNotices`를 그대로 읽으며, 항목은 원본 게시판 상세로 연다.
 */
export function NoticeCard() {
  const navigate = useNavigate()
  const { data: notices = [], isLoading } = useNotices()

  const openNotice = (boardSlug: string, postId: string) => {
    navigate(`/office?tab=${boardSlug}&post=${postId}`)
  }

  return (
    <Card
      title="공지사항"
      count={notices.length}
      actions={
        <Button variant="outline" onClick={() => navigate('/office?tab=notices')}>
          전체 보기
        </Button>
      }
    >
      <div className={`flex flex-col ${DASHBOARD_TILE_AREA}`}>
        {isLoading ? (
          <div className="flex flex-1 items-center justify-center">
            <Spinner />
          </div>
        ) : notices.length === 0 ? (
          <EmptyState
            title="등록된 공지사항이 없습니다."
            description="새 공지가 등록되면 이곳에 표시됩니다."
            className="flex-1 py-0"
          />
        ) : (
          <ul className="space-y-2">
            {notices.slice(0, VISIBLE_NOTICES).map((notice) => (
              <li key={`${notice.boardSlug}:${notice.post.id}`}>
                <button
                  type="button"
                  onClick={() => openNotice(notice.boardSlug, notice.post.id)}
                  className="flex w-full items-center gap-2 rounded-radius-md bg-gray-50 px-3 py-2 text-left transition-colors duration-fast hover:bg-gray-100 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand/10"
                >
                  {pinMark(notice.post.pinned)}
                  <span className={`min-w-0 flex-1 truncate ${cardText.subhead}`}>
                    {notice.post.title}
                  </span>
                  {isNewPost(notice.post.date) && <NewBadge />}
                  <Badge tone="neutral">{notice.boardLabel}</Badge>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Card>
  )
}
