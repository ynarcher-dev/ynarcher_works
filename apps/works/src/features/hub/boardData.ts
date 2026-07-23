import dayjs from 'dayjs'

/**
 * OFFICE 게시판·자료실 공용 타입/헬퍼.
 * 게시글·조회수·첨부는 실데이터(board_posts / attachments)이며 조회/변경은 서버 훅(boardPostsApi.ts)이
 * 담당한다. 코멘트는 다른 상세페이지와 동일하게 공용 코멘트(entity_feedback / FeedbackPanel)를 쓴다.
 * 필드는 public.board_posts 컬럼과 대응한다(설계: docs/docs_planning/3_1_1_board_archive_notice.md).
 */
/** 게시글 첨부파일(로컬 표시용 형태). 실제 저장/다운로드는 attachments(BOARD_POST)를 쓴다. */
export interface BoardAttachment {
  id: string
  name: string
  /** 바이트 단위 크기. */
  size: number
  /** MIME 타입. */
  type: string
  /** 세션 내 다운로드용 objectURL(새로고침 시 무효). */
  url?: string
}

export interface BoardPost {
  id: string
  title: string
  author: string
  /** 게시일. `YYYY.MM.DD` 표기. */
  date: string
  /** 본문(리치 텍스트 HTML). 게시판 상세에서만 렌더링하며 자료실은 사용하지 않는다. */
  content?: string
  /** 자료실 목록 행에 노출하는 요약(약 40자). 자료실은 상세페이지가 없어 유일한 설명이다. */
  summary?: string
  /** 첨부파일 목록(로컬 표시용). 실데이터 첨부는 attachments 훅으로 별도 조회한다. */
  attachments?: BoardAttachment[]
  /** 소속 게시판 내 최상단 고정. */
  pinned?: boolean
  /** 전체 공지 — OFFICE 공지사항 메뉴에 노출한다. 자료실은 불가. */
  globalNotice?: boolean
  /** 전체 공지 만료일(`YYYY.MM.DD`). 미지정 시 무기한. */
  noticeUntil?: string
  /** 소프트 삭제 시각(`YYYY.MM.DD`). 채워지면 목록에 '비활성'으로 흐리게 표시된다. */
  deletedAt?: string
  /** 누적 조회수(board_posts.view_count). */
  views?: number
}

/** 목록 페이지당 행 수(게시판·자료실·공지사항 공통). */
export const BOARD_PAGE_SIZE = 20

/** 게시일이 현재 기준 최근 72시간 이내이면 NEW로 간주한다. */
export function isNewPost(date: string): boolean {
  const hours = dayjs().diff(dayjs(date.replace(/\./g, '-')), 'hour')
  return hours >= 0 && hours < 72
}
