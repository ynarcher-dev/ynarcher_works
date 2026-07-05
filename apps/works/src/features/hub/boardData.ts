import dayjs from 'dayjs'

/**
 * HUB 게시판(공지사항·자료실·인사이트) 데모 데이터.
 * 전용 테이블 확정 전까지 대시보드 카드와 사이드바 보드 화면이 공유하는 단일 원천이다.
 * 각 항목은 게시판 표준 열(제목·작성자·게시일)로 정규화한다.
 */
/** 게시글 첨부파일. 데모에서는 세션 한정 objectURL로 다운로드를 지원한다. */
export interface BoardAttachment {
  id: string
  name: string
  /** 바이트 단위 크기. */
  size: number
  /** MIME 타입. */
  type: string
  /** 세션 내 다운로드용 objectURL(새로고침 시 무효). 서버 연동 시 저장 경로로 대체. */
  url?: string
}

/** 게시글 댓글. */
export interface BoardComment {
  id: string
  author: string
  content: string
  /** 작성 일시. `YYYY.MM.DD HH:mm` 표기. */
  createdAt: string
}

export interface BoardPost {
  id: string
  title: string
  author: string
  /** 게시일. `YYYY.MM.DD` 표기. */
  date: string
  /** 본문(리치 텍스트 HTML). 목록에는 노출되지 않고 상세 보기에서 렌더링한다. */
  content?: string
  /** 첨부파일 목록. */
  attachments?: BoardAttachment[]
  /** 댓글 목록. */
  comments?: BoardComment[]
}

/** 게시일이 현재 기준 최근 72시간 이내이면 NEW로 간주한다. */
export function isNewPost(date: string): boolean {
  const hours = dayjs().diff(dayjs(date.replace(/\./g, '-')), 'hour')
  return hours >= 0 && hours < 72
}

export const HUB_NOTICES: BoardPost[] = [
  {
    id: 'n1',
    title: '하반기 워크숍(1박2일) 참가 신청 안내',
    author: '경영지원실',
    date: '2026.07.04',
    content:
      '<p>올 하반기 전사 워크숍을 아래와 같이 진행합니다. 임직원 여러분의 많은 참여 바랍니다.</p><ul><li>일정: 8월 21일(금)~22일(토), 1박 2일</li><li>장소: 강원도 평창 리조트</li><li>신청 마감: <strong>7월 18일(금)</strong></li></ul><p>자세한 사항은 첨부 파일을 확인하시고, 신청은 경영지원실로 회신 바랍니다.</p>',
    comments: [
      { id: 'c1', author: '김투자', content: '차량 지원도 있나요?', createdAt: '2026.07.04 14:20' },
      { id: 'c2', author: '경영지원실', content: '네, 서울 본사에서 단체 버스 운행 예정입니다.', createdAt: '2026.07.04 15:02' },
    ],
  },
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
