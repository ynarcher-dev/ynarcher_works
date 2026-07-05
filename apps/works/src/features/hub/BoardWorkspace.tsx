import { Button, Checkbox, Input, PageHeader } from '@ynarcher/ui'
import dayjs from 'dayjs'
import { ChevronLeft, Pencil } from 'lucide-react'
import { useState } from 'react'
import { RichTextEditor, RichTextViewer } from '@/components/RichTextEditor'
import { AttachmentField, AttachmentList } from '@/features/hub/AttachmentField'
import { BoardPanel } from '@/features/hub/BoardPanel'
import { CommentPanel } from '@/features/hub/CommentPanel'
import { NOTICE_TAB, usePostStore } from '@/features/hub/boardPostStore'
import type {
  BoardAttachment,
  BoardComment,
  BoardPost,
} from '@/features/hub/boardData'

type View =
  | { mode: 'list' }
  | { mode: 'compose' }
  | { mode: 'edit'; post: BoardPost }
  | { mode: 'detail'; post: BoardPost }

/** 제목·작성자에 검색어(공백·대소문자 무시)가 포함된 글만 남긴다. */
function filterPosts(posts: BoardPost[], keyword: string): BoardPost[] {
  const q = keyword.trim().toLowerCase()
  if (!q) return posts
  return posts.filter((p) => `${p.title} ${p.author}`.toLowerCase().includes(q))
}

export interface BoardWorkspaceProps {
  /** 게시판 tab 키(게시글 스토어 접근용). */
  boardTab: string
  title: string
  authorName?: string
}

/**
 * 게시판 워크스페이스: 목록(검색·글쓰기) ↔ 리치 에디터(작성/수정) ↔ 상세 읽기.
 * 게시글은 전역 스토어(usePostStore)에 보관해 게시판 간 크로스포스트를 지원한다.
 */
export function BoardWorkspace({ boardTab, title, authorName }: BoardWorkspaceProps) {
  const [view, setView] = useState<View>({ mode: 'list' })
  const [keyword, setKeyword] = useState('')
  const posts = usePostStore((s) => s.postsByBoard[boardTab] ?? [])
  const addPost = usePostStore((s) => s.addPost)
  const updatePost = usePostStore((s) => s.updatePost)
  // 댓글은 게시글 id별로 보관한다(데모 로컬 상태).
  const [comments, setComments] = useState<Record<string, BoardComment[]>>(() =>
    Object.fromEntries(
      (usePostStore.getState().postsByBoard[boardTab] ?? [])
        .filter((p) => p.comments?.length)
        .map((p) => [p.id, p.comments!]),
    ),
  )

  const create = (post: BoardPost, alsoNotice: boolean) => {
    addPost(boardTab, post, alsoNotice)
    setView({ mode: 'list' })
  }

  const addComment = (postId: string, content: string) => {
    const comment: BoardComment = {
      id: `cm-${Date.now()}`,
      author: authorName ?? '작성자',
      content,
      createdAt: dayjs().format('YYYY.MM.DD HH:mm'),
    }
    setComments((prev) => ({ ...prev, [postId]: [...(prev[postId] ?? []), comment] }))
  }

  const update = (post: BoardPost) => {
    updatePost(boardTab, post)
    setView({ mode: 'detail', post })
  }

  if (view.mode === 'compose') {
    return (
      <PostEditor
        key="new"
        heading={`${title} 글쓰기`}
        authorName={authorName}
        allowNotice={boardTab !== NOTICE_TAB}
        onCancel={() => setView({ mode: 'list' })}
        onSubmit={create}
      />
    )
  }

  if (view.mode === 'edit') {
    return (
      <PostEditor
        key={view.post.id}
        heading={`${title} 수정`}
        authorName={authorName}
        initial={view.post}
        submitLabel="수정 완료"
        onCancel={() => setView({ mode: 'detail', post: view.post })}
        onSubmit={(post) => update(post)}
      />
    )
  }

  if (view.mode === 'detail') {
    return (
      <DetailView
        post={view.post}
        comments={comments[view.post.id] ?? []}
        onAddComment={(content) => addComment(view.post.id, content)}
        onBack={() => setView({ mode: 'list' })}
        onEdit={() => setView({ mode: 'edit', post: view.post })}
      />
    )
  }

  return (
    <div className="flex h-full flex-col gap-5">
      <PageHeader
        title={title}
        search={
          <Input
            placeholder="제목·작성자 검색"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
          />
        }
        actions={<Button onClick={() => setView({ mode: 'compose' })}>글쓰기</Button>}
      />
      <BoardPanel
        posts={filterPosts(posts, keyword)}
        emptyText={keyword.trim() ? '검색 결과가 없습니다.' : '등록된 게시글이 없습니다.'}
        onSelect={(post) => setView({ mode: 'detail', post })}
      />
    </div>
  )
}

