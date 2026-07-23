import { BackButton, Button, Checkbox, EmptyState, Input, PageHeader, PanelCard, Spinner, useToast } from '@ynarcher/ui'
import { useEffect, useRef, useState } from 'react'
import { RichTextEditor, RichTextViewer } from '@/components/RichTextEditor'
import { BoardPanel } from '@/features/hub/BoardPanel'
import { CommentPanel } from '@/features/hub/CommentPanel'
import { MaterialPanel } from '@/features/networks/MaterialPanel'
import { PendingMaterialPanel } from '@/features/networks/PendingMaterialPanel'
import { usePendingMaterials } from '@/features/networks/pendingMaterials'
import { useAddBoardComment, useBoardComments } from '@/features/hub/boardCommentsApi'
import {
  BOARD_POST_ATTACHMENT_TYPE,
  useBoardPost,
  useBoardPostAttachmentIds,
  useBoardPosts,
  useCreateBoardPost,
  useIncrementBoardPostView,
  useSetBoardPostActive,
  useUpdateBoardPost,
} from '@/features/hub/boardPostsApi'
import type { BoardPost } from '@/features/hub/boardData'

type View =
  | { mode: 'list' }
  | { mode: 'compose' }
  | { mode: 'edit'; id: string; from: 'list' | 'detail' }
  | { mode: 'detail'; id: string }

/** 제목·작성자에 검색어(공백·대소문자 무시)가 포함된 글만 남긴다. */
function filterPosts(posts: BoardPost[], keyword: string): BoardPost[] {
  const q = keyword.trim().toLowerCase()
  if (!q) return posts
  return posts.filter((p) => `${p.title} ${p.author}`.toLowerCase().includes(q))
}

export interface BoardWorkspaceProps {
  /** 게시판 원장 id(board_posts.board_id). */
  boardId: string
  title: string
  /** 공지사항 뷰 등에서 깊은 링크로 열 게시글 id. */
  initialPostId?: string
}

/**
 * 게시판(kind = POST) 워크스페이스: 목록(검색·글쓰기) ↔ 리치 에디터(작성/수정) ↔ 상세 읽기.
 * 게시글·댓글·조회수·첨부는 전부 실데이터(board_posts / board_comments / attachments)이며
 * 열람·쓰기 권한은 DB RLS가 강제한다. 전체 공지(globalNotice)는 공지사항 메뉴가 모아 보여준다.
 */
