/**
 * 연장·휴일 근무 신청서의 정체와 값 채우기 — 휴가신청서와 **같은 규약**을 따른다.
 * 기획: docs_planning/3_7_3_management_attendance.md
 *
 * 세 신청(휴가·연장근무·휴일근무)은 모두 마이오피스 `근태현황`에서 시작하고, 만들어지는 것은
 * 지금까지와 같은 전자결재 문서다 — 결재선을 타고 승인이 나야 근무·휴가가 인정된다는 규칙은
 * 그대로이며, 달라지는 것은 입력 화면뿐이다. 그래서 세 양식 모두 기안 화면의 양식 목록에서는
 * 빠진다(`isAttendanceRequestForm`) — 같은 신청을 두 화면에서 받으면 어느 쪽이 정본인지 사람이
 * 판단하게 된다.
 *
 * 양식을 이름이 아니라 **약칭**으로 찾는 이유는 이름이 관리자가 고칠 수 있는 값이기 때문이다.
 * 약칭은 문서번호 채번에 쓰여 이미 쌓인 문서가 붙잡고 있다.
 */
import type { ApprovalForm } from '@/features/approval/approvalApi'
import type { FieldValues } from '@/features/approval/fields'
import { LEAVE_FORM_ABBREV } from '@/features/approval/leaveForm'

/** 근무 신청의 두 종류. 주소(`?request=`)와 양식 약칭이 이 값으로 이어진다. */
export type WorkRequestKind = 'OVERTIME' | 'HOLIDAY'

export interface WorkRequestMeta {
  kind: WorkRequestKind
  /** `approval_forms.abbrev` — 양식을 찾는 키. */
  abbrev: string
  /** 화면 제목·버튼에 적는 말. */
  label: string
  /** 양식이 없을 때 안내에 적는 정식 이름. */
  formName: string
  /** 시각 두 칸의 라벨(연장은 '연장 시작/종료', 휴일은 '출근/퇴근'). */
  startLabel: string
  endLabel: string
  /** 휴게시간 칸을 두는가 — 휴일 근무만 하루를 통째로 일하므로 휴게가 있다. */
  hasBreak: boolean
}

export const WORK_REQUEST_META: Record<WorkRequestKind, WorkRequestMeta> = {
  OVERTIME: {
    kind: 'OVERTIME',
    abbrev: '연장',
    label: '연장근무 신청',
    formName: '연장근무신청서',
    startLabel: '연장 시작',
    endLabel: '연장 종료',
    hasBreak: false,
  },
  HOLIDAY: {
    kind: 'HOLIDAY',
    abbrev: '휴일',
    label: '휴일근무 신청',
    formName: '휴일근무신청서',
    startLabel: '출근',
    endLabel: '퇴근',
    hasBreak: true,
  },
}

/** 주소의 `request` 값 → 근무 신청 종류. 모르는 값이면 `null`이다. */
export function workRequestKindOf(value: string | null | undefined): WorkRequestKind | null {
  if (value === 'overtime') return 'OVERTIME'
  if (value === 'holiday') return 'HOLIDAY'
  return null
}

/** 근무 신청 종류 → 주소의 `request` 값. */
export function workRequestParam(kind: WorkRequestKind): string {
  return kind === 'OVERTIME' ? 'overtime' : 'holiday'
}

/** 두 양식이 쓰는 필드 키 — 시드가 정한 이름 그대로다. */
export const WORK_REQUEST_FIELD_KEYS = {
  date: 'work_date',
  start: 'start_time',
  end: 'end_time',
  breakMinutes: 'break_minutes',
  minutes: 'minutes',
  reason: 'reason',
} as const

/** 근태 신청 3종(휴가·연장·휴일)의 약칭. 기안 화면 양식 목록에서 빼는 기준이다. */
export const ATTENDANCE_REQUEST_ABBREVS: string[] = [
  LEAVE_FORM_ABBREV,
  WORK_REQUEST_META.OVERTIME.abbrev,
  WORK_REQUEST_META.HOLIDAY.abbrev,
]

/** 근태현황 전용 화면이 받는 양식인가(휴가·연장근무·휴일근무). */
export function isAttendanceRequestForm(form: { abbrev: string } | null | undefined): boolean {
  return Boolean(form && ATTENDANCE_REQUEST_ABBREVS.includes(form.abbrev))
}

