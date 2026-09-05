// [AI 작성하기] 카드 키·라벨·고정 선택지 — 프롬프트와 검증이 함께 쓰는 상수.
//
// 이 파일에 Deno API를 쓰지 않는다. 프론트의 규격 상수(startupProfile.ts / startupGrowth.ts)와
// 어긋나면 모델이 화면에 없는 값을 채우게 되므로, works 쪽 vitest가 이 파일을 직접 import해
// 두 목록이 같은지 확인한다(cards.test.ts). 러너를 하나로 둔 이유는 테스트가 사는 곳이 둘이
// 되면 한쪽은 곧 돌지 않기 때문이다.
//
// 근거: docs/docs_planning/3_3_5_startup_ai_fill.md §5·§7

/** 체크 단위(카드) 키. 상세 화면의 밴드·순서와 같다 — 역량 4 → 실적 6. */
export const CARD_KEYS = [
  'business',
  'tech',
  'team',
  'ip',
  'timeline',
  'traction',
  'revenue',
  'employee',
  'shareholders',
  'investment',
] as const

export type CardKey = (typeof CARD_KEYS)[number]

/** 화면 라벨(오류 메시지·요약 줄에서 카드를 부르는 말). */
export const CARD_LABELS: Record<CardKey, string> = {
  business: '비즈니스',
  tech: '제품·기술',
  team: '팀·조직',
  ip: '지식재산·인증',
  timeline: '연혁',
  traction: '트랙션·고객',
  revenue: '매출·재무',
  employee: '고용',
  shareholders: '주주',
  investment: '투자',
}

/** 카드가 객체 하나인지(null 가능) 목록인지 — 빈 결과 판정과 스키마 생성이 함께 쓴다. */
export const CARD_SHAPE: Record<CardKey, 'object' | 'array'> = {
  business: 'object',
  tech: 'object',
  team: 'object',
  ip: 'object',
  timeline: 'array',
  traction: 'object',
  revenue: 'object',
  employee: 'array',
  shareholders: 'array',
  investment: 'array',
}

/** 입력이 유효한 카드 키인지. 클라이언트가 보낸 값을 그대로 믿지 않는다. */
export function isCardKey(v: unknown): v is CardKey {
  return typeof v === 'string' && (CARD_KEYS as readonly string[]).includes(v)
}

// ── 고정 선택지 ────────────────────────────────────────────────────────
// 프론트 startupProfile.ts / startupGrowth.ts 의 같은 이름 상수와 한 벌이다.
// 모델이 이 밖의 값을 돌려주면 validate.ts 가 null 로 치환하고 notes 에 원문을 남긴다.

export const DEV_STAGE_OPTIONS = ['아이디어', '프로토타입', 'MVP', '정식 출시', '양산'] as const
export const DEV_INSOURCING_OPTIONS = ['자체 개발', '일부 외주', '전면 외주'] as const
export const EMPLOYMENT_OPTIONS = ['전업', '겸업'] as const
export const IP_KIND_OPTIONS = ['특허', '상표', '디자인', 'SW저작권'] as const
export const IP_STATUS_OPTIONS = ['출원', '등록'] as const
export const GOV_ROLE_OPTIONS = ['주관', '참여'] as const
export const CUSTOMER_KIND_OPTIONS = ['계약', 'MOU', 'POC'] as const

/** 목록 상한 — 모델이 표를 통째로 옮겨 응답이 잘리는 것을 막는다(3_3_5 §7). */
export const LIMITS = {
  members: 8,
  advisors: 6,
  capabilities: 5,
  timeline: 30,
  traction: 40,
  customers: 20,
  investment: 15,
  /** 카드마다 notes·evidence 줄 수. */
  notes: 5,
} as const
