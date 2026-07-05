import { create } from 'zustand'
import type { BoardPost } from '@/features/hub/boardData'
import { BOARD_SEED_POSTS } from '@/features/hub/boardStore'

/** 공지사항 게시판의 tab 키(크로스포스트 대상). */
export const NOTICE_TAB = 'notices'

interface PostStore {
  /** 게시판(tab)별 게시글 목록. */
  postsByBoard: Record<string, BoardPost[]>
  /** 게시글 추가. crossToNotice=true면 공지사항 게시판에도 함께 올린다. */
  addPost: (tab: string, post: BoardPost, crossToNotice?: boolean) => void
  /** 게시글 수정(해당 게시판 한정). */
  updatePost: (tab: string, post: BoardPost) => void
}

/**
 * 게시글 저장소. 게시판 간 크로스포스트(공지사항 동시 게시)를 위해 전역 스토어로 둔다.
 * 서버 연동 시 게시글 테이블 + RPC로 대체한다.
 */
export const usePostStore = create<PostStore>((set) => ({
  postsByBoard: Object.fromEntries(
    Object.entries(BOARD_SEED_POSTS).map(([tab, posts]) => [tab, [...posts]]),
  ),
  addPost: (tab, post, crossToNotice) =>
    set((s) => {
      const next = { ...s.postsByBoard }
      next[tab] = [post, ...(next[tab] ?? [])]
      if (crossToNotice && tab !== NOTICE_TAB) {
        // 공지사항에는 별도 사본(고유 id)으로 게시한다.
        const copy = { ...post, id: `${post.id}-notice` }
        next[NOTICE_TAB] = [copy, ...(next[NOTICE_TAB] ?? [])]
      }
      return { postsByBoard: next }
    }),
  updatePost: (tab, post) =>
    set((s) => ({
      postsByBoard: {
        ...s.postsByBoard,
        [tab]: (s.postsByBoard[tab] ?? []).map((p) => (p.id === post.id ? post : p)),
      },
    })),
}))
