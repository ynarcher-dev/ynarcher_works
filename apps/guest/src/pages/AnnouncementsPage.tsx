import {
  Card,
  DataTable,
  ListToolbar,
  PageHeader,
  Spinner,
  type Column,
} from '@ynarcher/ui'
import { useState } from 'react'
import { useProgramAnnouncements, type GuestAnnouncement } from '@/features/announcementHooks'
import { GUEST_LIST_PAGE_SIZE, matchesKeyword, pageSlice } from '@/features/listFilter'
import { RICH_BODY_CLASS, sanitizeRichText } from '@/lib/richText'

/**
 * 공지사항 — 고정 메뉴 두 번째 줄. WORKS 사업 상세의 공지사항 탭과 **같은 구성**(2:1 분할,
 * 목록 표 + 검색, 행을 누르면 우측에 본문)이며 작성·수정만 없다.
 *
 * 좌측(2)이 목록이고 우측(1)이 읽는 자리다 — 표의 행은 훑는 자리고 본문은 읽는 자리라,
 * 행 안에 본문을 펼치면 열 위치가 흔들린다. 본문 정화기·조판은 글쓰기·QNA와 같은 한 벌이다.
 */
export function AnnouncementsPage() {
  const { data, isLoading } = useProgramAnnouncements()
  const [keyword, setKeyword] = useState('')
  const [page, setPage] = useState(0)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const all = data ?? []
  const filtered = all.filter((a) => matchesKeyword(keyword, a))
  const { pageRows, safePage } = pageSlice(filtered, page)
  const selected = all.find((a) => a.id === selectedId) ?? null

  const columns: Column<GuestAnnouncement>[] = [
    { key: 'title', header: '제목', type: 'name', primary: true },
    {
      key: 'created_at',
      header: '게시일',
      type: 'date',
      render: (a) => a.created_at.slice(0, 10),
    },
  ]

  if (isLoading) return <Spinner />

  return (
    <div className="space-y-5">
      <PageHeader title="공지사항" />
      <div className="lg:grid lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] lg:gap-6">
        <div className="min-w-0">
          <Card title="공지" count={filtered.length}>
            <div className="space-y-3">
              <ListToolbar
                keyword={keyword}
                onKeywordChange={(v) => {
                  setKeyword(v)
                  setPage(0)
                }}
                searchPlaceholder="제목·내용 검색"
              />
              <DataTable
                columns={columns}
                rows={pageRows}
                rowKey={(a) => a.id}
                numbered={false}
                standardColumns={false}
                emptyText={
                  keyword ? '검색 결과가 없습니다.' : '아직 등록된 공지가 없습니다.'
                }
                onRowClick={(a) => setSelectedId(selectedId === a.id ? null : a.id)}
                rowClassName={(a) => (a.id === selectedId ? 'bg-brand/5' : undefined)}
                pagination={{
                  page: safePage,
                  pageSize: GUEST_LIST_PAGE_SIZE,
                  total: filtered.length,
                  onChange: setPage,
                  compact: true,
                }}
              />
            </div>
          </Card>
        </div>
        <div className="mt-5 min-w-0 lg:mt-0">
          <AnnouncementBody announcement={selected} />
        </div>
      </div>
    </div>
  )
}

/** 우측에 서는 공지 1건. 고르기 전에는 무엇을 하라는 화면인지 말한다. */
function AnnouncementBody({ announcement }: { announcement: GuestAnnouncement | null }) {
  if (!announcement) {
    return (
      <Card title="본문">
        <p className="py-6 text-center text-body text-gray-600">
          왼쪽 목록에서 공지를 선택하면 내용이 표시됩니다.
        </p>
      </Card>
    )
  }

  return (
    <Card title="본문">
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <span aria-hidden className="h-3.5 w-0.5 shrink-0 rounded-full bg-brand" />
          <p className="min-w-0 flex-1 text-body font-semibold text-gray-900">
            {announcement.title}
          </p>
          <span className="shrink-0 text-caption tabular-nums text-gray-500">
            {announcement.created_at.slice(0, 10)}
          </span>
        </div>
        {announcement.body ? (
          <div
            className={RICH_BODY_CLASS}
            dangerouslySetInnerHTML={{ __html: sanitizeRichText(announcement.body) }}
          />
        ) : (
          <p className="text-body text-gray-600">본문이 없는 공지입니다.</p>
        )}
      </div>
    </Card>
  )
}
