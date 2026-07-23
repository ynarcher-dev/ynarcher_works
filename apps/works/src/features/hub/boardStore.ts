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

/**
 * 게시판/자료실 레지스트리 항목. public.boards 컬럼과 1:1로 대응한다.
 * 실제 조회·변경은 서버 훅(boardHooks.ts)이 담당하며, 이 파일은 타입·상수만 소유한다.
 */
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

/** 활성 게시판을 종류별로 정렬해 돌려준다(사이드바 그룹 = kind). */
export function boardsOfKind(boards: BoardDef[], kind: BoardKind): BoardDef[] {
  return boards
    .filter((b) => b.isActive && b.kind === kind)
    .sort((a, b) => a.sortOrder - b.sortOrder || a.label.localeCompare(b.label))
}

