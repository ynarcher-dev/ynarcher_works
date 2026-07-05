import dayjs from 'dayjs'

/**
 * HUB 게시판(공지사항·자료실·인사이트) 데모 데이터.
 * 전용 테이블 확정 전까지 대시보드 카드와 사이드바 보드 화면이 공유하는 단일 원천이다.
 * 각 항목은 게시판 표준 열(제목·작성자·게시일)로 정규화한다.
 */
export interface BoardPost {
  id: string
  title: string
  author: string
  /** 게시일. `YYYY.MM.DD` 표기. */
  date: string
}

/** 게시일이 현재 기준 최근 72시간 이내이면 NEW로 간주한다. */
export function isNewPost(date: string): boolean {
  const hours = dayjs().diff(dayjs(date.replace(/\./g, '-')), 'hour')
  return hours >= 0 && hours < 72
}

export const HUB_NOTICES: BoardPost[] = [
  { id: 'n1', title: '하반기 워크숍(1박2일) 참가 신청 안내', author: '경영지원실', date: '2026.07.04' },
  { id: 'n2', title: '7월 전사 타운홀 미팅 일정 공지', author: '경영지원실', date: '2026.07.03' },
  { id: 'n3', title: '정보보안 서약서 재제출 요청', author: '보안담당', date: '2026.06.27' },
]

export const HUB_FILES: BoardPost[] = [
  { id: 'f1', title: '투자심의보고서 표준 템플릿 v3', author: '투자운용팀', date: '2026.07.05' },
  { id: 'f2', title: '사내 브로셔(2026 국문/영문)', author: '경영지원실', date: '2026.06.28' },
  { id: 'f3', title: 'NDA 표준 서식', author: 'M&A팀', date: '2026.06.20' },
]

export const HUB_INSIGHTS: BoardPost[] = [
  { id: 'i1', title: '2026 상반기 국내 초기투자 시장 동향', author: '리서치팀', date: '2026.07.04' },
  { id: 'i2', title: 'AI 스타트업 밸류에이션 벤치마크', author: '리서치팀', date: '2026.06.25' },
  { id: 'i3', title: '세컨더리 딜 소싱 인사이트 노트', author: 'M&A팀', date: '2026.06.18' },
]
