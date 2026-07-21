import { BackButton, Button, Checkbox, Input, PageHeader } from '@ynarcher/ui'
import dayjs from 'dayjs'
import { useState } from 'react'
import { RichTextEditor, RichTextViewer } from '@/components/RichTextEditor'
import { AttachmentField, AttachmentList } from '@/features/hub/AttachmentField'
import { BoardPanel } from '@/features/hub/BoardPanel'
import { CommentPanel } from '@/features/hub/CommentPanel'
import { ChangeHistoryPanel } from '@/features/networks/ChangeHistoryPanel'
import { DetailPanelCard } from '@/features/networks/DetailPanelCard'
import type { Contribution } from '@/features/networks/hooks'
import { usePostStore } from '@/features/hub/boardPostStore'
import { sortPosts } from '@/features/hub/boardData'
import type {
  BoardAttachment,
  BoardComment,
  BoardPost,
} from '@/features/hub/boardData'

type View =
  | { mode: 'list' }
  | { mode: 'compose' }
  // from: 편집 진입 경로. 취소·완료 후 들어온 화면(목록/상세)으로 되돌린다.
  | { mode: 'edit'; post: BoardPost; from: 'list' | 'detail' }
  | { mode: 'detail'; post: BoardPost }

/** 제목·작성자에 검색어(공백·대소문자 무시)가 포함된 글만 남긴다. */
function filterPosts(posts: BoardPost[], keyword: string): BoardPost[] {
  const q = keyword.trim().toLowerCase()
  if (!q) return posts
  return posts.filter((p) => `${p.title} ${p.author}`.toLowerCase().includes(q))
}

export interface BoardWorkspaceProps {
  /** 게시판 slug(게시글 스토어 접근용). */
  boardSlug: string
  title: string
  authorName?: string
  /** 공지사항 뷰 등에서 깊은 링크로 열 게시글 id. */
  initialPostId?: string
}

/**
 * 게시판(kind = POST) 워크스페이스: 목록(검색·글쓰기) ↔ 리치 에디터(작성/수정) ↔ 상세 읽기.
 * 전체 공지(globalNotice)는 사본을 만들지 않고 플래그로만 표시하며, 공지사항 메뉴가 이를 모아 보여준다.
 */
