import { DataTable, type Column } from '@ynarcher/ui'
import { isNewPost, type BoardPost } from '@/features/hub/boardData'
import { NewBadge } from '@/features/hub/DashboardPanel'

/** 제목 열 렌더러. onSelect가 있으면 제목을 클릭 가능한 버튼으로 노출한다. */
function titleColumn(onSelect?: (post: BoardPost) => void): Column<BoardPost>[] {
  return [
    {
      key: 'title',
      header: '제목',
      render: (p) =>
        onSelect ? (
          <button
            type="button"
            onClick={() => onSelect(p)}
            className="flex min-w-0 items-center gap-1.5 text-left"
          >
            <span className="truncate text-gray-800 hover:text-brand hover:underline">
              {p.title}
            </span>
            {isNewPost(p.date) && <NewBadge />}
          </button>
        ) : (
          <span className="flex min-w-0 items-center gap-1.5">
            <span className="truncate text-gray-800">{p.title}</span>
            {isNewPost(p.date) && <NewBadge />}
          </span>
        ),
    },
  ]
}

/**
 * 게시판형 화면(공지사항·자료실·인사이트) 공통 목록.
 * 공용 DataTable(No. + 표준 메타 컬럼: 작성자/수정일/비활성화) 기반.
 * 작성자는 `author`, 수정일 슬롯에는 게시일(`date`)을 매핑한다.
 */
export function BoardPanel({
  posts,
  emptyText = '등록된 게시글이 없습니다.',
  onSelect,
}: {
  posts: BoardPost[]
  emptyText?: string
  onSelect?: (post: BoardPost) => void
}) {
  return (
    <DataTable
      columns={titleColumn(onSelect)}
      rows={posts}
      rowKey={(p) => p.id}
      emptyText={emptyText}
      meta={{ author: (p) => p.author, updatedAt: (p) => p.date }}
    />
  )
}
