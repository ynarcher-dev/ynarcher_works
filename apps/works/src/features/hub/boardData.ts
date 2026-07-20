import dayjs from 'dayjs'

/**
 * OFFICE 게시판·자료실 데모 데이터.
 * 서버 연동 전까지 대시보드 카드와 사이드바 게시 화면이 공유하는 단일 원천이다.
 * 필드는 public.board_posts 컬럼과 대응한다(설계: docs/docs_planning/3_1_1_board_archive_notice.md).
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
  /** 본문(리치 텍스트 HTML). 게시판 상세에서만 렌더링하며 자료실은 사용하지 않는다. */
  content?: string
  /** 자료실 목록 행에 노출하는 요약(약 40자). 자료실은 상세페이지가 없어 유일한 설명이다. */
  summary?: string
  /** 첨부파일 목록. 자료실은 정확히 1건. */
  attachments?: BoardAttachment[]
  /** 댓글 목록. 자료실은 사용하지 않는다. */
  comments?: BoardComment[]
  /** 소속 게시판 내 최상단 고정. */
  pinned?: boolean
  /** 전체 공지 — OFFICE 공지사항 메뉴에 노출한다. 자료실은 불가. */
  globalNotice?: boolean
  /** 전체 공지 만료일(`YYYY.MM.DD`). 미지정 시 무기한. */
  noticeUntil?: string
  /** 소프트 삭제 시각(`YYYY.MM.DD`). 채워지면 목록에 '비활성'으로 흐리게 표시된다. */
  deletedAt?: string
  /** 누적 조회수. 상세를 열 때 1 증가한다(서버 연동 시 RPC로 대체). */
  views?: number
}

/** 목록 페이지당 행 수(게시판·자료실·공지사항 공통). */
export const BOARD_PAGE_SIZE = 20

/** 게시일이 현재 기준 최근 72시간 이내이면 NEW로 간주한다. */
export function isNewPost(date: string): boolean {
  const hours = dayjs().diff(dayjs(date.replace(/\./g, '-')), 'hour')
  return hours >= 0 && hours < 72
}

/** 전체 공지 노출 대상 여부(만료일이 지난 공지는 제외). */
export function isActiveNotice(post: BoardPost): boolean {
  if (!post.globalNotice || post.deletedAt) return false
  if (!post.noticeUntil) return true
  return dayjs(post.noticeUntil.replace(/\./g, '-')).endOf('day').isAfter(dayjs())
}

/** 게시판 목록 정렬: 고정 글 우선, 그다음 최신순. */
export function sortPosts(posts: BoardPost[]): BoardPost[] {
  return [...posts].sort((a, b) => {
    if (!!a.pinned !== !!b.pinned) return a.pinned ? -1 : 1
    return b.date.localeCompare(a.date)
  })
}

/** `전사 알림` 게시판 시드. 세 건 모두 전체 공지로 등록되어 공지사항 메뉴에 노출된다. */
export const SEED_NOTICES: BoardPost[] = [
  {
    id: 'n1',
    title: '하반기 워크숍(1박2일) 참가 신청 안내',
    author: '경영지원실',
    date: '2026.07.04',
    globalNotice: true,
    pinned: true,
    views: 128,
    attachments: [
      {
        id: 'na1',
        name: '2026_하반기_워크숍_안내.pdf',
        size: 214_000,
        type: 'application/pdf',
      },
    ],
    content:
      '<p>올 하반기 전사 워크숍을 아래와 같이 진행합니다. 임직원 여러분의 많은 참여 바랍니다.</p><ul><li>일정: 8월 21일(금)~22일(토), 1박 2일</li><li>장소: 강원도 평창 리조트</li><li>신청 마감: <strong>7월 18일(금)</strong></li></ul><p>자세한 사항은 첨부 파일을 확인하시고, 신청은 경영지원실로 회신 바랍니다.</p>',
    comments: [
      { id: 'c1', author: '김투자', content: '차량 지원도 있나요?', createdAt: '2026.07.04 14:20' },
      { id: 'c2', author: '경영지원실', content: '네, 서울 본사에서 단체 버스 운행 예정입니다.', createdAt: '2026.07.04 15:02' },
    ],
  },
  { id: 'n2', title: '7월 전사 타운홀 미팅 일정 공지', author: '경영지원실', date: '2026.07.03', globalNotice: true, views: 86 },
  { id: 'n3', title: '정보보안 서약서 재제출 요청', author: '보안담당', date: '2026.06.27', globalNotice: true, views: 203 },
]

/** `공용자료실`(ARCHIVE) 시드. 1행 = 파일 1건이므로 첨부는 반드시 1개다. */
export const SEED_FILES: BoardPost[] = [
  {
    id: 'f1',
    title: '투자심의보고서 표준 템플릿 v3',
    author: '투자운용팀',
    date: '2026.07.05',
    summary: '투자심의위원회 제출용 표준 양식(2026년 개정판)',
    pinned: true,
    attachments: [{ id: 'fa1', name: '투자심의보고서_표준템플릿_v3.xlsx', size: 254_000, type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }],
  },
  {
    id: 'f2',
    title: '사내 브로셔(2026 국문/영문)',
    author: '경영지원실',
    date: '2026.06.28',
    summary: '대외 소개용 회사 브로셔 국문·영문 합본',
    attachments: [{ id: 'fa2', name: '와이앤아처_브로셔_2026.pdf', size: 3_140_000, type: 'application/pdf' }],
  },
  {
    id: 'f3',
    title: 'NDA 표준 서식',
    author: 'M&A팀',
    date: '2026.06.20',
    summary: '딜 검토 착수 전 상호 비밀유지계약 표준안',
    attachments: [{ id: 'fa3', name: 'NDA_표준서식.docx', size: 86_000, type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }],
  },
]
