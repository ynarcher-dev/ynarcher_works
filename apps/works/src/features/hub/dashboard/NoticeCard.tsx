import { Button, Card, EmptyState, Spinner, cardText, pinMark } from '@ynarcher/ui'
import { useNavigate } from 'react-router-dom'
import { isNewPost } from '@/features/hub/boardData'
import { useNotices } from '@/features/hub/boardPostsApi'
import { NewBadge } from '@/features/hub/PostFlagBadges'
import { DASHBOARD_CARD_FOOTER, DASHBOARD_TILE_AREA } from '@/features/hub/dashboard/tileArea'

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
    <Card title="공지사항" count={notices.length}>
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
                  // 여백은 옆 칸 체크리스트 타일과 같은 p-3이다(2026-08-26). 종전 py-2는 줄
                  // 높이를 37px로 만들어, 같은 세 줄인데도 나란히 선 두 카드의 줄이 8px씩
                  // 어긋나고 잡아 둔 자리(45px×3)의 아래가 공지 쪽만 비었다.
                  className="flex w-full items-center gap-2 rounded-radius-md bg-gray-50 p-3 text-left transition-colors duration-fast hover:bg-gray-100 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand/10"
                >
                  {pinMark(notice.post.pinned)}
                  <span className={`min-w-0 flex-1 truncate ${cardText.subhead}`}>
                    {notice.post.title}
                  </span>
                  {isNewPost(notice.post.date) && <NewBadge />}
                  {/* 줄 끝은 **언제 올라왔는가**다. 종전에는 어느 게시판에서 온 공지인지를
                      배지로 적었지만, 이 카드는 전사 공지만 모아 보이는 자리라 출처가 갈리는
                      일이 드물고(대개 전부 '공용게시판'이다) 같은 말이 매 줄 반복됐다.
                      공지를 훑을 때 실제로 묻는 것은 '새 소식인가'이며, NEW 배지가 72시간
                      안쪽만 답하므로 그 뒤로는 날짜가 그 물음을 이어받는다. 출처는 눌러서
                      건너간 원본 게시판이 답한다. */}
                  <span className={`shrink-0 tabular-nums ${cardText.meta}`}>
                    {notice.post.date}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      <Button variant="ghost" className={DASHBOARD_CARD_FOOTER}
        onClick={() => navigate('/office?tab=notices')}>
        전체 보기
      </Button>
    </Card>
  )
}
