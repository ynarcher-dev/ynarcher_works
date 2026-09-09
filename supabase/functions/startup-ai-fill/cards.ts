// [AI 작성하기] 카드 키·라벨·고정 선택지 — 프롬프트와 검증이 함께 쓰는 상수.
//
// 이 파일에 Deno API를 쓰지 않는다. 프론트의 규격 상수(startupProfile.ts / startupGrowth.ts)와
// 어긋나면 모델이 화면에 없는 값을 채우게 되므로, works 쪽 vitest가 이 파일을 직접 import해
// 두 목록이 같은지 확인한다(cards.test.ts). 러너를 하나로 둔 이유는 테스트가 사는 곳이 둘이
// 되면 한쪽은 곧 돌지 않기 때문이다.
//
// 근거: docs/docs_planning/3_3_5_startup_ai_fill.md §5·§7

/**
 * 체크 단위(카드) 키. 상세 화면의 밴드·순서와 같다 — 기본 2 → 역량 5 → 실적 8.
 *
 * 2026-09-09에 셋을 갈라 12개에서 15개가 됐다(지식재산·인증 → 지식재산 / 인증·정부과제,
 * 트랙션·고객 → 핵심 지표 / 주요 고객, 매출·재무 → 매출 / 재무). 체크 단위를 저장 단위에
 * 맞추는 것이 이 목록의 규칙인데, 그 셋만 한 칸에 목록 둘을 담고 있어 담당자가 매출만 다시
 * 뽑으려 해도 재무까지 함께 갈렸다 — 손으로 다듬은 절반을 지키려면 카드 전체를 포기해야 했다.
 */
export const CARD_KEYS = [
  'basics',
  'summary',
  'business',
  'tech',
  'team',
  'ip',
  'cert',
  'timeline',
  'traction',
  'customers',
  'revenue',
  'finance',
  'employee',
  'shareholders',
  'investment',
] as const

export type CardKey = (typeof CARD_KEYS)[number]

/** 화면 라벨(오류 메시지·요약 줄에서 카드를 부르는 말). */
export const CARD_LABELS: Record<CardKey, string> = {
  basics: '기본 정보',
  summary: '요약',
  business: '비즈니스',
  tech: '제품·기술',
  team: '팀·조직',
  ip: '지식재산',
  cert: '인증·정부과제',
  timeline: '연혁',
  traction: '핵심 지표',
  customers: '주요 고객',
  revenue: '매출',
  finance: '재무',
  employee: '고용',
  shareholders: '주주',
  investment: '투자',
}

/**
 * 카드가 객체 하나인지(null 가능) 목록인지 — 빈 결과 판정과 스키마 생성이 함께 쓴다.
 *
 * 2026-09-09에 갈려 나온 여섯 중 다섯(ip·traction·customers·revenue·finance)은 목록 하나만 담게
 * 되어 'array'가 됐다. `cert`만 객체로 남는 이유는 인증과 정부과제가 화면에서 한 카드에 함께
 * 서기 때문이다 — 갈랐다고 아무 데나 다시 가르지 않는다. 가르는 기준은 저장 단위이지 목록 수가 아니다.
 */
export const CARD_SHAPE: Record<CardKey, 'object' | 'array'> = {
  basics: 'object',
  summary: 'object',
  business: 'object',
  tech: 'object',
  team: 'object',
  ip: 'array',
  cert: 'object',
  timeline: 'array',
  traction: 'array',
  customers: 'array',
  revenue: 'array',
  finance: 'array',
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

export const COMPANY_FORM_OPTIONS = ['법인', '개인', '예비'] as const
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
  /** 요약 3축의 축마다 문장 수. 화면 입력 칸이 축마다 셋이라 그 수에 맞춘다. */
  summaryLines: 3,
  /** 카드마다 notes·evidence 줄 수. */
  notes: 5,
} as const
