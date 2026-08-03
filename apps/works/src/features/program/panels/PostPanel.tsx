import { Button, Spinner, useToast } from '@ynarcher/ui'
import { useState } from 'react'
import { RichTextEditor, RichTextViewer } from '@/components/RichTextEditor'
import { useModulePosts, useSavePost } from '@/features/program/moduleContentHooks'

/**
 * 글쓰기 모듈(전체 화면). **모듈 하나가 곧 글 하나**이며, 들어오면 목록을 거치지 않고
 * 본문이 바로 열린다.
 *
 * 글 목록을 두지 않는 이유: 모듈 인스턴스 자체가 이미 이름을 가진 한 덩어리의 기록이다.
 * 그 아래에 또 목록을 두면 이름이 두 층('모듈명'과 '글 제목')으로 갈려 어느 쪽이 이 기록의
 * 이름인지 모호해지고, 한 건뿐인 목록을 한 번 더 클릭해야 본문에 닿는다. 여러 건을 남기고
 * 싶다면 모듈을 하나 더 만드는 쪽이 보드에서 바로 보인다.
 *
 * 제목은 모듈명이 대신하므로 별도 입력을 받지 않는다(원장의 title은 NOT NULL이라 모듈명을
 * 그대로 적는다). 본문 에디터·뷰어는 게시판·회의록과 같은 공용 리치텍스트다.
 */
export function PostPanel({
  programId,
  moduleId,
  moduleTitle,
}: {
  programId: string
  moduleId: string
  /** 모듈명. 글의 제목 자리를 대신한다. */
  moduleTitle: string
}) {
  const toast = useToast()
  const { data: posts = [], isLoading } = useModulePosts(moduleId)
  const save = useSavePost(programId, moduleId)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')

  // 이 모듈의 본문 한 건. 과거 커스텀 활동에서 여러 건이 넘어왔다면 최신 글을 본문으로 본다.
  const post = posts[0]
  const body = post?.body ?? ''

  const startEdit = () => {
    setDraft(body)
    setEditing(true)
  }

  const submit = async () => {
    if (save.isPending) return
    try {
      await save.mutateAsync({ id: post?.id, title: moduleTitle || '본문', body: draft })
      setEditing(false)
    } catch {
      toast.show('저장에 실패했습니다. 권한을 확인하세요.', 'danger')
    }
  }

  if (isLoading) return <Spinner />

  if (editing) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-end gap-2">
          <Button variant="outline" onClick={() => setEditing(false)} disabled={save.isPending}>
            취소
          </Button>
          <Button onClick={() => void submit()} disabled={save.isPending}>
            {save.isPending ? '저장 중…' : '저장'}
          </Button>
        </div>
        <RichTextEditor value={draft} onChange={setDraft} />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-end gap-2">
        {post && (
          <span className="mr-auto text-caption text-gray-600">
            최종 수정 {post.updated_at.slice(0, 10)}
          </span>
        )}
        <Button onClick={startEdit}>{body ? '수정' : '작성'}</Button>
      </div>
      <article className="rounded-radius-md border border-gray-200 bg-white p-6">
        {body ? (
          <RichTextViewer html={body} />
        ) : (
          <p className="py-8 text-center text-body text-gray-600">
            작성된 내용이 없습니다. 오른쪽 위 &lsquo;작성&rsquo;을 눌러 본문을 남겨 보세요.
          </p>
        )}
      </article>
    </div>
  )
}
