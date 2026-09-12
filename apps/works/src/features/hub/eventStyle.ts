import type { BadgeTone } from '@ynarcher/ui'

/**
 * 시스템 레이어 이벤트 타입 → 배지 톤(AC/PROJECT/FUND/COMPANY).
 *
 * 사용자 일정(업무·휴가)은 여기 없다 — 아래 범주색이 답한다. 이 표에 남은 값들은 `SystemRow`의
 * 배지가 쓰는데, 그 행은 지금 조회에서 걸러져 화면에 서지 않는다(원장은 보존, 표시만 제외).
 */
const eventTone: Record<string, BadgeTone> = {
  AC: 'info',
  PROJECT: 'success',
  FUND: 'warning',
  COMPANY: 'neutral',
}

export function toneOf(eventType: string): BadgeTone {
  return eventTone[eventType] ?? 'neutral'
}

/**
 * 일정 종류의 색 — **상태색이 아니라 범주형 summary 계열**이다([4_color_system_rules §2.2](../../../../../docs/docs_design/4_color_system_rules.md)).
 *
 * 업무와 휴가는 성공·주의·위험이 아니라 **동등한 범주**다. 종전에 휴가가 쓰던 `warning`(황색)은
 * 정본이 '서류 반려·기한 임박·승인 대기'에 배정한 색이라, 정상적으로 승인된 연차가 달력에서
 * 처리해야 할 일처럼 보였다. 업무가 쓰던 `info`(청색)도 같은 이유로 상태 신호를 낭비한다 —
 * 상태색이 범주에 쓰이면 정작 상태를 말해야 할 때 그 색이 이미 다른 뜻을 갖는다.
 *
 * 계열은 정본의 권장 용도를 따른다: 업무는 `blue`(정보·분석), 휴가는 `rose`(인사·관계 범주).
 * 점 하나로는 뜻이 서지 않으므로 색 옆에는 언제나 이름이 함께 선다(상세의 '업무'·'휴가' 소제목,
 * 칸 안의 제목) — 범주색만으로 의미를 전달하지 않는다는 정본의 단서 그대로다.
 */
const categoryDot: Record<string, string> = {
  WORK: 'bg-summary-blue-icon-text',
  LEAVE: 'bg-summary-rose-icon-text',
}

/** 일정 종류의 점 색. 모르는 종류는 중립으로 물러난다(색이 뜻을 지어내지 않는다). */
export function eventDot(eventType: string): string {
  return categoryDot[eventType] ?? 'bg-gray-400'
}
