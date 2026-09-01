import { Spinner } from '@ynarcher/ui'
import { useModulePosts } from '@/features/moduleHooks'
import { sanitizeRichText } from '@/lib/richText'

/** 본문 서식(문단·목록·링크)의 최소 조판. 에디터 런타임 없이 클래스만으로 세운다. */
const BODY_CLASS =
  'text-body text-gray-800 [&_p]:mb-2 [&_ul]:mb-2 [&_ul]:list-disc [&_ul]:pl-5 ' +
  '[&_ol]:mb-2 [&_ol]:list-decimal [&_ol]:pl-5 [&_a]:text-brand [&_a]:underline ' +
  '[&_strong]:font-semibold [&_blockquote]:border-l-2 [&_blockquote]:border-gray-300 ' +
  '[&_blockquote]:pl-3 [&_blockquote]:text-gray-600'

/**
 * 글쓰기 메뉴 — 운영자가 남긴 글을 읽는다(게스트는 읽기 전용).
 *
 * **모듈 하나가 곧 글 하나**이므로 목록을 거치지 않고 본문이 바로 열린다 — WORKS의 글쓰기
 * 화면과 같은 구성이며 편집만 없다. 글의 제목은 모듈명이 대신하므로(머리에 이미 서 있다)
 * 본문 위에 제목을 다시 세우지 않는다. 과거 커스텀 활동에서 여러 건이 넘어온 모듈은
 * WORKS와 같은 판정으로 최신 글을 본문으로 본다.
 */
export function PostModule({ moduleId }: { moduleId: string }) {
  const { data, isLoading } = useModulePosts(moduleId)

  if (isLoading) return <Spinner />

  const post = (data ?? [])[0]
  const body = post ? sanitizeRichText(post.body) : ''

  return (
    <article className="rounded-radius-md border border-gray-200 bg-white p-6">
      {body ? (
        <div className={BODY_CLASS} dangerouslySetInnerHTML={{ __html: body }} />
      ) : (
        <p className="py-8 text-center text-body text-gray-600">
          아직 작성된 내용이 없습니다.
        </p>
      )}
    </article>
  )
}
