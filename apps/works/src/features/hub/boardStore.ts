import { create } from 'zustand'
import { SEED_FILES, SEED_NOTICES, type BoardPost } from '@/features/hub/boardData'

/**
 * 게시 종류. 설계 정본: docs/docs_planning/3_1_1_board_archive_notice.md
 * - `POST`: 게시판. 제목 클릭 → 상세페이지(본문·첨부·댓글).
 * - `ARCHIVE`: 자료실. 상세페이지 없이 목록 1행 = 파일 1건을 즉시 다운로드.
 */
export type BoardKind = 'POST' | 'ARCHIVE'

export const BOARD_KIND_LABEL: Record<BoardKind, string> = {
  POST: '게시판',
  ARCHIVE: '자료실',
}

/** 게시판/자료실 레지스트리 항목. public.boards 컬럼과 1:1로 대응한다. */
export interface BoardDef {
  id: string
  /** `?tab=` 라우팅 키(= boards.slug). */
  slug: string
  label: string
  kind: BoardKind
  /** 사이드바 아이콘 키(boardIcons.ts). */
  icon: string
  /** 기본 게시판(삭제·구분 변경 불가, 비활성화만 가능). */
  isSystem: boolean
  /** 소프트 비활성화. */
  isActive: boolean
  /** 사이드바 정렬 순서(그룹 내 오름차순). */
  sortOrder: number
}

/**
 * 공지사항은 게시판이 아니라 `globalNotice` 게시글을 모아 보여주는 뷰이므로
 * 레지스트리에 행이 없다. 대신 소속처가 없는 전사 공지를 위해 `전사 알림`을 기본 제공한다.
 */
const DEFAULT_BOARDS: BoardDef[] = [
  { id: 'b-notices-general', slug: 'notices-general', label: '전사 알림', kind: 'POST', icon: 'megaphone', isSystem: true, isActive: true, sortOrder: 10 },
  { id: 'b-files', slug: 'files', label: '공용자료실', kind: 'ARCHIVE', icon: 'folder', isSystem: true, isActive: true, sortOrder: 10 },
]

/** 기본 게시판의 시드 게시글. 신규 게시판은 빈 목록으로 시작한다. */
export const BOARD_SEED_POSTS: Record<string, BoardPost[]> = {
  'notices-general': SEED_NOTICES,
  files: SEED_FILES,
}

interface BoardStore {
  boards: BoardDef[]
  /** 게시판/자료실 생성(활성 상태). 데모 로컬 상태. */
  createBoard: (label: string, icon: string, kind: BoardKind) => void
  /** 게시판명·아이콘 수정. 구분(kind)과 slug는 기존 글의 소속이 바뀌므로 변경하지 않는다. */
  updateBoard: (id: string, patch: { label?: string; icon?: string }) => void
  /** 활성/비활성 토글(소프트). */
  setActive: (id: string, isActive: boolean) => void
}

/** 활성 게시판을 종류별로 정렬해 돌려준다(사이드바 그룹 = kind). */
export function boardsOfKind(boards: BoardDef[], kind: BoardKind): BoardDef[] {
  return boards
    .filter((b) => b.isActive && b.kind === kind)
    .sort((a, b) => a.sortOrder - b.sortOrder || a.label.localeCompare(b.label))
}

/**
 * 게시판 레지스트리. ADMIN(게시판 관리)이 편집하고 OFFICE 사이드바·페이지가 소비하는 단일 원천.
 * 서버 연동 시 이 스토어를 public.boards 조회/변경 훅으로 대체한다.
 */
export const useBoardStore = create<BoardStore>((set) => ({
  boards: DEFAULT_BOARDS,
  createBoard: (label, icon, kind) =>
    set((s) => {
      const name = label.trim()
      if (!name) return s
      const stamp = Date.now()
      // 같은 종류의 마지막 순서 뒤에 붙인다(관리 화면에서 순서 조정 예정).
      const lastOrder = s.boards
        .filter((b) => b.kind === kind)
        .reduce((max, b) => Math.max(max, b.sortOrder), 0)
      return {
        boards: [
          ...s.boards,
          {
            id: `b-${stamp}`,
            slug: `board-${stamp}`,
            label: name,
            kind,
            icon,
            isSystem: false,
            isActive: true,
            sortOrder: lastOrder + 10,
          },
        ],
      }
    }),
  updateBoard: (id, patch) =>
    set((s) => {
      const label = patch.label?.trim()
      if (patch.label !== undefined && !label) return s
      return {
        boards: s.boards.map((b) =>
          b.id === id
            ? { ...b, ...(label ? { label } : {}), ...(patch.icon ? { icon: patch.icon } : {}) }
            : b,
        ),
      }
    }),
  setActive: (id, isActive) =>
    set((s) => ({
      boards: s.boards.map((b) => (b.id === id ? { ...b, isActive } : b)),
    })),
}))
