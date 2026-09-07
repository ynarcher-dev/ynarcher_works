/**
 * M&A 거래상대 원장(BUYER·SELLER) 화면 설정.
 *
 * 원장은 딜(ma_programs)에 매달리지 않는 M&A/PE 소유의 독립 원장 둘이다 — 사는 쪽도 파는
 * 쪽도 딜보다 먼저 쌓이고, 어느 딜로 이어질지는 나중에 정해진다.
 * 근거: supabase/migrations/20260907120000(BUYER)·20260907160000(SELLER).
 *
 * **화면은 한 벌이고 갈리는 것은 이 설정뿐이다.** 두 원장은 칸·정책·다형 키 규약이 같아서
 * 복제하면 목록·상세·폼·훅 일곱 파일이 두 벌이 되고, 그때부터 한쪽만 고쳐지는 날이 온다
 * (사업 3종이 features/program 하나를 `ProgramWorkspaceConfig`로 공유하는 것과 같은 이유).
 * 표만 물리적으로 갈린 것도 그쪽과 같다 — 다형 키 문자열이 자료·코멘트·변동 이력·회의록
 * 링크에 값으로 저장돼 있어, 한 표로 합치려면 그 저장값을 사후에 고쳐 써야 한다.
 */

/** 갈리는 값 전부. 여기 없는 것은 두 원장이 똑같이 쓴다. */
export interface MaPartyConfig {
  /**
   * 원장 표 이름. 기여 로그의 `entity_table`이자 update_entity/deactivate_entity의 인자다
   * (그 둘은 허용 목록이 아니라 표에 트리거가 붙어 있는지를 카탈로그에서 확인한다).
   */
  table: string
  /** 자료·코멘트·회의록 링크가 이 원장을 가리킬 때 쓰는 다형 키(단수형). */
  targetType: string
  /** 사이드바 줄·페이지 제목이 함께 읽는 이름. 두 곳에 따로 적으면 메뉴와 화면의 이름이 갈린다. */
  listLabel: string
  /** 이 원장의 루트 경로 — 목록이 이 주소이고 상세·등록이 그 아래 선다. */
  basePath: string
  /** 목록에서 부르는 이름(빈 상태 문구·등록 버튼). */
  noun: string
  /** 민감정보 마스킹 정책 콘텐츠 키(ADMIN '민감정보 관리'). */
  contentKey: string
  /**
   * 금액 칸의 이름. 저장 컬럼은 둘 다 `available_funds` 하나이고 뜻만 갈린다 —
   * 사는 쪽에서는 '얼마를 쓸 수 있나', 파는 쪽에서는 '얼마 규모의 거래인가'다.
   * 칸을 갈라 두면 목록의 정렬 축이 원장마다 다른 자리에 서서 두 원장을 견줄 수 없다.
   */
  fundsLabel: string
  /** 희망사항 칸의 예시. 원장이 무엇을 받는 자리인지는 이 한 줄이 답한다. */
  wishPlaceholder: string
  /** 상세내용 에디터의 예시. */
  overviewPlaceholder: string
  /**
   * 퀵 리뷰(매각 대상 소개 문서)를 이 원장에서 쓰는가.
   *
   * **셀러만 켠다**(2026-09-07 사용자 지정). 이 문서는 '파는 회사를 소개하는' 자리라 사는
   * 쪽에서는 주주구성·Valuation·투자 포인트가 대부분 빈다. 칸이 대부분 비는 문서를 세우면
   * 담당자는 그것을 '아직 안 쓴 것'으로 읽고 매번 채우려 한다.
   *
   * 켜는 데 필요한 것은 이 스위치와 원장의 `quick_review` 컬럼 둘뿐이다 — 화면·Edge Function은
   * 그대로 쓴다(다만 바이어를 열 때는 쓰기 자격을 묻는 RPC가 하나 더 필요하다. 함수는 대상마다
   * 얇게 서고 그 물음이 대상마다 다르다).
   */
  hasQuickReview?: boolean
}

