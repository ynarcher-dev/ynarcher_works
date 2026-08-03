import {
  BackButton,
  Button,
  DataTable,
  EmptyValue,
  Input,
  Spinner,
  useToast,
  type Column,
} from '@ynarcher/ui'
import { useState } from 'react'
import { RichTextEditor, RichTextViewer } from '@/components/RichTextEditor'
import {
  useDeletePost,
  useModulePosts,
  useSavePost,
  type ProgramPost,
} from '@/features/program/moduleContentHooks'

/** 본문 HTML에서 태그를 걷어 목록용 한 줄 요약을 만든다(에디터가 낳은 마크업은 표에서 의미가 없다). */
function plainSummary(html: string | null): string {
  if (!html) return ''
  return html.replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim()
}

/**
 * 글쓰기 모듈(전체 화면). 게시판과 같은 3상태 — 목록 / 읽기 / 편집 — 를 한 화면에서 돈다.
 *
 * 링크·파일과 달리 모달이 아닌 이유는 머무는 화면이기 때문이다(목록에서 고르고, 읽고,
 * 고치는 일이 이어진다). 본문 에디터·뷰어는 게시판·회의록과 같은 공용 리치텍스트를 쓴다.
 */
export function PostPanel({ programId, moduleId }: { programId: string; moduleId: string }) {
  const { data: posts = [], isLoading } = useModulePosts(moduleId)
  // undefined=목록 / null=신규 작성 / ProgramPost=읽기
  const [opened, setOpened] = useState<ProgramPost | null | undefined>(undefined)
  const [editing, setEditing] = useState(false)

  const backToList = () => {
    setOpened(undefined)
    setEditing(false)
  }

  if (isLoading) return <Spinner />

  if (opened !== undefined) {
    // 신규(null)는 곧바로 편집, 기존 글은 '수정'을 누를 때 편집으로 넘어간다.
    return editing || opened === null ? (
      <PostEditor
        key={opened?.id ?? 'new'}
        programId={programId}
        moduleId={moduleId}
        post={opened ?? undefined}
        onDone={backToList}
        onCancel={opened === null ? backToList : () => setEditing(false)}
      />
    ) : (
      <PostReader
        post={opened}
        moduleId={moduleId}
        onEdit={() => setEditing(true)}
        onBack={backToList}
        onDeleted={backToList}
      />
    )
  }

  const columns: Column<ProgramPost>[] = [
    { key: 'title', header: '제목', render: (p) => <span className="text-gray-800">{p.title}</span> },
    {
      key: 'summary',
      header: '내용',
      render: (p) => {
        const summary = plainSummary(p.body)
        return summary ? (
          <span className="block truncate font-normal text-gray-600" title={summary}>
            {summary}
          </span>
        ) : (
          <EmptyValue />
        )
      },
    },
    {
      key: 'updated_at',
      header: '수정일',
      align: 'center',
      className: 'w-32',
      render: (p) => <span className="tabular-nums text-gray-600">{p.updated_at.slice(0, 10)}</span>,
    },
  ]

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={() => setOpened(null)}>글쓰기</Button>
      </div>
      <DataTable
        columns={columns}
        rows={posts}
        rowKey={(p) => p.id}
        emptyText="등록된 글이 없습니다."
        onRowClick={(p) => setOpened(p)}
      />
    </div>
  )
}

/** 글 읽기: 제목 + 본문 렌더 + 수정·삭제. */
function PostReader({
  post,
  moduleId,
  onEdit,
  onBack,
  onDeleted,
}: {
  post: ProgramPost
  moduleId: string
  onEdit: () => void
  onBack: () => void
  onDeleted: () => void
}) {
  const toast = useToast()
  const remove = useDeletePost(moduleId)

  const onDelete = async () => {
    if (!window.confirm(`'${post.title}' 글을 삭제하시겠습니까?`)) return
    try {
      await remove.mutateAsync(post.id)
      onDeleted()
    } catch {
      toast.show('삭제에 실패했습니다. 권한을 확인하세요.', 'danger')
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <BackButton onClick={onBack} />
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => void onDelete()} disabled={remove.isPending}>
            삭제
          </Button>
          <Button onClick={onEdit}>수정</Button>
        </div>
      </div>
      <article className="rounded-radius-md border border-gray-200 bg-white p-6">
        <h3 className="text-title-sm font-semibold text-gray-900">{post.title}</h3>
        <p className="mt-1 text-caption text-gray-600">최종 수정 {post.updated_at.slice(0, 10)}</p>
        <div className="mt-4 border-t border-gray-200 pt-4">
          {post.body ? (
            <RichTextViewer html={post.body} />
          ) : (
            <p className="text-body text-gray-600">본문이 없습니다.</p>
          )}
        </div>
      </article>
    </div>
  )
}

/** 글 작성·수정: 제목 + 리치텍스트 본문. */
function PostEditor({
  programId,
  moduleId,
  post,
  onDone,
  onCancel,
}: {
  programId: string
  moduleId: string
  post?: ProgramPost
  onDone: () => void
  onCancel: () => void
}) {
  const toast = useToast()
  const save = useSavePost(programId, moduleId)
  const [title, setTitle] = useState(post?.title ?? '')
  const [body, setBody] = useState(post?.body ?? '')

  const submit = async () => {
    if (!title.trim() || save.isPending) return
    try {
      await save.mutateAsync({ id: post?.id, title: title.trim(), body })
      onDone()
    } catch {
      toast.show('저장에 실패했습니다. 권한을 확인하세요.', 'danger')
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <BackButton onClick={onCancel} />
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={onCancel} disabled={save.isPending}>
            취소
          </Button>
          <Button onClick={() => void submit()} disabled={!title.trim() || save.isPending}>
            {save.isPending ? '저장 중…' : post ? '수정 완료' : '등록'}
          </Button>
        </div>
      </div>
      <div className="space-y-1.5">
        <label className="text-caption font-semibold text-gray-600">제목</label>
        <Input
          autoFocus
          placeholder="예: 3차 운영위원회 회의록"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
      </div>
      <div className="space-y-1.5">
        <label className="text-caption font-semibold text-gray-600">본문</label>
        <RichTextEditor value={body} onChange={setBody} />
      </div>
    </div>
  )
}
