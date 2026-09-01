import { PageHeader, Spinner } from '@ynarcher/ui'
import { useOverviewFiles, useProgramOverview } from '@/features/overviewHooks'
import { GuestFileCard } from '@/pages/modules/FileModule'
import { RICH_BODY_CLASS, sanitizeRichText } from '@/lib/richText'

/**
 * 사업개요 — 로그인 직후 첫 화면. WORKS 사업 상세의 사업개요 탭과 **같은 구성**이며
 * 편집만 없다 — 소개문(2)과 소개문에 딸린 파일(1)의 2:1 분할(메뉴 화면과 같은 비율).
 * 메뉴(모듈)가 아니라 사업 자체의 소개라 사이드바 최상단에 고정으로 서고, 원장이 세우는
 * 하위 메뉴와는 구분선으로 갈린다(GuestLayout).
 * 본문은 글쓰기·NOTICE와 같은 허용 목록 정화기·조판 한 벌을 태운다.
 */
export function OverviewPage() {
  const { data: body, isLoading } = useProgramOverview()

  if (isLoading) return <Spinner />

  const html = sanitizeRichText(body)

  return (
    <div className="space-y-5">
      <PageHeader title="사업개요" />
      {/* 머리와 그 밑 구분선은 전체 폭으로 서고, 분할은 그 아래에서 시작한다(메뉴 화면과
          같은 규칙). 파일이 없으면 우측 칸은 empty:hidden으로 칸째 사라진다. */}
      <div className="lg:grid lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] lg:gap-6">
        <div className="min-w-0">
          <article className="rounded-radius-md border border-gray-200 bg-white p-6">
            {html ? (
              <div className={RICH_BODY_CLASS} dangerouslySetInnerHTML={{ __html: html }} />
            ) : (
              <p className="py-8 text-center text-body text-gray-600">
                아직 등록된 사업소개가 없습니다.
              </p>
            )}
          </article>
        </div>
        <div className="mt-5 min-w-0 empty:hidden lg:mt-0">
          <OverviewFilesRail />
        </div>
      </div>
    </div>
  )
}

/**
 * 사업개요 우측의 첨부 파일 — WORKS 사업개요 탭 우측 파일 패널의 게스트판. 글쓰기 메뉴의
 * 파일 칸과 같은 판정으로, 파일이 없으면 칸을 세우지 않는다.
 */
function OverviewFilesRail() {
  const { data } = useOverviewFiles()
  if (!data?.length) return null
  return <GuestFileCard files={data} />
}