/**
 * 자리(경로)를 `/mna` 아래에 두지 않는다.
 *
 * 두 원장의 자리는 M&A/PE 항목이지만, 그 항목의 딜 구획이 이미 `/mna`를 갖고 있고
 * `resolveWorkspace`는 **경로 앞머리로 구획을 판정**한다 — `/mna/buyers`로 두면 딜 구획이
 * 먼저 걸려, 사이드바에서 어느 줄에 서 있는지 화면이 답하지 못한다.
 */
export const MA_BUYER: MaPartyConfig = {
  table: 'ma_buyers',
  targetType: 'ma_buyer',
  listLabel: 'M&A BUYER',
  basePath: '/buyers',
  noun: '바이어',
  contentKey: 'mna.buyers',
  fundsLabel: '가용자금',
  wishPlaceholder: '예: 제조 분야 경영권 인수',
  overviewPlaceholder: '인수 배경·희망 조건·미팅 메모 등을 자유롭게 적습니다.',
}

export const MA_SELLER: MaPartyConfig = {
  table: 'ma_sellers',
  targetType: 'ma_seller',
  listLabel: 'M&A SELLER',
  basePath: '/sellers',
  noun: '셀러',
  contentKey: 'mna.sellers',
  fundsLabel: '희망 매각가',
  wishPlaceholder: '예: 경영권 포함 지분 전량 매각',
  overviewPlaceholder: '매각 배경·희망 조건·미팅 메모 등을 자유롭게 적습니다.',
  hasQuickReview: true,
}

/** 분야 선택 상한. startups.industries와 같은 규칙이라 같은 수를 쓴다. */
export const MAX_INDUSTRIES = 3

/**
 * 저장은 원 단위 하나이고, 읽는 자리마다 단위가 갈린다.
 *
 * **목록은 백만원**(`toMillion`) — 열을 세로로 훑으며 크기를 견주는 자리라 자릿수가 짧아야
 * 하고, 단위는 값이 아니라 머리글이 한 번만 답한다.
 * **상세·입력은 원**(`toWon`) — 한 건을 정확히 읽고 적는 자리라 반올림이 끼면 안 된다
 * (백만원으로 받으면 5천만원을 '50'으로 적게 되고, 그 '50'은 오십으로도 읽힌다).
 */
export function toMillion(v: unknown): string {
  if (v == null || v === '') return '-'
  return Math.round(Number(v) / 1_000_000).toLocaleString()
}

export interface MaPartyRow {
  id: string
  name: string
  industries: string[] | null
  wish: string | null
  available_funds: number | null
  /** 상대 쪽 연락 담당자 — 우리 쪽 관리 주체가 아니다(이 원장들은 영구 공동관리다). */
  contact_name: string | null
  contact_email: string | null
  /**
   * STARTUP 원장 매핑(선택). 기업명과 별개의 값이다 — 이름은 '이 상대를 부르는 이름'이고
   * 이 값은 '그 기업이 우리 원장의 어느 행인가'다.
   */
  startup_id: string | null
  /** 매핑된 기업(임베드). 그 기업을 볼 수 없으면 비어 온다 — 화면은 링크 없이 물러난다. */
  startup?: { id: string; name: string } | null
  overview_html: string | null
  /**
   * 퀵 리뷰 문서(절 7종). 상세 조회에서만 읽는다 — 목록은 이 칸을 가져오지 않는다.
   * 모양은 `quickReview.ts`가 소유하고 여기서는 원문 그대로 들고 있는다(읽는 함수가 한 벌이라
   * 화면마다 다른 모양으로 해석될 자리가 없다).
   */
  quick_review?: unknown
  created_at: string
  updated_at: string
  created_by: string | null
  creator?: { id: string; name: string } | null
}

/** 원 단위 그대로, 세 자리마다 쉼표. 상세·입력이 쓴다. */
export function toWon(v: unknown): string {
  if (v == null || v === '') return '-'
  return Number(v).toLocaleString()
}

/** 입력 문자열(쉼표 포함)을 저장값으로. 숫자가 하나도 없으면 null. */
export function parseWon(v: string): number | null {
  const digits = v.replace(/[^0-9]/g, '')
  return digits === '' ? null : Number(digits)
}

/** 입력 중 표시값 — 숫자만 남기고 세 자리마다 쉼표를 다시 찍는다. */
export function formatWonInput(v: string): string {
  const n = parseWon(v)
  return n === null ? '' : n.toLocaleString()
}
