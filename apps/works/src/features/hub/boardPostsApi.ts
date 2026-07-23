import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { BoardPost } from '@/features/hub/boardData'
import type { Material } from '@/features/networks/materialHooks'

/**
 * 게시글(public.board_posts) 서버 훅. 게시판·자료실·공지사항·대시보드가 공유한다.
 * 열람 범위는 DB RLS(app.can_read_board_post/can_read_board)가 강제하며, 작성자/board_kind는
 * 서버 트리거가 스탬프한다. 첨부는 attachments(target_type='BOARD_POST')를 재사용한다.
 * 원장/정책: supabase/migrations/20260720200000_office_boards.sql,
 *            supabase/migrations/20260723190000_board_posts_views_comments.sql
 */
export const BOARD_POST_ATTACHMENT_TYPE = 'BOARD_POST'

const POSTS_KEY = ['office', 'board-posts']

const LIST_COLUMNS =
  'id, board_id, title, summary, author_name, pinned, global_notice, notice_until, view_count, created_at, deleted_at'
const DETAIL_COLUMNS = `${LIST_COLUMNS}, body`

interface PostRow {
  id: string
  board_id: string
  title: string
  summary: string | null
  body?: string | null
  author_name: string | null
  pinned: boolean
  global_notice: boolean
  notice_until: string | null
  view_count: number | null
  created_at: string
  deleted_at: string | null
}

/** ISO 문자열 → 'YYYY.MM.DD'(BoardPost.date 표기). */
function dot(iso: string | null | undefined): string | undefined {
  if (!iso) return undefined
  return iso.slice(0, 10).replace(/-/g, '.')
}

function toBoardPost(r: PostRow): BoardPost {
  return {
    id: r.id,
    title: r.title,
    author: r.author_name ?? '-',
    date: dot(r.created_at) ?? '',
    content: r.body ?? undefined,
    summary: r.summary ?? undefined,
    pinned: r.pinned,
    globalNotice: r.global_notice,
    noticeUntil: dot(r.notice_until),
    deletedAt: dot(r.deleted_at),
    views: r.view_count ?? 0,
  }
}

/** 게시판(board_id) 게시글 목록. 고정 우선 · 최신순(미삭제). */
export function useBoardPosts(boardId: string | undefined) {
  return useQuery({
    queryKey: [...POSTS_KEY, 'list', boardId],
    enabled: Boolean(boardId),
    queryFn: async (): Promise<BoardPost[]> => {
      const { data, error } = await supabase
        .from('board_posts')
        .select(LIST_COLUMNS)
        .eq('board_id', boardId as string)
        .is('deleted_at', null)
        .order('pinned', { ascending: false })
        .order('created_at', { ascending: false })
      if (error) throw error
      return ((data ?? []) as PostRow[]).map(toBoardPost)
    },
  })
}

/** 게시글 단건(본문 포함). RLS가 막으면 null. */
export function useBoardPost(id: string | undefined) {
  return useQuery({
    queryKey: [...POSTS_KEY, 'detail', id],
    enabled: Boolean(id),
    queryFn: async (): Promise<BoardPost | null> => {
      const { data, error } = await supabase
        .from('board_posts')
        .select(DETAIL_COLUMNS)
        .eq('id', id as string)
        .is('deleted_at', null)
        .maybeSingle()
      if (error) throw error
      return data ? toBoardPost(data as PostRow) : null
    },
  })
}

/**
 * 게시글의 소속 게시판 id. 코멘트 멘션 알림(/office?post=<id>)이 열 게시판 탭을
 * 되찾을 때 쓴다 — board_id로 boards.slug를 역매핑한다. RLS가 막으면 null.
 */
export function useBoardPostBoardId(id: string | undefined) {
  return useQuery({
    queryKey: [...POSTS_KEY, 'board-id', id],
    enabled: Boolean(id),
    queryFn: async (): Promise<string | null> => {
      const { data, error } = await supabase
        .from('board_posts')
        .select('board_id')
        .eq('id', id as string)
        .is('deleted_at', null)
        .maybeSingle()
      if (error) throw error
      return data ? (data as { board_id: string }).board_id : null
    },
  })
}

/** 첨부가 있는 게시글 id 집합(목록 첨부 아이콘용). */
export function useBoardPostAttachmentIds() {
  return useQuery({
    queryKey: [...POSTS_KEY, 'attachment-ids'],
    queryFn: async (): Promise<Set<string>> => {
      const { data, error } = await supabase
        .from('attachments')
        .select('target_id')
        .eq('target_type', BOARD_POST_ATTACHMENT_TYPE)
        .is('deleted_at', null)
      if (error) throw error
      return new Set((data ?? []).map((r) => (r as { target_id: string }).target_id))
    },
  })
}

