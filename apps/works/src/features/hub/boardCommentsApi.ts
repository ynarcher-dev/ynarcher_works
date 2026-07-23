import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import dayjs from 'dayjs'
import { supabase } from '@/lib/supabase'
import type { BoardComment } from '@/features/hub/boardData'

/**
 * 게시글 댓글(public.board_comments) 서버 훅.
 * 열람/작성 권한은 DB RLS(app.can_read_board_post)가 강제하고, 작성자는 트리거가 스탬프한다.
 * 원장/정책: supabase/migrations/20260723190000_board_posts_views_comments.sql
 */
const COMMENTS_KEY = ['office', 'board-comments']

interface CommentRow {
  id: string
  author_name: string | null
  content: string
  created_at: string
}

function toComment(r: CommentRow): BoardComment {
  return {
    id: r.id,
    author: r.author_name ?? '-',
    content: r.content,
    createdAt: dayjs(r.created_at).format('YYYY.MM.DD HH:mm'),
  }
}

/** 게시글 댓글 목록(등록순, 미삭제). */
export function useBoardComments(postId: string | undefined) {
  return useQuery({
    queryKey: [...COMMENTS_KEY, postId],
    enabled: Boolean(postId),
    queryFn: async (): Promise<BoardComment[]> => {
      const { data, error } = await supabase
        .from('board_comments')
        .select('id, author_name, content, created_at')
        .eq('post_id', postId as string)
        .is('deleted_at', null)
        .order('created_at', { ascending: true })
      if (error) throw error
      return ((data ?? []) as CommentRow[]).map(toComment)
    },
  })
}

/** 댓글 작성(작성자는 서버 트리거가 스탬프). */
export function useAddBoardComment() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (v: { postId: string; content: string }) => {
      const { error } = await supabase
        .from('board_comments')
        .insert({ post_id: v.postId, content: v.content })
      if (error) throw error
    },
    onSuccess: (_r, v) => qc.invalidateQueries({ queryKey: [...COMMENTS_KEY, v.postId] }),
  })
}
