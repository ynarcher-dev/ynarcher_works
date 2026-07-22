import type { BadgeTone } from '@ynarcher/ui'

/** 캘린더 이벤트 타입 → 색 계열(Badge 팔레트). 시스템 레이어 + 사용자 업무/휴가. */
const eventTone: Record<string, BadgeTone> = {
  AC: 'info',
  PROJECT: 'success',
  FUND: 'warning',
  COMPANY: 'neutral',
  WORK: 'info',
  LEAVE: 'warning',
}

export function toneOf(eventType: string): BadgeTone {
  return eventTone[eventType] ?? 'neutral'
}

/** 셀 안 이벤트 밀도 점(dot) 색 — Badge 톤과 동일 계열. */
export const dotColor: Record<BadgeTone, string> = {
  neutral: 'bg-gray-400',
  success: 'bg-success',
  warning: 'bg-warning',
  info: 'bg-info',
  danger: 'bg-danger',
}
