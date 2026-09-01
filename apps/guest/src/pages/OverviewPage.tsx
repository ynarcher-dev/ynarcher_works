import { PageHeader, Spinner } from '@ynarcher/ui'
import { useProgramOverview } from '@/features/overviewHooks'
import { RICH_BODY_CLASS, sanitizeRichText } from '@/lib/richText'

/**
 * 사업개요 — 로그인 직후 첫 화면. WORKS 사업 상세의 사업개요 탭과 **같은 내용**이며
 * 편집만 없다. 메뉴(모듈)가 아니라 사업 자체의 소개라 사이드바 최상단에 고정으로 서고,
 * 원장이 세우는 하위 메뉴와는 구분선으로 갈린다(GuestLayout).
 * 본문은 글쓰기·NOTICE와 같은 허용 목록 정화기·조판 한 벌을 태운다.
 */
export function OverviewPage() {
  const { data: body, isLoading } = useProgramOverview()

  if (isLoading) return <Spinner />

  const html = sanitizeRichText(body)

  return (
    <div className="space-y-5">
      <PageHeader title="사업개요" />
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
  )
}