export function BoardWorkspace({ boardId, title, initialPostId }: BoardWorkspaceProps) {
  const [view, setView] = useState<View>(
    initialPostId ? { mode: 'detail', id: initialPostId } : { mode: 'list' },
  )
  const [keyword, setKeyword] = useState('')
  const { data: posts, isLoading } = useBoardPosts(boardId)
  const { data: attachmentIds } = useBoardPostAttachmentIds()
  const incView = useIncrementBoardPostView()

  // 깊은 링크(공지사항 등)로 상세로 바로 들어온 경우 조회수를 1회만 올린다.
  const deepLinked = useRef(false)
  useEffect(() => {
    if (initialPostId && !deepLinked.current) {
      deepLinked.current = true
      incView.mutate(initialPostId)
    }
  }, [initialPostId, incView])

  const openDetail = (id: string) => {
    incView.mutate(id)
    setView({ mode: 'detail', id })
  }

  if (view.mode === 'compose') {
    return (
      <PostEditor
        key="new"
        boardId={boardId}
        onDone={() => setView({ mode: 'list' })}
        onCancel={() => setView({ mode: 'list' })}
      />
    )
  }

  if (view.mode === 'edit') {
    const back = view.from === 'list' ? { mode: 'list' as const } : { mode: 'detail' as const, id: view.id }
    return (
      <PostEditor
        key={view.id}
        boardId={boardId}
        postId={view.id}
        onDone={() => setView(back)}
        onCancel={() => setView(back)}
      />
    )
  }

  if (view.mode === 'detail') {
    return (
      <DetailView
        postId={view.id}
        onBack={() => setView({ mode: 'list' })}
        onEdit={() => setView({ mode: 'edit', id: view.id, from: 'detail' })}
        onDeleted={() => setView({ mode: 'list' })}
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
      {isLoading ? (
        <Spinner />
      ) : (
        <BoardPanel
          posts={filterPosts(posts ?? [], keyword)}
          attachmentIds={attachmentIds}
          emptyText={keyword.trim() ? '검색 결과가 없습니다.' : '등록된 게시글이 없습니다.'}
          boardLabel={title}
          onSelect={(post) => openDetail(post.id)}
          // 수정·삭제는 목록의 관리 컬럼이 아니라 상세 페이지에서 수행한다(관리 컬럼 미노출).
        />
      )}
    </div>
  )
}

/**
 * 게시글 작성/수정 화면. postId가 있으면 수정(기존 값 로드), 없으면 신규 작성.
 * 첨부는 attachments(BOARD_POST)로 저장한다 — 신규는 등록 성공 후 보류 첨부를 일괄 업로드하고,
 * 수정은 자료 관리 패널에서 즉시 업로드/삭제한다.
 */
function PostEditor({
  boardId,
  postId,
  onDone,
  onCancel,
}: {
  boardId: string
  postId?: string
  onDone: () => void
  onCancel: () => void
}) {
  const toast = useToast()
  const isEdit = Boolean(postId)
  const { data: initial, isLoading } = useBoardPost(postId)
  const create = useCreateBoardPost()
  const update = useUpdateBoardPost()
  const pending = usePendingMaterials()

  const [postTitle, setPostTitle] = useState('')
  const [content, setContent] = useState('')
  const [pinned, setPinned] = useState(false)
  const [globalNotice, setGlobalNotice] = useState(false)
  // 기존 글 로드 완료 시 1회 초기화(로딩 후에만 값이 온다).
  const loaded = useRef(false)
  useEffect(() => {
    if (initial && !loaded.current) {
      loaded.current = true
      setPostTitle(initial.title)
      setContent(initial.content ?? '')
      setPinned(Boolean(initial.pinned))
      setGlobalNotice(Boolean(initial.globalNotice))
    }
  }, [initial])

  /** 전체 공지를 켜면 게시판 고정도 기본으로 함께 켠다(해제는 가능). */
  const toggleGlobalNotice = (checked: boolean) => {
    setGlobalNotice(checked)
    if (checked) setPinned(true)
  }

  const busy = create.isPending || update.isPending

  const submit = async () => {
    const t = postTitle.trim()
    if (!t || busy) return
    try {
      if (isEdit && postId) {
        await update.mutateAsync({ id: postId, title: t, body: content, pinned, globalNotice })
      } else {
        const id = await create.mutateAsync({ boardId, title: t, body: content, pinned, globalNotice })
        if (pending.count > 0) await pending.flush(id, () => BOARD_POST_ATTACHMENT_TYPE)
      }
      onDone()
    } catch {
      toast.show('저장에 실패했습니다. 권한을 확인하세요.', 'danger')
    }
  }

  if (isEdit && isLoading) return <Spinner />

  return (
    <div className="space-y-5">
      {/* 상단 바 — 다른 상세/편집 화면과 동일하게 좌측 뒤로가기, 우측 확정 버튼. */}
      <div className="flex items-center justify-between">
        <BackButton onClick={onCancel} />
        <Button onClick={() => void submit()} disabled={!postTitle.trim() || busy}>
          {isEdit ? '수정 완료' : '등록'}
        </Button>
      </div>

      {/* 2:1 배치 — 좌측(2/3) 제목·본문 에디터, 우측(1/3) 첨부파일·게시 옵션 카드. */}
      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Input
            placeholder="제목을 입력하세요"
            value={postTitle}
            onChange={(e) => setPostTitle(e.target.value)}
          />
          <RichTextEditor value={content} onChange={setContent} />
        </div>

        <div className="space-y-4 lg:col-span-1">
          {isEdit && postId ? (
            <MaterialPanel targetType={BOARD_POST_ATTACHMENT_TYPE} targetId={postId} title="첨부파일" />
          ) : (
            <PendingMaterialPanel slot={BOARD_POST_ATTACHMENT_TYPE} pending={pending} title="첨부파일" />
          )}
          <PanelCard title="게시 옵션">
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
            {!isEdit && (
              <p className="mt-3 border-t border-gray-100 pt-3 text-caption text-gray-600">
                작성자와 게시일은 저장 시 자동으로 기록됩니다.
              </p>
            )}
          </PanelCard>
        </div>
      </div>
    </div>
  )
}

/**
 * 게시글 상세. 헤더(뒤로가기 · 삭제 · 수정) + 좌측 2/3 본문 · 우측 1/3 공용 패널(자료 관리 · 댓글).
 * 게시글 본문·조회수·첨부·댓글 모두 실데이터이며, 쓰기 권한은 DB RLS가 강제한다.
 */
function DetailView({
  postId,
  onBack,
  onEdit,
  onDeleted,
}: {
  postId: string
  onBack: () => void
  onEdit: () => void
  onDeleted: () => void
}) {
  const toast = useToast()
  const { data: post, isLoading } = useBoardPost(postId)
  const { data: comments } = useBoardComments(postId)
  const addComment = useAddBoardComment()
  const setActive = useSetBoardPostActive()

  const handleDelete = async () => {
    if (!window.confirm('이 게시글을 삭제할까요?')) return
    try {
      await setActive.mutateAsync({ id: postId, active: false })
      toast.show('삭제했습니다.', 'success')
      onDeleted()
    } catch {
      toast.show('삭제에 실패했습니다. 권한을 확인하세요.', 'danger')
    }
  }

  const onAddComment = (content: string) => {
    addComment.mutate(
      { postId, content },
      { onError: () => toast.show('댓글 등록에 실패했습니다.', 'danger') },
    )
  }

  if (isLoading) return <Spinner />
  if (!post) {
    return (
      <div className="space-y-4">
        <BackButton onClick={onBack} />
        <EmptyState title="열람할 수 없습니다" description="삭제되었거나 접근 권한이 없는 게시글입니다." />
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <BackButton onClick={onBack} />
        <div className="flex gap-2">
          <Button variant="outline-danger" onClick={() => void handleDelete()} disabled={setActive.isPending}>
            삭제
          </Button>
          <Button onClick={onEdit}>수정</Button>
        </div>
      </div>

      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-3">
        {/* 좌측(2/3): 본문 — 제목·작성자·게시일·조회 + 리치 텍스트 */}
        <article className="overflow-hidden rounded-radius-lg border border-gray-300 bg-white shadow-soft lg:col-span-2">
          <header className="px-6 py-5">
            <h1 className="min-w-0 text-title-md font-bold leading-tight text-gray-900">
              {post.globalNotice && <span className="mr-1.5 text-danger-700">[공지]</span>}
              {post.title}
            </h1>
            <div className="mt-3 flex flex-wrap items-baseline gap-x-5 gap-y-1">
              <span className="flex items-baseline gap-2">
                <span className="text-body text-gray-500">작성자</span>
                <span className="text-body font-medium text-gray-800">{post.author}</span>
              </span>
              <span className="flex items-baseline gap-2">
                <span className="text-body text-gray-500">게시일</span>
                <span className="text-body font-medium tabular-nums text-gray-800">{post.date}</span>
              </span>
              <span className="flex items-baseline gap-2">
                <span className="text-body text-gray-500">조회</span>
                <span className="text-body font-medium tabular-nums text-gray-800">
                  {(post.views ?? 0).toLocaleString()}
                </span>
              </span>
            </div>
          </header>
          <div className="mx-6 border-t border-gray-200" />
          <div className="px-6 py-6">
            {post.content ? (
              <RichTextViewer html={post.content} />
            ) : (
              <p className="text-body text-gray-500">본문이 없습니다.</p>
            )}
          </div>
        </article>

        {/* 우측(1/3): 공용 패널 — 자료 관리(조회 전용) → 댓글 */}
        <div className="space-y-4 lg:col-span-1">
          <MaterialPanel targetType={BOARD_POST_ATTACHMENT_TYPE} targetId={postId} title="자료 관리" readOnly />
          <CommentPanel comments={comments ?? []} onAdd={onAddComment} />
        </div>
      </div>
    </div>
  )
}
