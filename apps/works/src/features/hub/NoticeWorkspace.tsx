import { DataTable, Input, PageHeader, type Column } from '@ynarcher/ui'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { NewBadge } from '@/features/hub/DashboardPanel'
import { collectNotices, usePostStore, type NoticeItem } from '@/features/hub/boardPostStore'
import { BOARD_PAGE_SIZE, isNewPost } from '@/features/hub/boardData'
import { pinMark } from '@/features/hub/PostFlagBadges'
import { attachmentColumn, viewsColumn } from '@/features/hub/BoardPanel'
import { useBoards } from '@/features/hub/boardHooks'

/**
 * 공지사항: 게시판이 아니라 전체 공지(globalNotice) 게시글을 모아 보여주는 조회 뷰.
 * 사본을 만들지 않으므로 항목을 클릭하면 원본 게시판의 상세로 이동한다.
 * 설계: docs/docs_planning/3_1_1_board_archive_notice.md
 */
export function NoticeWorkspace() {
  const navigate = useNavigate()
  const [keyword, setKeyword] = useState('')
  const [page, setPage] = useState(0)
  const postsByBoard = usePostStore((s) => s.postsByBoard)
  const boards = useBoards().data ?? []

  const notices = collectNotices(postsByBoard, boards)
  const q = keyword.trim().toLowerCase()
  const rows = q
    ? notices.filter((n) =>
        `${n.post.title} ${n.post.author} ${n.boardLabel}`.toLowerCase().includes(q),
      )
    : notices

  // 검색으로 행이 줄면 현재 페이지가 범위를 벗어날 수 있어 마지막 페이지로 당긴다.
  const pageCount = Math.max(1, Math.ceil(rows.length / BOARD_PAGE_SIZE))
  const safePage = Math.min(page, pageCount - 1)
  const pageRows = rows.slice(safePage * BOARD_PAGE_SIZE, (safePage + 1) * BOARD_PAGE_SIZE)

  const columns: Column<NoticeItem>[] = [
    {
      key: 'title',
      header: '제목',
      // 진입은 행 전체 클릭(onRowClick)이 담당하므로 제목은 텍스트·표식만 렌더한다.
      render: (n) => (
        <span className="flex min-w-0 items-center gap-1.5">
          {/* 전 항목이 전체 공지이고 고정은 No. 칸 핀 표식으로 알리므로 제목 앞 배지는 없다. */}
          <span className="truncate text-gray-800">{n.post.title}</span>
          {isNewPost(n.post.date) && <NewBadge />}
        </span>
      ),
    },
    // 첨부·조회 열은 게시판 목록과 같은 규격을 공유한다.
    attachmentColumn<NoticeItem>((n) => n.post),
    viewsColumn<NoticeItem>((n) => n.post),
    {
      key: 'board',
      header: '게시판',
      align: 'center',
      className: 'w-64',
      // 본문 셀은 DataTable 기본 text-body를 상속한다(캡션 크기를 덧씌우면 다른 열과 어긋남).
      render: (n) => <span className="text-gray-600">{n.boardLabel}</span>,
    },
  ]

  return (
    <div className="flex h-full flex-col gap-5">
      <PageHeader
        title="공지사항"
        search={
          <Input
            placeholder="제목·작성자·게시판 검색"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
          />
        }
      />
      <DataTable
        columns={columns}
        rows={pageRows}
        rowKey={(n) => `${n.boardSlug}:${n.post.id}`}
        emptyText={
          q ? '검색 결과가 없습니다.' : '등록된 공지사항이 없습니다.'
        }
        // 행 전체 클릭으로 원본 게시판 상세로 이동(게시판·회의록 목록과 동일).
        onRowClick={(n) => navigate(`/office?tab=${n.boardSlug}&post=${n.post.id}`)}
        authorLabel="작성자"
        // 공지사항은 조회 전용(원본 게시판 상세로 이동)이라 관리 컬럼을 두지 않는다.
        showManageColumn={false}
        meta={{
          author: (n) => n.post.author,
          updatedAt: (n) => n.post.date,
          active: (n) => !n.post.deletedAt,
          rowMark: (n) => pinMark(n.post.pinned),
        }}
        pagination={{
          page: safePage,
          pageSize: BOARD_PAGE_SIZE,
          total: rows.length,
          onChange: setPage,
        }}
      />
      <p className="text-caption text-gray-600">
        공지사항은 각 게시판에서 &lsquo;전체 공지&rsquo;로 등록한 글을 모아 보여줍니다. 제목을 클릭하면 원본 게시판으로 이동합니다.
      </p>
    </div>
  )
}
