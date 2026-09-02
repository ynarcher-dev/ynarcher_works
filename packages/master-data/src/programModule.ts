/**
 * 사업 모듈(메뉴) 공통 어휘 — WORKS(운영)와 GUEST(참여)가 같은 말을 쓰게 하는 단일 원천.
 *
 * GUEST 사이드바는 WORKS에서 공개로 올린 모듈 그대로이므로, 두 앱이 같은 행을 각자의 말로
 * 부르면 운영자가 "파일첨부"라 부른 메뉴가 참여자 화면에서는 다른 이름으로 서게 된다.
 * 라벨·상태·일정 읽기처럼 **행의 뜻에 속하는 것**만 여기 둔다. 아이콘·색·진입 방식은 화면의
 * 사정이므로 각 앱이 가진다.
 */

/**
 * module_type enum → 표시 라벨.
 *
 * 2026-09-03 — 정형 운영 모듈 7종(서면·대면평가, OT, 멘토링, 매칭, 데모데이, 성과)을
 * 걷었다. enum 값은 남아 있으나 카탈로그(`module_templates`)에서 빠져 배치할 수 없으므로,
 * 여기서도 이름을 갖지 않는다. 미지의 값은 `moduleTypeLabel()`이 원문 그대로 돌려준다.
 */
export const MODULE_TYPE_LABEL: Record<string, string> = {
  RECRUITMENT: '모집/신청서',
  POST: '글쓰기',
  LINK: 'URL첨부',
  FILE: '파일첨부',
}

/** module_status enum → 표시 라벨. */
export const MODULE_STATUS_LABEL: Record<string, string> = {
  DRAFT: '준비',
  OPEN: '진행',
  CLOSED: '완료',
  CANCELLED: '취소',
}

/** 모듈 템플릿 라벨(미지의 값은 원문 그대로 — 지어내는 것보다 낫다). */
export function moduleTypeLabel(moduleType: string): string {
  return MODULE_TYPE_LABEL[moduleType] ?? moduleType
}

/** 모듈 상태 라벨(미지의 값은 준비로 본다). */
export function moduleStatusLabel(status: string | null | undefined): string {
  return MODULE_STATUS_LABEL[status ?? 'DRAFT'] ?? '준비'
}

/** program_modules.settings(jsonb)에 담는 운영 설정(일정·메모). */
export interface ModuleSettings {
  start_date?: string
  end_date?: string
  memo?: string
}

/** settings jsonb에서 일정·메모를 방어적으로 읽는다(다른 키는 보존 대상). */
export function readModuleSettings(settings: unknown): ModuleSettings {
  if (!settings || typeof settings !== 'object') return {}
  const rec = settings as Record<string, unknown>
  const str = (v: unknown) => (typeof v === 'string' && v.length > 0 ? v : undefined)
  return {
    start_date: str(rec.start_date),
    end_date: str(rec.end_date),
    memo: str(rec.memo),
  }
}

/**
 * 모듈 기간 한 줄. 한쪽만 있으면 그쪽만 말한다 — 비어 있는 칸을 물음표나 오늘 날짜로
 * 메우면 없는 일정을 있는 것처럼 읽게 된다.
 */
export function formatModulePeriod(settings: ModuleSettings): string {
  const { start_date: from, end_date: to } = settings
  if (from && to) return `${from} ~ ${to}`
  if (from) return `${from} ~`
  if (to) return `~ ${to}`
  return '일정 미등록'
}

/** 인스턴스 표시명: 모듈명(자율 입력) 우선, 없으면 템플릿 라벨 폴백. */
export function moduleDisplayName(mod: { title?: string | null; module_type: string }): string {
  return mod.title?.trim() || moduleTypeLabel(mod.module_type)
}

/**
 * 상태 톤(배지 색 키). `@ynarcher/ui`의 BadgeTone과 같은 값 집합이되, 이 패키지는 UI에
 * 의존하지 않으므로 문자열 합집합으로 둔다 — 어휘가 부품을 끌어오면 순수 TS가 아니게 된다.
 */
export type ModuleStatusTone = 'neutral' | 'success' | 'info' | 'warning' | 'danger'

/** module_status enum → 표시 톤. WORKS 배지와 GUEST 일정 카드가 같은 색을 쓴다. */
export const MODULE_STATUS_TONE: Record<string, ModuleStatusTone> = {
  DRAFT: 'neutral',
  OPEN: 'success',
  CLOSED: 'info',
  CANCELLED: 'danger',
}

/**
 * 상태별 기간 바 색(캘린더 바·간트 막대). 배지 팔레트와 같은 계열이라 같은 상태가
 * 화면 어디서나 같은 색으로 읽힌다.
 */
export const MODULE_STATUS_BAR_CLASS: Record<string, string> = {
  DRAFT: 'bg-gray-300',
  OPEN: 'bg-success',
  CLOSED: 'bg-info',
  CANCELLED: 'bg-danger/50',
}

/** 칸반 열 순서: 준비 → 진행 → 완료 → 취소(module_status enum 순). */
export const MODULE_STATUS_COLUMNS: readonly { key: string; label: string; tone: ModuleStatusTone }[] =
  ['DRAFT', 'OPEN', 'CLOSED', 'CANCELLED'].map((key) => ({
    key,
    label: moduleStatusLabel(key),
    tone: MODULE_STATUS_TONE[key] ?? 'neutral',
  }))
