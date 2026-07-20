import dayjs from 'dayjs'
import { create } from 'zustand'
import { isActiveNotice, sortPosts, type BoardPost } from '@/features/hub/boardData'
import { BOARD_SEED_POSTS, type BoardDef } from '@/features/hub/boardStore'

/** 공지사항 뷰의 고정 라우트 키. 게시판 slug가 아니므로 레지스트리와 충돌하지 않는다. */
export const NOTICE_TAB = 'notices'

interface PostStore {
  /** 게시판(slug)별 게시글 목록. */
  postsByBoard: Record<string, BoardPost[]>
  /** 게시글 추가. */
  addPost: (slug: string, post: BoardPost) => void
  /** 게시글 수정(해당 게시판 한정). */
  updatePost: (slug: string, post: BoardPost) => void
  /** 비활성화(소프트 삭제) 토글. 물리 삭제는 금지이므로 deletedAt만 채우고 되돌릴 수 있다. */
  setPostActive: (slug: string, id: string, active: boolean) => void
  /** 조회수 1 증가(상세 진입 시). */
  incrementViews: (slug: string, id: string) => void
}

/**
 * 게시글 저장소.
 * 공지사항은 별도 게시판이 아니라 `globalNotice` 게시글을 모아 보여주는 뷰이므로
 * 사본을 만들지 않는다(원본 수정·삭제가 그대로 반영된다).
 * 서버 연동 시 public.board_posts 조회/변경 훅으로 대체한다.
 */
export const usePostStore = create<PostStore>((set) => ({
  postsByBoard: Object.fromEntries(
    Object.entries(BOARD_SEED_POSTS).map(([slug, posts]) => [slug, [...posts]]),
  ),
  addPost: (slug, post) =>
    set((s) => ({
      postsByBoard: { ...s.postsByBoard, [slug]: [post, ...(s.postsByBoard[slug] ?? [])] },
    })),
  updatePost: (slug, post) =>
    set((s) => ({
      postsByBoard: {
        ...s.postsByBoard,
        [slug]: (s.postsByBoard[slug] ?? []).map((p) => (p.id === post.id ? post : p)),
      },
    })),
  incrementViews: (slug, id) =>
    set((s) => ({
      postsByBoard: {
        ...s.postsByBoard,
        [slug]: (s.postsByBoard[slug] ?? []).map((p) =>
          p.id === id ? { ...p, views: (p.views ?? 0) + 1 } : p,
        ),
      },
    })),
  setPostActive: (slug, id, active) =>
    set((s) => ({
      postsByBoard: {
        ...s.postsByBoard,
        [slug]: (s.postsByBoard[slug] ?? []).map((p) =>
          p.id === id
            ? { ...p, deletedAt: active ? undefined : dayjs().format('YYYY.MM.DD') }
            : p,
        ),
      },
    })),
}))

/** 공지사항 뷰의 한 행: 게시글 + 원본 게시판(클릭 시 원본 상세로 이동). */
export interface NoticeItem {
  post: BoardPost
  boardSlug: string
  boardLabel: string
}

/**
 * 전체 공지 목록. 게시판(POST) 종류의 활성 게시판에서 `globalNotice`이며
 * 만료되지 않은 게시글만 모아 고정 우선·최신순으로 정렬한다.
 */
export function collectNotices(
  postsByBoard: Record<string, BoardPost[]>,
  boards: BoardDef[],
): NoticeItem[] {
  const items = boards
    .filter((b) => b.isActive && b.kind === 'POST')
    .flatMap((b) =>
      (postsByBoard[b.slug] ?? [])
        .filter(isActiveNotice)
        .map((post) => ({ post, boardSlug: b.slug, boardLabel: b.label })),
    )
  const ordered = sortPosts(items.map((i) => i.post))
  return ordered
    .map((p) => items.find((i) => i.post.id === p.id))
    .filter((i): i is NoticeItem => Boolean(i))
}