/**
 * 쓸 수 있는 양식 한 건. 비활성 양식은 고르지 않는다 —
 * 관리자가 내린 양식으로 새 신청을 받으면 문서함에만 남는다.
 */
export function findWorkRequestForm(
  forms: ApprovalForm[],
  kind: WorkRequestKind,
): ApprovalForm | null {
  const abbrev = WORK_REQUEST_META[kind].abbrev
  return forms.find((f) => f.abbrev === abbrev && f.is_active) ?? null
}

/** 'HH:mm' → 분. 형식이 어긋나면 `null`. */
function toMinutes(value: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(value.trim())
  if (!m) return null
  const h = Number(m[1])
  const min = Number(m[2])
  if (h > 23 || min > 59) return null
  return h * 60 + min
}

/**
 * 근무 시간(분) — 끝 시각이 시작보다 이르면 **자정을 넘긴 것으로 읽는다.**
 *
 * 연장근무는 22:00에 시작해 01:00에 끝나는 일이 실제로 있다. 그때 음수를 내거나 0으로 눕히면
 * 세 시간을 일한 신청이 '시간 없음'으로 올라간다.
 *
 * **두 시각이 같으면 값이 없다.** 자정 넘김으로 읽으면 24시간짜리 신청이 되는데, 18:00~18:00을
 * 적은 사람이 뜻한 것은 하루를 꼬박 일하겠다는 말이 아니라 아직 덜 적었다는 말이다.
 *
 * 휴게시간은 잰 시간에서 뺀다. 빼고 나서 0보다 작아지면 값이 없다(신청이 성립하지 않는다).
 */
export function workRequestMinutes(
  start: string,
  end: string,
  breakMinutes = 0,
): number | null {
  const from = toMinutes(start)
  const to = toMinutes(end)
  if (from === null || to === null) return null
  if (to === from) return null
  const span = to > from ? to - from : to + 24 * 60 - from
  const net = span - Math.max(0, breakMinutes)
  return net > 0 ? net : null
}

/**
 * 문서 제목 — 사람이 적지 않는다.
 *
 * 근무 신청의 제목에 적을 것은 무엇을·언제·몇 시부터 몇 시까지뿐이라, 손에 맡기면 같은 신청이
 * 사람마다 다른 이름으로 문서함에 선다(휴가신청서와 같은 판단이다).
 */
export function workRequestTitle(input: {
  kind: WorkRequestKind
  date: string
  start: string
  end: string
}): string {
  const head = WORK_REQUEST_META[input.kind].label
  if (!input.date) return head
  const span = input.start && input.end ? ` ${input.start}~${input.end}` : ''
  return `${head} ${input.date}${span}`
}

/**
 * 고른 것들 → 결재 문서의 필드 값.
 *
 * **양식에 없는 키는 여기서 걸러지지 않는다** — 저장 직전 `pruneValues(fields, values)`가 양식이
 * 가진 키만 남긴다(연장근무 양식에는 휴게시간 칸이 없다). 이 함수는 "무엇을 무엇으로 적을지"만
 * 답한다.
 *
 * 시간(분)을 값으로 함께 적는 이유는, 결재자가 보는 자리와 나중에 집계가 읽는 자리가 같아야
 * 하기 때문이다. 시각 두 칸만 적어 두면 '몇 시간을 신청했는가'를 읽는 쪽마다 다시 계산하게 된다.
 */
export function workRequestFieldValues(input: {
  kind: WorkRequestKind
  date: string
  start: string
  end: string
  breakMinutes: number
  reason: string
}): FieldValues {
  const meta = WORK_REQUEST_META[input.kind]
  const breakMinutes = meta.hasBreak ? Math.max(0, input.breakMinutes) : 0
  const minutes = workRequestMinutes(input.start, input.end, breakMinutes)
  return {
    [WORK_REQUEST_FIELD_KEYS.date]: input.date,
    [WORK_REQUEST_FIELD_KEYS.start]: input.start,
    [WORK_REQUEST_FIELD_KEYS.end]: input.end,
    [WORK_REQUEST_FIELD_KEYS.breakMinutes]: String(breakMinutes),
    [WORK_REQUEST_FIELD_KEYS.minutes]: minutes === null ? '' : String(minutes),
    [WORK_REQUEST_FIELD_KEYS.reason]: input.reason.trim(),
  }
}
