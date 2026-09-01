import {
  Card,
  DataTable,
  ListToolbar,
  PageHeader,
  Spinner,
  type Column,
} from '@ynarcher/ui'
import { useState } from 'react'
import {
  useAnnouncementFiles,
  useProgramAnnouncements,
  type GuestAnnouncement,
} from '@/features/announcementHooks'
import { GUEST_LIST_PAGE_SIZE, matchesKeyword, pageSlice } from '@/features/listFilter'
import { GuestFileCard } from '@/pages/modules/FileModule'
import { RICH_BODY_CLASS, sanitizeRichText } from '@/lib/richText'

/**
 * 공지사항 — 고정 메뉴 두 번째 줄. 좌측(2)이 목록 표 + 검색, 우측(1)이 고른 공지의 본문과
 * 그 공지에 딸린 파일이다. **좌우 배치는 GUEST 쪽만의 것이다**(2026-09-01 지정) — 같은
 * 내용을 WORKS는 상하로 세운다. 여기는 읽기만 하는 자리라 곁칸으로 충분하고, 저쪽은 쓰는
 * 자리라 에디터와 업로드가 전체 폭을 받아야 한다.
 *
 * 표의 행은 훑는 자리고 본문은 읽는 자리라, 행 안에 본문을 펼치지 않는다.
 * 본문 정화기·조판은 글쓰기·QNA와 같은 한 벌이다.
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
        <div className="mt-5 min-w-0 space-y-5 lg:mt-0">
          <AnnouncementBody announcement={selected} />
          {/* 그 공지에 딸린 파일. 고른 공지가 없거나 파일이 없으면 칸을 세우지 않는다. */}
          {selected && <AnnouncementFilesRail announcementId={selected.id} />}
        </div>
      </div>
    </div>
  )
}

/**
 * 고른 공지의 첨부 파일 — 사업개요·글쓰기의 파일 칸과 같은 판정으로, 파일이 없으면
 * 칸을 세우지 않는다. 행 규격은 WORKS 자료 목록과 같은 공용 카드다.
 */
function AnnouncementFilesRail({ announcementId }: { announcementId: string }) {
  const { data } = useAnnouncementFiles(announcementId)
  if (!data?.length) return null
  return <GuestFileCard files={data} />
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
