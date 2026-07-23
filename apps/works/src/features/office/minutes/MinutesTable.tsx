import { DataTable, type Column } from '@ynarcher/ui'
import { Paperclip } from 'lucide-react'
import { useState } from 'react'
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

  const columns: Column<MinuteListItem>[] = [
    {
      key: 'title',
      header: '제목',
      // 진입은 행 전체 클릭(onRowClick)이 담당하므로 제목은 텍스트만 렌더한다.
      render: (m) => (
        <span className="flex min-w-0">
          <span className="truncate text-gray-800">{m.title}</span>
        </span>
      ),
    },
    {
      // 공개범위: 태그가 아니라 텍스트 컬럼으로 전체공개/일부공개를 표기한다.
      // 일부공개(제한 공개)는 버건디로 색만으로 구분하고, 전체공개는 기본 본문색.
      key: 'visibility',
      header: '공개범위',
      align: 'center',
      className: 'w-24',
      render: (m) => (
        <span className={m.visibility === 'PARTICIPANTS' ? 'font-medium text-burgundy' : 'text-gray-600'}>
          {MINUTE_VISIBILITY_LABEL[m.visibility]}
        </span>
      ),
    },
    {
      key: 'attachment',
      header: '첨부',
      align: 'center',
      className: 'w-16',
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
      key: 'views',
      header: '조회',
      align: 'right',
      numeric: true,
      className: 'w-20',
      render: (m) => <span className="tabular-nums text-gray-600">{m.viewCount.toLocaleString()}</span>,
    },
    {
      key: 'author',
      header: '작성자',
      align: 'center',
      className: 'w-24',
      render: (m) => <span className="text-gray-600">{m.authorName ?? '-'}</span>,
    },
    {
      key: 'meetingDate',
      header: '회의일',
      align: 'center',
      className: 'w-28',
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
