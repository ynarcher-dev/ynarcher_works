import { DataTable, type Column } from '@ynarcher/ui'
import { Paperclip } from 'lucide-react'
import { useState } from 'react'
import { BOARD_PAGE_SIZE, isNewPost, type BoardPost } from '@/features/hub/boardData'
import { NewBadge } from '@/features/hub/DashboardPanel'
import { PostFlagBadges, pinMark } from '@/features/hub/PostFlagBadges'

/**
 * 첨부 유무 열(공통). 건수는 상세에서 확인하므로 목록에서는 있음/없음만 알린다.
 * 게시판·공지사항 목록이 공유한다.
 */
export function attachmentColumn<T>(get: (row: T) => BoardPost): Column<T> {
  return {
    key: 'attachment',
    header: '첨부',
    align: 'center',
    className: 'w-16',
    render: (row) => {
      const count = get(row).attachments?.length ?? 0
      if (count === 0) return <span className="sr-only">첨부 없음</span>
      return (
        <span className="inline-flex items-center justify-center" title={`첨부 ${count}건`}>
          <Paperclip aria-label={`첨부 ${count}건`} className="size-4 text-gray-500" />
        </span>
      )
    },
  }
}

/** 조회수 열(공통). 수치이므로 우측 정렬 + tabular-nums(5_component_spec_rules §3.1). */
export function viewsColumn<T>(get: (row: T) => BoardPost): Column<T> {
  return {
    key: 'views',
    header: '조회',
    align: 'right',
    numeric: true,
    className: 'w-20',
    render: (row) => (
      <span className="text-gray-600">{(get(row).views ?? 0).toLocaleString()}</span>
    ),
  }
}

/** 제목 열 렌더러. onSelect가 있으면 제목을 클릭 가능한 버튼으로 노출한다. */
function titleColumn(onSelect?: (post: BoardPost) => void): Column<BoardPost> {
  return {
    key: 'title',
    header: '제목',
    render: (p) => {
      // 고정은 No. 칸 핀 표식으로 알리므로 제목 앞에는 공지 말머리만 남긴다.
      const badges = <PostFlagBadges post={p} showPinned={false} />
      return onSelect ? (
        <button
          type="button"
          onClick={() => onSelect(p)}
          className="flex min-w-0 items-center gap-1.5 text-left"
        >
          {badges}
          <span className="truncate text-gray-800 hover:text-brand hover:underline">
            {p.title}
          </span>
          {isNewPost(p.date) && <NewBadge />}
        </button>
      ) : (
        <span className="flex min-w-0 items-center gap-1.5">
          {badges}
          <span className="truncate text-gray-800">{p.title}</span>
          {isNewPost(p.date) && <NewBadge />}
        </span>
      )
    },
  }
}

/**
 * 게시판 목록 공통 표.
 * 열 구성: No.(고정 시 📌) · 제목 · 첨부 · 조회 · [게시판] · 작성자 · 수정일 · 관리.
 * 표준 메타 컬럼과 페이저는 공용 DataTable 규격을 따른다(5_component_spec_rules.md §3.1~3.2).
 */
export function BoardPanel({
  posts,
  emptyText = '등록된 게시글이 없습니다.',
  boardLabel,
  onSelect,
  onEdit,
  onDeactivate,
}: {
  posts: BoardPost[]
  emptyText?: string
  /** 소속 게시판명. 지정 시 '게시판' 열을 노출한다(여러 게시판을 섞어 보여줄 때 사용). */
  boardLabel?: string
  onSelect?: (post: BoardPost) => void
  /** 수정 핸들러. 지정 시 표준 관리 컬럼에 수정 버튼이 노출된다(상세 진입 없이 바로 편집). */
  onEdit?: (post: BoardPost) => void
  /** 비활성화(소프트 삭제) 핸들러. 미지정 시 표준 관리 컬럼 버튼이 비활성으로 노출된다. */
  onDeactivate?: (post: BoardPost) => void
}) {
  const [page, setPage] = useState(0)
  // 검색 등으로 행 수가 줄면 현재 페이지가 범위를 벗어날 수 있어 마지막 페이지로 당긴다.
  const pageCount = Math.max(1, Math.ceil(posts.length / BOARD_PAGE_SIZE))
  const safePage = Math.min(page, pageCount - 1)
  const pageRows = posts.slice(safePage * BOARD_PAGE_SIZE, (safePage + 1) * BOARD_PAGE_SIZE)

  const columns: Column<BoardPost>[] = [
    titleColumn(onSelect),
    attachmentColumn<BoardPost>((p) => p),
    viewsColumn<BoardPost>((p) => p),
  ]
  if (boardLabel) {
    columns.push({
      key: 'board',
      header: '게시판',
      align: 'center',
      className: 'w-64',
      // 본문 셀은 DataTable 기본 text-body를 상속한다(캡션 크기를 덧씌우면 다른 열과 어긋남).
      render: () => <span className="text-gray-600">{boardLabel}</span>,
    })
  }

  return (
    <DataTable
      columns={columns}
      rows={pageRows}
      rowKey={(p) => p.id}
      emptyText={emptyText}
      meta={{
        author: (p) => p.author,
        updatedAt: (p) => p.date,
        active: (p) => !p.deletedAt,
        onEdit,
        onDeactivate,
        rowMark: (p) => pinMark(p.pinned),
      }}
      pagination={{
        page: safePage,
        pageSize: BOARD_PAGE_SIZE,
        total: posts.length,
        onChange: setPage,
      }}
    />
  )
}
