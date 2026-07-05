import { DataTable, type Column } from '@ynarcher/ui'
import { isNewPost, type BoardPost } from '@/features/hub/boardData'
import { NewBadge } from '@/features/hub/DashboardPanel'

/** 제목 열: 게시글 제목 + 최근 72시간 이내면 NEW 배지. */
const columns: Column<BoardPost>[] = [
  {
    key: 'title',
    header: '제목',
    render: (p) => (
      <span className="flex min-w-0 items-center gap-1.5">
        <span className="truncate text-gray-800">{p.title}</span>
        {isNewPost(p.date) && <NewBadge />}
      </span>
    ),
  },
]

/**
 * 게시판형 화면(공지사항·자료실·인사이트) 공통 목록.
 * 공용 DataTable(No. + 표준 메타 컬럼: 작성자/수정일/비활성화) 기반.
 * 작성자는 `author`, 수정일 슬롯에는 게시일(`date`)을 매핑한다.
 */
export function BoardPanel({
  posts,
  emptyText = '등록된 게시글이 없습니다.',
}: {
  posts: BoardPost[]
  emptyText?: string
}) {
  return (
    <DataTable
      columns={columns}
      rows={posts}
      rowKey={(p) => p.id}
      emptyText={emptyText}
      meta={{ author: (p) => p.author, updatedAt: (p) => p.date }}
    />
  )
}
