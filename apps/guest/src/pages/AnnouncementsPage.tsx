import {
  Card,
  DataTable,
  ListToolbar,
  PageHeader,
  Spinner,
  type Column,
} from '@ynarcher/ui'
import { Paperclip } from 'lucide-react'
import { useState } from 'react'
import { BoardDetailModal } from '@/components/BoardDetailModal'
import {
  useAnnouncementFiles,
  useProgramAnnouncements,
  type GuestAnnouncement,
} from '@/features/announcementHooks'
import { useAttachmentCounts } from '@/features/attachmentCounts'
import { GUEST_LIST_PAGE_SIZE, matchesKeyword, pageSlice } from '@/features/listFilter'
import { RICH_BODY_CLASS, sanitizeRichText } from '@/lib/richText'

const ANNOUNCEMENT_ATTACHMENT_TYPE = 'program_announcement'

/**
 * 공지사항 — 고정 메뉴 두 번째 줄. 목록 표가 전체 폭으로 서고, 행을 누르면 **상세 모달**이
 * 열린다(2026-09-01 사용자 지정) — WORKS 공지사항 탭과 같은 구성이며 작성·수정만 없다.
 * 모달은 QNA와 같은 부품(BoardDetailModal)이라 두 화면이 같은 구조로 글과 첨부를 보여 준다.
 */
export function AnnouncementsPage() {
  const { data, isLoading } = useProgramAnnouncements()
  const [keyword, setKeyword] = useState('')
  const [page, setPage] = useState(0)
  const [openId, setOpenId] = useState<string | null>(null)

  const all = data ?? []
  const filtered = all.filter((a) => matchesKeyword(keyword, a))
  const { pageRows, safePage } = pageSlice(filtered, page)
  const opened = all.find((a) => a.id === openId) ?? null
  // 클립 표식은 화면에 뜬 행만 센다 — 목록 전체를 세면 안 보이는 행까지 왕복에 싣는다.
  const { data: fileCounts } = useAttachmentCounts(
    ANNOUNCEMENT_ATTACHMENT_TYPE,
    pageRows.map((a) => a.id),
  )

  const columns: Column<GuestAnnouncement>[] = [
    {
      key: 'title',
      header: '제목',
      type: 'name',
      primary: true,
      // 첨부가 있으면 제목 뒤에 클립을 단다 — 열어 보기 전에 "받을 것이 있는가"를 답한다.
      render: (a) => (
        <span className="flex min-w-0 items-center gap-1.5">
          <span className="min-w-0 truncate">{a.title}</span>
          {(fileCounts?.[a.id] ?? 0) > 0 && (
            <Paperclip
              className="size-3.5 shrink-0 text-gray-500"
              aria-label={`첨부 ${fileCounts?.[a.id]}건`}
            />
          )}
        </span>
      ),
    },
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
      {/* 본문 폭은 다른 GUEST 화면과 같은 2:1 격자를 따른다(2026-09-01 사용자 지정) —
          목록이 화면 전체를 가로지르면 메뉴마다 콘텐츠의 좌우 끝이 달라진다. 우측 칸은
          비워 두되 자리는 지킨다(상세가 모달로 열려 곁칸에 세울 것이 없다). */}
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
                emptyText={keyword ? '검색 결과가 없습니다.' : '아직 등록된 공지가 없습니다.'}
                onRowClick={(a) => setOpenId(a.id)}
                // 페이저는 목록 화면의 기본 양식(번호줄·건수)을 쓴다 — 한 쪽뿐이어도
                // 노출된다(WORKS 목록과 같은 규칙).
                pagination={{
                  page: safePage,
                  pageSize: GUEST_LIST_PAGE_SIZE,
                  total: filtered.length,
                  onChange: setPage,
                }}
              />
            </div>
          </Card>
        </div>
      </div>
      {opened && <AnnouncementModal announcement={opened} onClose={() => setOpenId(null)} />}
    </div>
  )
}

/** 공지 1건의 상세 모달. 첨부는 열린 공지의 것만 조회한다. */
function AnnouncementModal({
  announcement,
  onClose,
}: {
  announcement: GuestAnnouncement
  onClose: () => void
}) {
  const { data: files } = useAnnouncementFiles(announcement.id)
  const html = sanitizeRichText(announcement.body)

  return (
    <BoardDetailModal
      open
      onClose={onClose}
      meta="공지사항"
      title={announcement.title}
      date={announcement.created_at.slice(0, 10)}
      body={
        html ? (
          <div className={RICH_BODY_CLASS} dangerouslySetInnerHTML={{ __html: html }} />
        ) : (
          <p className="text-body text-gray-600">본문이 없는 공지입니다.</p>
        )
      }
      files={files ?? []}
    />
  )
}
