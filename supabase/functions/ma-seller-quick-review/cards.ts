// [M&A 셀러 퀵 리뷰] 절(카드) 키·라벨·상한 — 프롬프트와 검증이 함께 쓰는 상수.
//
// 이 파일에 Deno API를 쓰지 않는다. 프론트의 규격 상수(maSellerQuickReview.ts)와 어긋나면
// 모델이 화면에 없는 절을 채우게 되므로, works 쪽 vitest가 이 파일을 직접 import해 두 목록이
// 같은지 확인한다(cards.test.ts). 러너를 하나로 둔 이유는 테스트가 사는 곳이 둘이 되면 한쪽은
// 곧 돌지 않기 때문이다.
//
// 근거: docs/docs_planning/3_6_1_ma_seller_quick_review.md

/** 절 키. 문서에 인쇄되는 순서 그대로다 — 화면 순서가 곧 요청 순서다. */
export const CARD_KEYS = [
  'summary',
  'basics',
  'intro',
  'products',
  'financials',
  'valuation',
  'highlights',
] as const

export type CardKey = (typeof CARD_KEYS)[number]

/** 화면 라벨(오류 메시지·요약 줄에서 절을 부르는 말). */
export const CARD_LABELS: Record<CardKey, string> = {
  summary: '한줄 요약',
  basics: '주요내용',
  intro: '회사 소개',
  products: '제품·서비스',
  financials: '재무 요약',
  valuation: 'Valuation',
  highlights: '핵심 포인트',
}

/**
 * 절이 객체 하나인지 목록인지 — 빈 결과 판정과 스키마 생성이 함께 쓴다.
 *
 * **투자 포인트만 목록이다.** 나머지는 안에 목록을 품더라도 절 자체는 한 덩어리라, 절을
 * 통째로 갈아 끼울 때 그 안의 서술과 목록이 함께 움직여야 한다.
 */
export const CARD_SHAPE: Record<CardKey, 'object' | 'array'> = {
  summary: 'object',
  basics: 'object',
  intro: 'object',
  products: 'object',
  financials: 'object',
  valuation: 'object',
  highlights: 'array',
}

/** 입력이 유효한 절 키인지. 클라이언트가 보낸 값을 그대로 믿지 않는다. */
export function isCardKey(v: unknown): v is CardKey {
  return typeof v === 'string' && (CARD_KEYS as readonly string[]).includes(v)
}

/**
 * 목록 상한 — 모델이 표를 통째로 옮겨 응답이 잘리는 것을 막는다.
 *
 * 회계연도 상한이 10인 것은 이 문서가 **추세를 보여 주는 자리**이지 재무제표 자체가 아니기
 * 때문이다. 열 해를 넘겨 담으면 표가 가로로 넘쳐 최근 실적이 화면 밖으로 밀린다.
 */
export const LIMITS = {
  /** 회사 소개의 핵심 지표 타일. 문서가 한 줄에 네 칸으로 세우는 자리다. */
  metrics: 4,
  introBullets: 8,
  products: 12,
  productBullets: 6,
  /** 손익·재무상태표의 회계연도 수(두 표가 같은 상한을 쓴다 — 나란히 읽는 표다). */
  fiscalYears: 10,
  valuationBullets: 6,
  /** 투자 포인트 묶음 수와 묶음당 줄 수. 문서가 ①~⑤로 세우던 자리다. */
  highlights: 6,
  highlightBullets: 5,
  /** 절마다 notes·evidence 줄 수. */
  notes: 5,
} as const
