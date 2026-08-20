import { DataTable, type Column } from '@ynarcher/ui'
import { Paperclip } from 'lucide-react'
import { useState } from 'react'
import { isNewPost } from '@/features/hub/boardData'
import { NewBadge } from '@/features/hub/DashboardPanel'
import { MINUTE_VISIBILITY_LABEL, type MinuteListItem } from '@/features/office/minutes/minutesApi'

const PAGE_SIZE = 15

interface Props {
  minutes: MinuteListItem[]
  /** 첨부가 있는 회의록 id 집합. */
  attachmentIds: Set<string>
  emptyText?: string
  onSelect: (m: MinuteListItem) => void
}

/**
 * 회의록 목록 표. 게시판 목록과 같은 공용 DataTable 규격을 쓴다.
 * 열: No. · 제목 · 공개범위(전체/일부) · 첨부 · 조회 · 작성자 · 회의일.
 * 수정·삭제는 목록이 아니라 상세 페이지에서 수행하므로 관리 컬럼을 두지 않는다.
 * 표준 우측 컬럼(등록자/수정일) 대신 회의일을 노출해야 해서 standardColumns=false로 직접 구성한다.
 */
export function MinutesTable({
  minutes,
  attachmentIds,
  emptyText,
  onSelect,
}: Props) {
  const [page, setPage] = useState(0)
  const pageCount = Math.max(1, Math.ceil(minutes.length / PAGE_SIZE))
  const safePage = Math.min(page, pageCount - 1)
  const rows = minutes.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE)

  // 폭·정렬은 열마다의 종류(type)가 정한다 — 수동 w-* 폭을 적지 않는다(2026-08 디자인 리프레시).
  const columns: Column<MinuteListItem>[] = [
    {
      key: 'title',
      header: '제목',
      type: 'name',
      // 진입은 행 전체 클릭(onRowClick)이 담당하므로 제목은 텍스트만 렌더한다.
      render: (m) => (
        <span className="flex min-w-0 items-center gap-1.5">
          <span className="truncate text-gray-800">{m.title}</span>
          {isNewPost(m.createdAt) && <NewBadge />}
        </span>
      ),
    },
    {
      // 공개범위: 태그가 아니라 텍스트 컬럼으로 전체공개/일부공개를 표기한다.
      // 일부공개(제한 공개)는 붉은색으로 색만 갈라 표기하고, 전체공개는 기본 본문색.
      // 별도의 버건디 톤을 두었었지만, 화면에 붉은 계열이 둘로 갈려 같은 '주의' 신호가
      // 자리마다 다른 색으로 보였다 — 제한 표기도 danger 램프 하나로 모은다(2026-08-03).
      key: 'visibility',
      header: '공개범위',
      type: 'badge',
      render: (m) => (
        <span
          className={
            m.visibility === 'PARTICIPANTS' ? 'font-medium text-danger-700' : 'text-gray-600'
          }
        >
          {MINUTE_VISIBILITY_LABEL[m.visibility]}
        </span>
      ),
    },
    {
      key: 'attachment',
      header: '첨부',
      type: 'badge',
      render: (m) =>
        attachmentIds.has(m.id) ? (
          <span className="inline-flex items-center justify-center" title="첨부 있음">
            <Paperclip aria-label="첨부 있음" className="size-4 text-gray-500" />
          </span>
        ) : (
          <span className="sr-only">첨부 없음</span>
        ),
    },
    {
      // 조회수는 한두 자리에 머무는 짧은 카운트라 우측 정렬하면 헤더 '조회'와 눈에 띄게
      // 어긋난다. 가운데로 모으되 자릿수가 늘 때 폭이 흔들리지 않게 tabular-nums는 남긴다
      // (게시판·공지사항 viewsColumn과 같은 규칙).
      key: 'views',
      header: '조회',
      type: 'count',
      align: 'center',
      render: (m) => <span className="tabular-nums text-gray-600">{m.viewCount.toLocaleString()}</span>,
    },
    {
      // 작성자는 게시판류와 같이 가운데로 모은다(person 기본 좌측을 덮는 예외).
      key: 'author',
      header: '작성자',
      type: 'person',
      align: 'center',
      render: (m) => <span className="text-gray-600">{m.authorName ?? '-'}</span>,
    },
    {
      key: 'meetingDate',
      header: '회의일',
      type: 'date',
      render: (m) => <span className="tabular-nums text-gray-600">{m.meetingDate ?? '-'}</span>,
    },
  ]

  return (
    <DataTable
      columns={columns}
      rows={rows}
      rowKey={(m) => m.id}
      emptyText={emptyText}
      standardColumns={false}
      onRowClick={onSelect}
      pagination={{ page: safePage, pageSize: PAGE_SIZE, total: minutes.length, onChange: setPage }}
    />
  )
}
