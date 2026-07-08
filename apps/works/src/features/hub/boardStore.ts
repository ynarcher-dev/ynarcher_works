import { create } from 'zustand'
import {
  HUB_FILES,
  HUB_INSIGHTS,
  HUB_NOTICES,
  type BoardPost,
} from '@/features/hub/boardData'

/** 게시판 정의(레지스트리 항목). */
export interface BoardDef {
  id: string
  /** `?tab=` 값. HUB 라우팅/사이드바 키. */
  tab: string
  label: string
  active: boolean
  /** 기본 게시판(삭제 불가, 비활성화만 가능). */
  system: boolean
  /** 사이드바 아이콘 키(boardIcons.ts). */
  icon: string
  /** 아코디언에서 빼내 사이드바 상단에 단독 노출(예: 공지사항). */
  pinned: boolean
}

const DEFAULT_BOARDS: BoardDef[] = [
  { id: 'b-notices', tab: 'notices', label: '공지사항', active: true, system: true, icon: 'megaphone', pinned: true },
  { id: 'b-files', tab: 'files', label: '공용자료실', active: true, system: true, icon: 'folder', pinned: true },
  { id: 'b-insights', tab: 'insights', label: '인사이트', active: true, system: true, icon: 'lightbulb', pinned: false },
]

/** 기본 게시판의 시드 게시글. 신규 게시판은 빈 목록으로 시작한다. */
export const BOARD_SEED_POSTS: Record<string, BoardPost[]> = {
  notices: HUB_NOTICES,
  files: HUB_FILES,
  insights: HUB_INSIGHTS,
}

interface BoardStore {
  boards: BoardDef[]
  /** 게시판 생성(활성 상태). 데모 로컬 상태. */
  createBoard: (label: string, icon: string) => void
  /** 활성/비활성 토글(소프트). */
  setActive: (id: string, active: boolean) => void
}

/**
 * 게시판 레지스트리. ADMIN(게시판 관리)이 편집하고, 고정 게시판(공지사항)은 HUB가,
 * 일반 게시판은 OFFICE가 소비하는 단일 원천.
 * 서버 연동 시 이 스토어를 Edge Function/RPC + 테이블로 대체한다.
 */
export const useBoardStore = create<BoardStore>((set) => ({
  boards: DEFAULT_BOARDS,
  createBoard: (label, icon) =>
    set((s) => {
      const name = label.trim()
      if (!name) return s
      const stamp = Date.now()
      return {
        boards: [
          ...s.boards,
          {
            id: `b-${stamp}`,
            tab: `board-${stamp}`,
            label: name,
            active: true,
            system: false,
            icon,
            pinned: false,
          },
        ],
      }
    }),
  setActive: (id, active) =>
    set((s) => ({
      boards: s.boards.map((b) => (b.id === id ? { ...b, active } : b)),
    })),
}))
