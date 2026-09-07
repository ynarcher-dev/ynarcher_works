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
 * 이 원장의 루트 경로 — 목록이 이 주소이고 상세·등록이 그 아래 선다.
 *
 * `/mna` 아래가 아닌 이유는 `resolveWorkspace`가 **경로로 자리를 판정**하기 때문이다. 이 원장의
 * 자리는 DATABASE인데 주소가 `/mna`로 시작하면 M&A/PE 항목으로 잡혀, 사이드바가 딜 목록으로
 * 바뀌고 스위처도 다른 항목을 가리킨다(권한 키가 mna인 것과는 별개의 축이다).
 */
export const MA_BUYER_BASE_PATH = '/buyers'

/**
 * 자료·코멘트·회의록 링크가 이 원장을 가리킬 때 쓰는 다형 키(단수형).
 * 기여 로그의 `entity_table`은 이 값이 아니라 표 이름(`ma_buyers`)이다 — 트리거 인자가 그
 * 값이고, update_entity/deactivate_entity가 표 이름으로 트리거 존재를 확인한다.
 */
export const MA_BUYER_TARGET_TYPE = 'ma_buyer'

/** 목록에서 부르는 이름(빈 상태 문구·등록 버튼). */
export const MA_BUYER_NOUN = '바이어'

/** 분야 선택 상한. startups.industries와 같은 규칙이라 같은 수를 쓴다. */
export const MAX_INDUSTRIES = 3

/** 원 단위 저장값을 백만원으로 줄여 적는다 — 단위는 값이 아니라 표 머리글·카드 헤더가 답한다. */
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
  overview_html: string | null
  created_at: string
  updated_at: string
  created_by: string | null
  creator?: { id: string; name: string } | null
}
