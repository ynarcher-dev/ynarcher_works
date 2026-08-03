import type { BadgeTone } from '@ynarcher/ui'

/**
 * 사업구분(category) 선택지. DB는 text + CHECK 제약이며 워크스페이스마다 값이 다르다.
 * 각 워크스페이스 설정(AcWorkspace/MnaWorkspace/ProjectWorkspace)이 이 목록을 주입하고,
 * 등록 폼의 셀렉트·목록 표의 배지·목록 사업구분 필터·업로드 '구분' 열이 함께 참조하므로,
 * 분류를 늘릴 때는 여기와 DB CHECK 제약만 고치면 된다.
 *
 * 2026-08-03: 사업구분은 사이드바 세분화 메뉴가 아니라 목록 필터로 다룬다. 메뉴로 두면 분류가
 * '어디에 있는가'(위치)가 되어 상태·부서 같은 다른 축과 겹쳐 걸 수 없고, 분류를 하나 늘릴
 * 때마다 사이드바가 길어진다. 필터로 두면 축이 하나 더 붙을 뿐이다.
 */
export interface ProgramCategoryOption {
  value: string
  /** 목록·상세의 배지 표기이자 폼·필터의 선택지 표기. 표 폭을 위해 짧게 유지한다. */
  label: string
  tone: BadgeTone
}

/**
 * AC 사업구분: 공공/민간/매출/신규/기타.
 * '신규'는 성격(공공·민간·매출)이 아직 정해지지 않은 건의 자리다 — 그전까지는 전부 '기타'로
 * 흘러들어, 어디에도 속하지 않는 건과 아직 정하지 않은 건이 한 칸에 섞여 있었다.
 */
export const AC_CATEGORIES: readonly ProgramCategoryOption[] = [
  { value: 'PUBLIC', label: '공공', tone: 'info' },
  { value: 'PRIVATE', label: '민간', tone: 'neutral' },
  { value: 'REVENUE', label: '매출', tone: 'success' },
  { value: 'NEW', label: '신규', tone: 'warning' },
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
