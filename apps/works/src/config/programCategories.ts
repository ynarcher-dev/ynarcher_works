import type { BadgeTone } from '@ynarcher/ui'

/**
 * 사업구분(category) 선택지. DB는 text + CHECK 제약이며 워크스페이스마다 값이 다르다.
 * 사이드바 세분화 메뉴(config/navigation.ts)와 각 워크스페이스 설정(AcWorkspace/MnaWorkspace/
 * ProjectWorkspace)이 이 목록을 함께 참조하므로, 분류를 늘릴 때는 여기와 DB CHECK 제약만 고치면 된다.
 */
export interface ProgramCategoryOption {
  value: string
  label: string
  tone: BadgeTone
}

/** AC 사업구분: 공공/민간/매출/기타. */
export const AC_CATEGORIES: readonly ProgramCategoryOption[] = [
  { value: 'PUBLIC', label: '공공', tone: 'info' },
  { value: 'PRIVATE', label: '민간', tone: 'neutral' },
  { value: 'REVENUE', label: '매출', tone: 'success' },
  { value: 'ETC', label: '기타', tone: 'neutral' },
]

/** M&A 사업구분: 매도/매수/PE 펀드/기타. */
export const MNA_CATEGORIES: readonly ProgramCategoryOption[] = [
  { value: 'SELL', label: 'Sell', tone: 'warning' },
  { value: 'BUY', label: 'Buy', tone: 'info' },
  { value: 'PE_FUND', label: 'PE Fund', tone: 'success' },
  { value: 'ETC', label: '기타', tone: 'neutral' },
]

/** PROJECT 사업구분: 글로벌/신사업/기타. */
export const PROJECT_CATEGORIES: readonly ProgramCategoryOption[] = [
  { value: 'GLOBAL', label: '글로벌', tone: 'info' },
  { value: 'NEW_BIZ', label: '신사업', tone: 'success' },
  { value: 'ETC', label: '기타', tone: 'neutral' },
]

/**
 * 사업구분 값 → 사이드바 `?tab=` 값. 다른 탭(dashboard/mine/all)과 겹치지 않도록
 * 카테고리 값을 소문자로 쓴다(예: `PE_FUND` → `pe_fund`).
 */
export function categoryTab(value: string): string {
  return value.toLowerCase()
}

/** `?tab=` 값이 가리키는 사업구분. 카테고리 탭이 아니면 null. */
export function categoryFromTab(
  categories: readonly ProgramCategoryOption[],
  tab: string,
): ProgramCategoryOption | null {
  return categories.find((c) => categoryTab(c.value) === tab) ?? null
}
