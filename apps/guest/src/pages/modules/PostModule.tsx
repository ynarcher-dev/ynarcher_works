import { Card, Spinner } from '@ynarcher/ui'
import { useState } from 'react'
import { useModulePosts, type GuestPost } from '@/features/moduleHooks'
import { formatDate } from '@/lib/format'
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
 * 제목을 눌러 그 자리에서 펼친다. 글마다 경로를 따로 내지 않는 이유는 게스트에서 메뉴 하나가
 * 곧 화면 하나이기 때문이다 — 상세 경로를 만들면 사이드바가 가리키는 곳과 주소창이 어긋난다.
 */
export function PostModule({ moduleId }: { moduleId: string }) {
  const { data, isLoading } = useModulePosts(moduleId)
  const [openId, setOpenId] = useState<string | null>(null)
  const posts = data ?? []

  return (
    <Card title="글" count={posts.length}>
      {isLoading ? (
        <Spinner />
      ) : (
        <div className="space-y-2">
          {posts.map((post) => (
            <PostRow
              key={post.id}
              post={post}
              open={openId === post.id}
              onToggle={() => setOpenId(openId === post.id ? null : post.id)}
            />
          ))}
          {posts.length === 0 && (
            <p className="py-4 text-center text-caption text-gray-500">
              등록된 글이 없습니다.
            </p>
          )}
        </div>
      )}
    </Card>
  )
}

function PostRow({
  post,
  open,
  onToggle,
}: {
  post: GuestPost
  open: boolean
  onToggle: () => void
}) {
  const body = open ? sanitizeRichText(post.body) : ''
  return (
    <div className="rounded-radius-md border border-gray-300">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex min-h-12 w-full items-center justify-between gap-3 px-3 py-2 text-left transition-colors duration-fast hover:bg-gray-25 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand/10"
      >
        <span className="min-w-0 truncate text-body font-medium text-gray-900">
          {post.title}
        </span>
        <span className="shrink-0 text-caption tabular-nums text-gray-600">
          {formatDate(post.activity_date ?? post.created_at)}
        </span>
      </button>
      {open && (
        <div className="border-t border-gray-100 px-3 py-3">
          {body ? (
            <div className={BODY_CLASS} dangerouslySetInnerHTML={{ __html: body }} />
          ) : (
            <p className="text-caption text-gray-500">본문이 없습니다.</p>
          )}
        </div>
      )}
    </div>
  )
}
