/**
 * M&A BUYER 원장 화면 상수.
 *
 * 원장은 딜(ma_programs)에 매달리지 않는 M&A/PE 소유의 독립 원장이다 — 바이어는 딜보다 먼저
 * 쌓이고, 어느 딜로 이어질지는 나중에 정해진다. 근거: supabase/migrations/20260907120000.
 */
export const MA_BUYER_TABLE = 'ma_buyers'

/** 사이드바 줄·페이지 제목이 함께 읽는 이름. 두 곳에 따로 적으면 눌러 들어간 메뉴와 도착한 화면의 이름이 달라진다. */
export const MA_BUYER_LIST_LABEL = 'M&A BUYER'

/**
 * 자료·코멘트·회의록 링크가 이 원장을 가리킬 때 쓰는 다형 키(단수형).
 * 기여 로그의 `entity_table`은 이 값이 아니라 표 이름(`ma_buyers`)이다 — 트리거 인자가 그
 * 값이고, update_entity/deactivate_entity가 표 이름으로 트리거 존재를 확인한다.
 */
export const MA_BUYER_TARGET_TYPE = 'ma_buyer'

/**
 * 이 원장의 루트 경로 — 목록이 이 주소이고 상세·등록이 그 아래 선다.
 *
 * `/mna` 아래가 아닌 이유는 `resolveWorkspace`가 **경로로 자리를 판정**하기 때문이다. 이 원장의
 * 자리는 DATABASE인데 주소가 `/mna`로 시작하면 M&A/PE 항목으로 잡혀, 사이드바가 딜 목록으로
 * 바뀌고 스위처도 다른 항목을 가리킨다(권한 키가 mna인 것과는 별개의 축이다).
 */
export const MA_BUYER_BASE_PATH = '/buyers'

/** 목록에서 부르는 이름(빈 상태 문구·등록 버튼). */
export const MA_BUYER_NOUN = '바이어'

/**
 * 민감정보 마스킹 정책 콘텐츠 키(ADMIN '민감정보 관리').
 * 목록과 상세가 같은 키를 쓴다 — 이 원장은 화면이 하나뿐이라 범위로 갈릴 것이 없다.
 */
export const MA_BUYER_CONTENT_KEY = 'mna.buyers'

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

export interface MaBuyerRow {
  id: string
  name: string
  industries: string[] | null
  wish: string | null
  available_funds: number | null
  /** 바이어 쪽 연락 담당자 — 우리 쪽 관리 주체가 아니다(이 원장은 영구 공동관리다). */
  contact_name: string | null
  contact_email: string | null
  /**
   * STARTUP 원장 매핑(선택). 기업명과 별개의 값이다 — 이름은 '이 바이어를 부르는 이름'이고
   * 이 값은 '그 기업이 우리 원장의 어느 행인가'다.
   */
  startup_id: string | null
  /** 매핑된 기업(임베드). 그 기업을 볼 수 없으면 비어 온다 — 화면은 링크 없이 물러난다. */
  startup?: { id: string; name: string } | null
  overview_html: string | null
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