/** 여러 게시글의 첨부(자료실 목록: 1행=1파일 다운로드에 사용). */
export function useBoardPostMaterials(targetIds: string[]) {
  const sorted = [...targetIds].sort()
  return useQuery({
    queryKey: [...POSTS_KEY, 'materials', sorted.join(',')],
    enabled: sorted.length > 0,
    queryFn: async (): Promise<Material[]> => {
      const { data, error } = await supabase
        .from('attachments')
        .select('*')
        .eq('target_type', BOARD_POST_ATTACHMENT_TYPE)
        .in('target_id', sorted)
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
      if (error) throw error
      return (data ?? []) as Material[]
    },
  })
}

export interface BoardPostDraft {
  boardId: string
  title: string
  body?: string | null
  summary?: string | null
  pinned: boolean
  globalNotice: boolean
  /** 전체 공지 만료일(date). 미지정 시 무기한. */
  noticeUntil?: string | null
}

function invalidatePosts(qc: ReturnType<typeof useQueryClient>) {
  void qc.invalidateQueries({ queryKey: POSTS_KEY })
}

/** 게시글 작성(작성자·board_kind는 트리거 스탬프). 생성된 id 반환. */
export function useCreateBoardPost() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (d: BoardPostDraft): Promise<string> => {
      const { data, error } = await supabase
        .from('board_posts')
        .insert({
          board_id: d.boardId,
          title: d.title,
          body: d.body ?? null,
          summary: d.summary ?? null,
          pinned: d.pinned,
          global_notice: d.globalNotice,
          notice_until: d.noticeUntil ?? null,
        })
        .select('id')
        .single()
      if (error) throw error
      return (data as { id: string }).id
    },
    onSuccess: () => invalidatePosts(qc),
  })
}

/** 게시글 수정(작성자·admin, RLS 강제). */
export function useUpdateBoardPost() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (v: { id: string } & Partial<Omit<BoardPostDraft, 'boardId'>>) => {
      const patch: Record<string, unknown> = {}
      if (v.title !== undefined) patch.title = v.title
      if (v.body !== undefined) patch.body = v.body ?? null
      if (v.summary !== undefined) patch.summary = v.summary ?? null
      if (v.pinned !== undefined) patch.pinned = v.pinned
      if (v.globalNotice !== undefined) patch.global_notice = v.globalNotice
      if (v.noticeUntil !== undefined) patch.notice_until = v.noticeUntil ?? null
      const { error } = await supabase.from('board_posts').update(patch).eq('id', v.id)
      if (error) throw error
    },
    onSuccess: () => invalidatePosts(qc),
  })
}

/** 게시글 비활성화(소프트 삭제) 토글. 물리 삭제 금지 — deleted_at만 채운다. */
export function useSetBoardPostActive() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (v: { id: string; active: boolean }) => {
      const { error } = await supabase
        .from('board_posts')
        .update({ deleted_at: v.active ? null : new Date().toISOString() })
        .eq('id', v.id)
      if (error) throw error
    },
    onSuccess: () => invalidatePosts(qc),
  })
}

/** 조회수 +1(상세 진입 시). 열람 권한자만 집계에 반영(SECURITY DEFINER RPC 경유). */
export function useIncrementBoardPostView() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.rpc('increment_board_post_view', { p_post_id: id })
      if (error) throw error
    },
    onSuccess: () => invalidatePosts(qc),
  })
}

/** 공지사항 뷰의 한 행: 게시글 + 원본 게시판(클릭 시 원본 상세로 이동). */
export interface NoticeItem {
  post: BoardPost
  boardSlug: string
  boardLabel: string
}

/**
 * 전체 공지 목록. 활성 게시판(POST)에서 global_notice이며 만료되지 않은 게시글을
 * 고정 우선·최신순으로 모은다. 원본 게시판 slug/label을 조인해 함께 돌려준다.
 */
export function useNotices() {
  return useQuery({
    queryKey: [...POSTS_KEY, 'notices'],
    queryFn: async (): Promise<NoticeItem[]> => {
      const today = new Date().toISOString().slice(0, 10)
      const { data, error } = await supabase
        .from('board_posts')
        .select(`${LIST_COLUMNS}, boards!inner(slug, label, kind, is_active)`)
        .eq('global_notice', true)
        .is('deleted_at', null)
        .eq('boards.kind', 'POST')
        .eq('boards.is_active', true)
        .or(`notice_until.is.null,notice_until.gte.${today}`)
        .order('pinned', { ascending: false })
        .order('created_at', { ascending: false })
      if (error) throw error
      type Row = PostRow & { boards: { slug: string; label: string } | { slug: string; label: string }[] | null }
      return ((data ?? []) as Row[]).map((r) => {
        const b = Array.isArray(r.boards) ? r.boards[0] : r.boards
        return { post: toBoardPost(r), boardSlug: b?.slug ?? '', boardLabel: b?.label ?? '' }
      })
    },
  })
}