/** 리치 에디터 작성/수정 화면. initial이 있으면 수정 모드로 값을 채운다. */
function PostEditor({
  heading,
  authorName,
  initial,
  submitLabel = '등록',
  allowNotice = false,
  onCancel,
  onSubmit,
}: {
  heading: string
  authorName?: string
  initial?: BoardPost
  submitLabel?: string
  /** 작성 시 '공지사항에도 게시' 체크박스 노출 여부. */
  allowNotice?: boolean
  onCancel: () => void
  onSubmit: (post: BoardPost, alsoNotice: boolean) => void
}) {
  const [postTitle, setPostTitle] = useState(initial?.title ?? '')
  const [content, setContent] = useState(initial?.content ?? '')
  const [attachments, setAttachments] = useState<BoardAttachment[]>(
    initial?.attachments ?? [],
  )
  const [crossToNotice, setCrossToNotice] = useState(false)

  const submit = () => {
    const t = postTitle.trim()
    if (!t) return
    if (initial) {
      // 수정: id·작성자·게시일은 보존하고 제목·본문·첨부만 갱신한다.
      onSubmit({ ...initial, title: t, content, attachments }, false)
    } else {
      onSubmit(
        {
          id: `local-${Date.now()}`,
          title: t,
          author: authorName ?? '작성자',
          date: dayjs().format('YYYY.MM.DD'),
          content,
          attachments,
        },
        crossToNotice,
      )
    }
  }

  return (
    <div className="flex h-full flex-col gap-4">
      <PageHeader
        title={heading}
        actions={
          <>
            <Button variant="outline" onClick={onCancel}>
              취소
            </Button>
            <Button onClick={submit} disabled={!postTitle.trim()}>
              {submitLabel}
            </Button>
          </>
        }
      />
      <Input
        placeholder="제목을 입력하세요"
        value={postTitle}
        onChange={(e) => setPostTitle(e.target.value)}
      />
      <RichTextEditor value={content} onChange={setContent} />
      <AttachmentField value={attachments} onChange={setAttachments} />
      {allowNotice && (
        <label className="flex w-fit cursor-pointer items-center gap-2 text-body text-gray-700">
          <Checkbox
            checked={crossToNotice}
            onChange={(e) => setCrossToNotice(e.target.checked)}
          />
          이 글을 <span className="font-semibold text-gray-900">공지사항</span> 게시판에도 함께 게시
        </label>
      )}
      {!initial && (
        <p className="text-caption text-gray-400">
          작성자({authorName ?? '작성자'})와 게시일(오늘)은 자동으로 기록됩니다.
        </p>
      )}
    </div>
  )
}

/** 게시글 상세: 좌측 본문(2) · 우측 댓글(1). */
function DetailView({
  post,
  comments,
  onAddComment,
  onBack,
  onEdit,
}: {
  post: BoardPost
  comments: BoardComment[]
  onAddComment: (content: string) => void
  onBack: () => void
  onEdit: () => void
}) {
  return (
    <div className="flex flex-col gap-3">
      <button
        type="button"
        onClick={onBack}
        className="inline-flex w-fit items-center gap-1 text-caption font-semibold text-brand transition-colors duration-fast hover:text-brand-600"
      >
        <ChevronLeft className="size-4" /> 목록으로
      </button>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3 lg:items-start">
        {/* 본문 (좌측 2/3) — 내용 높이만큼만 차지 */}
        <article className="overflow-hidden rounded-radius-md border border-gray-300 bg-white shadow-soft lg:col-span-2">
          <header className="border-b border-gray-200 px-6 py-5">
            <div className="flex items-start justify-between gap-4">
              <h1 className="min-w-0 text-title-md font-bold leading-snug text-gray-900">
                {post.title}
              </h1>
              <Button variant="outline" size="sm" onClick={onEdit}>
                <Pencil className="size-4" /> 수정
              </Button>
            </div>
            <p className="mt-2.5 flex items-center gap-2 text-caption text-gray-500">
              <span className="font-medium text-gray-600">{post.author}</span>
              <span className="text-gray-300">·</span>
              <span className="tabular-nums">{post.date}</span>
            </p>
          </header>
          <div className="px-6 py-6">
            {post.content ? (
              <RichTextViewer html={post.content} />
            ) : (
              <p className="text-body text-gray-400">본문이 없습니다.</p>
            )}
          </div>
          {post.attachments && post.attachments.length > 0 && (
            <div className="border-t border-gray-200 bg-gray-25/60 px-6 py-4">
              <AttachmentList attachments={post.attachments} />
            </div>
          )}
        </article>

        {/* 댓글 (우측 1/3) — 본문 높이와 무관, 스크롤 시 따라 내려오도록 sticky */}
        <div className="lg:sticky lg:top-20 lg:col-span-1">
          <CommentPanel comments={comments} onAdd={onAddComment} />
        </div>
      </div>
    </div>
  )
}
