/**
 * 휴가신청서 양식의 정체와 값 채우기 — 전자결재와 근태현황이 **같은 한 곳**을 본다.
 *
 * 휴가는 2026-09-15부터 전자결재 기안 화면에서 쓰지 않는다(사용자 확정). 신청은 마이오피스
 * `근태현황`의 전용 화면이 받고, 만들어지는 것은 지금까지와 같은 전자결재 문서다 — 결재선을
 * 타고 승인이 나야 휴가가 생긴다는 규칙은 그대로다. 달라진 것은 **입력 화면 하나**다.
 *
 * 양식을 이름이 아니라 **약칭**으로 찾는 이유는 이름이 관리자가 고칠 수 있는 값이기 때문이다
 * (`휴가신청서` → `휴가원`으로 바꾼 날 화면이 양식을 잃는다). 약칭은 문서번호 채번에 쓰여
 * 이미 쌓인 문서가 붙잡고 있다.
 */
import type { ApprovalForm } from '@/features/approval/approvalApi'
import type { FieldValues, FormField } from '@/features/approval/fields'

/** 휴가신청서 양식의 약칭(`approval_forms.abbrev`). */
export const LEAVE_FORM_ABBREV = '휴가'

/** 휴가 화면이 채우는 필드 키 — 2026-08-26 시드가 정한 이름 그대로다. */
export const LEAVE_FIELD_KEYS = {
  type: 'leave_type',
  start: 'start_date',
  end: 'end_date',
  days: 'days',
  reason: 'reason',
} as const

export function isLeaveForm(form: { abbrev: string } | null | undefined): boolean {
  return form?.abbrev === LEAVE_FORM_ABBREV
}

/**
 * 쓸 수 있는 휴가신청서 한 건. 비활성 양식은 고르지 않는다 —
 * 관리자가 내린 양식으로 새 신청을 받으면 문서함에만 남는다.
 */
export function findLeaveForm(forms: ApprovalForm[]): ApprovalForm | null {
  return forms.find((f) => isLeaveForm(f) && f.is_active) ?? null
}

/**
 * 휴가 종류 선택지 — **양식이 정한다.**
 *
 * 화면이 목록을 들고 있으면 관리자가 양식에서 종류를 늘려도 신청 화면에는 나타나지 않고,
 * 반대로 화면에만 있는 종류를 고르면 결재 문서에 양식이 모르는 값이 적힌다. 양식에 선택지가
 * 없을 때만 근태 상태 원장의 휴가 항목으로 물러난다(그마저 없으면 빈 목록이다).
 */
export function leaveTypeOptions(fields: FormField[], fallback: string[]): string[] {
  const field = fields.find((f) => f.key === LEAVE_FIELD_KEYS.type)
  const options = field?.options?.filter((o) => o.trim() !== '') ?? []
  return options.length > 0 ? options : fallback
}

/**
 * 고른 것들 → 결재 문서의 필드 값.
 *
 * **양식에 없는 키는 여기서 걸러지지 않는다** — 저장 직전 `pruneValues(fields, values)`가
 * 양식이 가진 키만 남긴다. 이 함수는 "무엇을 무엇으로 적을지"만 답한다.
 *
 * 중간에 근무일을 건너뛴 신청(`listDates`)은 시작·종료 두 칸만으로 온전히 적히지 않는다.
 * 그때는 **사유 칸에 사용일을 함께 적는다** — 결재자가 며칠에 쉬는지 모르는 채로 도장을 찍지
 * 않도록 하는 것이 먼저다. 이어진 구간은 시작·종료가 이미 답하므로 덧붙이지 않는다. 사용일
 * 원장이 서면 그 원장이 이 자리를 대신한다.
 */
export function leaveFieldValues(input: {
  type: string
  dates: string[]
  reason: string
  /** 사용일을 사유에 함께 적는가(끊긴 선택). */
  listDates: boolean
}): FieldValues {
  const sorted = [...input.dates].sort()
  const start = sorted[0] ?? ''
  const end = sorted[sorted.length - 1] ?? ''
  const reason = input.reason.trim()
  const listed = input.listDates ? sorted.join(', ') : ''
  return {
    [LEAVE_FIELD_KEYS.type]: input.type,
    [LEAVE_FIELD_KEYS.start]: start,
    [LEAVE_FIELD_KEYS.end]: end,
    [LEAVE_FIELD_KEYS.days]: String(sorted.length),
    [LEAVE_FIELD_KEYS.reason]: [reason, listed && `사용일: ${listed}`]
      .filter(Boolean)
      .join('\n'),
  }
}
