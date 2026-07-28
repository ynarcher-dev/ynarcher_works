/**
 * 회의실 예약 슬롯 계산(순수 함수 — React·supabase 비의존).
 * 회의실 운영 스케줄(오픈/마감/슬롯단위/요일)과 그날의 유효 예약 목록으로부터
 * 예약 가능 슬롯 배열과 요일 라벨을 도출한다. RoomCard 가용성 바·예약 폼이 공유한다.
 */

/** 회의실 운영 스케줄. 시각은 'HH:mm'(초 없는 24시간). */
export interface RoomSchedule {
  openTime: string
  closeTime: string
  slotMinutes: number
  /** 예약 가능 요일(0=일 .. 6=토). */
  weekdays: number[]
}

/** 예약된 시간대 한 건(그날 기준, 취소 제외). */
export interface ReservationSpan {
  start: string
  end: string
}

/** 슬롯 한 칸. */
export interface Slot {
  start: string
  end: string
  reserved: boolean
}

const WEEKDAY_LABELS = ['일요일', '월요일', '화요일', '수요일', '목요일', '금요일', '토요일']

/** 'HH:mm' 또는 'HH:mm:ss' → 자정 기준 분. */
export function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':')
  return Number(h) * 60 + Number(m)
}

/** 분 → 'HH:mm'. */
export function toHHmm(min: number): string {
  const h = Math.floor(min / 60)
  const m = min % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

/** DB의 time 값('HH:mm:ss')을 'HH:mm'으로 정규화. */
export function normalizeTime(t: string): string {
  return t.slice(0, 5)
}

/** 해당 날짜가 회의실 예약 가능 요일인지. */
export function isOpenOn(schedule: RoomSchedule, date: Date): boolean {
  return schedule.weekdays.includes(date.getDay())
}

/** 요일 라벨(예: '수요일'). */
export function weekdayLabel(date: Date): string {
  return WEEKDAY_LABELS[date.getDay()] ?? ''
}

/**
 * 카드에 표기하는 그날 일정 라벨.
 * 예약 가능 요일이면 '수요일 일정 (09:00 - 18:00)', 아니면 '휴무일'.
 */
export function scheduleLabel(schedule: RoomSchedule, date: Date): string {
  if (!isOpenOn(schedule, date)) return `${weekdayLabel(date)} 휴무`
  return `${weekdayLabel(date)} 일정 (${normalizeTime(schedule.openTime)} - ${normalizeTime(schedule.closeTime)})`
}

/** 두 시간대가 겹치는가(반열림 [start, end) 기준 — 경계 접촉은 겹침 아님). */
function overlaps(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return aStart < bEnd && bStart < aEnd
}

/**
 * 운영시간을 슬롯 단위로 쪼개 예약 여부를 표시한다.
 * 마지막 자투리(슬롯 단위 미만)는 버린다. 요일 휴무면 빈 배열.
 */
export function buildSlots(schedule: RoomSchedule, reservations: ReservationSpan[], date?: Date): Slot[] {
  if (date && !isOpenOn(schedule, date)) return []
  const open = toMinutes(schedule.openTime)
  const close = toMinutes(schedule.closeTime)
  const step = schedule.slotMinutes
  const spans = reservations.map((r) => [toMinutes(r.start), toMinutes(r.end)] as const)
  const slots: Slot[] = []
  for (let t = open; t + step <= close; t += step) {
    const reserved = spans.some(([s, e]) => overlaps(t, t + step, s, e))
    slots.push({ start: toHHmm(t), end: toHHmm(t + step), reserved })
  }
  return slots
}

/** 예약 폼의 시작 시각 후보(운영시간 내 슬롯 시작, 마지막 마감은 제외). */
export function slotStarts(schedule: RoomSchedule): string[] {
  const open = toMinutes(schedule.openTime)
  const close = toMinutes(schedule.closeTime)
  const step = schedule.slotMinutes
  const out: string[] = []
  for (let t = open; t + step <= close; t += step) out.push(toHHmm(t))
  return out
}

/** 선택한 시작 시각 이후의 종료 시각 후보(슬롯 경계, 마감까지). */
export function slotEndsAfter(schedule: RoomSchedule, start: string): string[] {
  const from = toMinutes(start)
  const close = toMinutes(schedule.closeTime)
  const step = schedule.slotMinutes
  const out: string[] = []
  for (let t = from + step; t <= close; t += step) out.push(toHHmm(t))
  return out
}

/** 시작~종료 구간이 기존 예약과 겹치는지(폼 제출 전 클라이언트 사전검증). */
export function conflictsWith(reservations: ReservationSpan[], start: string, end: string): boolean {
  const s = toMinutes(start)
  const e = toMinutes(end)
  return reservations.some((r) => overlaps(s, e, toMinutes(r.start), toMinutes(r.end)))
}
