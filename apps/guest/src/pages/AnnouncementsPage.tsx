import { Card, MiniPager, PageHeader, Spinner, usePaged } from '@ynarcher/ui'
import { useState } from 'react'
import { useProgramAnnouncements } from '@/features/announcementHooks'
import { RICH_BODY_CLASS, sanitizeRichText } from '@/lib/richText'

/**
 * 공지사항 — 고정 메뉴 두 번째 줄. WORKS 사업 상세의 공지사항 탭과 **같은 구성**(제목 줄 →
 * 펼쳐 읽기)이며 작성·수정만 없다. 머리 한 줄 규격([브랜드 바 | 제목 | 게시일])과 본문
 * 정화기·조판은 NOTICE·글쓰기와 같은 한 벌이다.
 */
export function AnnouncementsPage() {
  const { data, isLoading } = useProgramAnnouncements()
  const [openId, setOpenId] = useState<string | null>(null)

  const list = data ?? []
  const { pageItems, page, setPage, pageCount } = usePaged(list)

  if (isLoading) return <Spinner />

  return (
    <div className="space-y-5">
      <PageHeader title="공지사항" />
      <Card title="공지" count={list.length}>
        {list.length === 0 ? (
          <p className="py-6 text-center text-body text-gray-600">
            아직 등록된 공지가 없습니다.
          </p>
        ) : (
          <>
            <ul className="divide-y divide-gray-200">
              {pageItems.map((a) => (
                <li key={a.id}>
                  {/* GUEST 터치 하한(48px)을 행에도 얹는다 — 사이드바 메뉴와 같은 근거(3_9 §3). */}
                  <button
                    type="button"
                    className="flex min-h-12 w-full items-center gap-2 py-2.5 text-left hover:bg-gray-25"
                    aria-expanded={openId === a.id}
                    onClick={() => setOpenId(openId === a.id ? null : a.id)}
                  >
                    <span aria-hidden className="h-3.5 w-0.5 shrink-0 rounded-full bg-brand" />
                    <span className="min-w-0 flex-1 truncate text-body font-semibold text-gray-900">
                      {a.title}
                    </span>
                    <span className="shrink-0 text-caption tabular-nums text-gray-500">
                      {a.created_at.slice(0, 10)}
                    </span>
                  </button>
                  {openId === a.id && (
                    <div className="pb-3 pl-2.5">
                      {a.body ? (
                        <div
                          className={RICH_BODY_CLASS}
                          dangerouslySetInnerHTML={{ __html: sanitizeRichText(a.body) }}
                        />
                      ) : (
                        <p className="text-body text-gray-600">본문이 없는 공지입니다.</p>
                      )}
                    </div>
                  )}
                </li>
              ))}
            </ul>
            <MiniPager page={page} pageCount={pageCount} onPage={setPage} />
          </>
        )}
      </Card>
    </div>
  )
}
