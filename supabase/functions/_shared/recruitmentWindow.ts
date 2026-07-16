// [AC 모집] 공개 기간(타이머) 게이트. 공개 상태 + open_at~close_at으로
// 지금 신청서를 열어줄 수 있는지 판정한다. 공개 Edge Function(form-get/submit)의 단일 기준.

/** 신청서를 열 수 없는 사유. null이면 공개 가능. */
export type NotOpenReason = 'private' | 'closed' | 'scheduled' | null

/**
 * 지금(now) 신청서 공개 가능 여부.
 * - PRIVATE → 'private'
 * - CLOSED → 'closed'
 * - OPEN 이면서 open_at 이전 → 'scheduled'(아직 시작 전)
 * - OPEN 이면서 close_at 이후 → 'closed'(마감)
 * - 그 외 → null(공개)
 */
export function windowState(
  status: string,
  openAt: string | null,
  closeAt: string | null,
  now: number = Date.now(),
): { reason: NotOpenReason } {
  if (status === 'PRIVATE') return { reason: 'private' }
  if (status !== 'OPEN') return { reason: 'closed' }
  if (openAt && now < new Date(openAt).getTime()) return { reason: 'scheduled' }
  if (closeAt && now > new Date(closeAt).getTime()) return { reason: 'closed' }
  return { reason: null }
}