export function BoardWorkspace({
  boardSlug,
  title,
  authorName,
  initialPostId,
}: BoardWorkspaceProps) {
  const [view, setView] = useState<View>(() => {
    const target = initialPostId
      ? (usePostStore.getState().postsByBoard[boardSlug] ?? []).find(
          (p) => p.id === initialPostId,
        )
      : undefined
    return target ? { mode: 'detail', post: target } : { mode: 'list' }
  })
  const [keyword, setKeyword] = useState('')
  const posts = usePostStore((s) => s.postsByBoard[boardSlug] ?? [])
  const addPost = usePostStore((s) => s.addPost)
  const updatePost = usePostStore((s) => s.updatePost)
  const setPostActive = usePostStore((s) => s.setPostActive)
  const incrementViews = usePostStore((s) => s.incrementViews)
  // 댓글은 게시글 id별로 보관한다(데모 로컬 상태).
  const [comments, setComments] = useState<Record<string, BoardComment[]>>(() =>
    Object.fromEntries(
      (usePostStore.getState().postsByBoard[boardSlug] ?? [])
        .filter((p) => p.comments?.length)
        .map((p) => [p.id, p.comments!]),
    ),
  )

  const create = (post: BoardPost) => {
    addPost(boardSlug, post)
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

  /** 상세 진입: 조회수를 1 올리고 상세 뷰로 전환한다(서버 연동 시 조회 RPC로 대체). */
  const openDetail = (post: BoardPost) => {
    incrementViews(boardSlug, post.id)
    setView({ mode: 'detail', post: { ...post, views: (post.views ?? 0) + 1 } })
  }

  const update = (post: BoardPost, from: 'list' | 'detail') => {
    updatePost(boardSlug, post)
    setView(from === 'list' ? { mode: 'list' } : { mode: 'detail', post })
  }

  if (view.mode === 'compose') {
    return (
      <PostEditor
        key="new"
        heading={`${title} 글쓰기`}
        authorName={authorName}
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
        onCancel={() =>
          setView(
            view.from === 'list' ? { mode: 'list' } : { mode: 'detail', post: view.post },
          )
        }
        onSubmit={(post) => update(post, view.from)}
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
        onEdit={() => setView({ mode: 'edit', post: view.post, from: 'detail' })}
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
        posts={sortPosts(filterPosts(posts, keyword))}
        emptyText={keyword.trim() ? '검색 결과가 없습니다.' : '등록된 게시글이 없습니다.'}
        boardLabel={title}
        onSelect={(post) => openDetail(post)}
        onEdit={(post) => setView({ mode: 'edit', post, from: 'list' })}
        onDeactivate={(post) => setPostActive(boardSlug, post.id, false)}
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
  onCancel,
  onSubmit,
}: {
  heading: string
  authorName?: string
  initial?: BoardPost
  submitLabel?: string
  onCancel: () => void
  onSubmit: (post: BoardPost) => void
}) {
  const [postTitle, setPostTitle] = useState(initial?.title ?? '')
  const [content, setContent] = useState(initial?.content ?? '')
  const [attachments, setAttachments] = useState<BoardAttachment[]>(
    initial?.attachments ?? [],
  )
  // 게시판 내 고정과 전체 공지는 독립 플래그다(영향 범위·권한이 다르다).
  const [pinned, setPinned] = useState(Boolean(initial?.pinned))
  const [globalNotice, setGlobalNotice] = useState(Boolean(initial?.globalNotice))

  /** 전체 공지를 켜면 게시판 고정도 기본으로 함께 켠다(해제는 가능). */
  const toggleGlobalNotice = (checked: boolean) => {
    setGlobalNotice(checked)
    if (checked) setPinned(true)
  }

  const submit = () => {
    const t = postTitle.trim()
    if (!t) return
    const base = { title: t, content, attachments, pinned, globalNotice }
    if (initial) {
      // 수정: id·작성자·게시일은 보존하고 내용과 노출 플래그만 갱신한다.
      onSubmit({ ...initial, ...base })
    } else {
      onSubmit({
        id: `local-${Date.now()}`,
        author: authorName ?? '작성자',
        date: dayjs().format('YYYY.MM.DD'),
        ...base,
      })
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
      <div className="flex flex-col gap-2">
        <label className="flex w-fit cursor-pointer items-center gap-2 text-body text-gray-700">
          <Checkbox checked={pinned} onChange={(e) => setPinned(e.target.checked)} />
          이 글을 게시판 <span className="font-semibold text-gray-900">최상단에 고정</span>
        </label>
        <label className="flex w-fit cursor-pointer items-center gap-2 text-body text-gray-700">
          <Checkbox
            checked={globalNotice}
            onChange={(e) => toggleGlobalNotice(e.target.checked)}
          />
          <span className="font-semibold text-gray-900">전체 공지</span>로 등록하여 공지사항 메뉴에 노출
        </label>
      </div>
      {!initial && (
        <p className="text-caption text-gray-400">
          작성자({authorName ?? '작성자'})와 게시일(오늘)은 자동으로 기록됩니다.
        </p>
      )}
    </div>
  )
}

/**
 * 게시글 상세. 헤더(뒤로가기 · 수정)는 STARTUP 상세와 동일한 규격을 쓰고,
 * 아래는 좌측 2/3 본문 + 우측 1/3 공용 패널(자료 관리 · 댓글 · 변동 이력)로 구성한다.
 * 자료/변동이력은 아직 서버 원장이 없어 게시글 로컬 데이터로 채운다.
 */
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
  const attachments = post.attachments ?? []
  // 변동 이력: 서버 기여 로그(entity_contributions) 연동 전까지 게시글 등록 기록만 표시한다.
  const contributions: Contribution[] = [
    {
      id: `${post.id}-created`,
      entity_table: 'board_posts',
      entity_id: post.id,
      user_id: null,
      user_name: post.author,
      action: 'created',
      source: 'manual',
      batch_id: null,
      note: null,
      created_at: post.date.replace(/\./g, '-'),
    },
  ]

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <BackButton onClick={onBack} />
        <Button onClick={onEdit}>수정</Button>
      </div>

      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-3">
        {/* 좌측(2/3): 본문 — 제목·작성자·게시일 + 리치 텍스트 */}
        <article className="overflow-hidden rounded-radius-lg border border-gray-300 bg-white shadow-soft lg:col-span-2">
          <header className="px-6 py-5">
            {/* 전체 공지는 제목과 같은 크기의 말머리로 붙인다(목록 표기와 동일).
                상단 고정은 목록 정렬용 속성일 뿐 상세에서는 의미가 없어 표시하지 않는다. */}
            <h1 className="min-w-0 text-title-md font-bold leading-tight text-gray-900">
              {post.globalNotice && <span className="mr-1.5 text-danger-700">[공지]</span>}
              {post.title}
            </h1>
            {/* 메타는 상세페이지 공통 '라벨: 값' 패턴으로 정렬한다(STARTUP·NETWORKS 정보행과 동일). */}
            <div className="mt-3 flex flex-wrap items-baseline gap-x-5 gap-y-1">
              <span className="flex items-baseline gap-2">
                <span className="text-caption text-gray-400">작성자</span>
                <span className="text-caption font-medium text-gray-700">{post.author}</span>
              </span>
              <span className="flex items-baseline gap-2">
                <span className="text-caption text-gray-400">게시일</span>
                <span className="text-caption tabular-nums text-gray-700">{post.date}</span>
              </span>
              <span className="flex items-baseline gap-2">
                <span className="text-caption text-gray-400">조회</span>
                <span className="text-caption tabular-nums text-gray-700">
                  {(post.views ?? 0).toLocaleString()}
                </span>
              </span>
            </div>
          </header>
          {/* 구분선은 카드 끝까지 닿지 않도록 본문과 같은 좌우 여백 안쪽으로 들인다. */}
          <div className="mx-6 border-t border-gray-200" />
          <div className="px-6 py-6">
            {post.content ? (
              <RichTextViewer html={post.content} />
            ) : (
              <p className="text-body text-gray-400">본문이 없습니다.</p>
            )}
          </div>
        </article>

        {/* 우측(1/3): 공용 패널 — 자료 관리 → 댓글 → 변동 이력 */}
        <div className="space-y-4 lg:col-span-1">
          <DetailPanelCard title="자료 관리" count={attachments.length}>
            {attachments.length > 0 ? (
              <AttachmentList attachments={attachments} />
            ) : (
              <p className="text-body text-gray-400">등록된 자료가 없습니다.</p>
            )}
          </DetailPanelCard>
          <CommentPanel comments={comments} onAdd={onAddComment} />
          <ChangeHistoryPanel contributions={contributions} />
        </div>
      </div>
    </div>
  )
}
