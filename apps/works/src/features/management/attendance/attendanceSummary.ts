/**
 * 근태 요약 — 상태 분포 타일과 인력별 합계.
 * 기획: docs_planning/3_7_3_management_attendance.md
 *
 * 세는 기준은 필터와 같다(`countedStatus`) — 타일이 '지각 3건'이라고 말했는데 그 타일을 눌러
 * 좁힌 표가 4줄이면 둘 중 하나는 거짓말이 된다.
 */
import type { StatTile } from '@ynarcher/ui'
import dayjs from 'dayjs'
import {
  PENDING_LABEL,
  PENDING_STATUS,
  countedStatus,
} from '@/features/management/attendance/attendanceFilters'
import {
  statusOf,
  type AttendanceEntry,
  type AttendanceStatus,
} from '@/features/management/attendance/attendanceModel'

/** 상태를 셀 칸 하나. 어느 날짜의 칸인지 함께 온다 — 빈 칸의 판정이 날짜에 달렸다. */
export interface DatedEntry {
  entry: AttendanceEntry
  dateKey: string
}

/**
 * 상태 분포 타일. 근무일만 센다(휴무일의 빈 칸은 셀 것이 없다).
 *
 * 상태 원장이 늘어나면 타일도 함께 늘어난다 — 값을 코드에 박지 않는다. 원장에서 지워졌거나
 * 비활성인 코드가 데이터에 남아 있으면 뒤에 따로 붙인다(세어 놓고 안 보여 주면 합이 맞지 않는다).
 * 미출근은 상태가 아니라 아직 일어나지 않은 일이라 언제나 맨 뒤다.
 *
 * 타일은 곧 그 상태의 필터다. 건수를 세어 놓고 누를 수 없으면 다음에 할 일이 표를 눈으로 훑는
 * 일밖에 남지 않는다.
 */
export function statusTiles(
  items: DatedEntry[],
  statuses: AttendanceStatus[],
  selected: string[],
  onToggle: (code: string) => void,
): StatTile[] {
  const counts = new Map<string, number>()
  for (const { entry, dateKey } of items) {
    if (!entry.isWorkday) continue
    const code = countedStatus(entry, dateKey)
    counts.set(code, (counts.get(code) ?? 0) + 1)
  }

  const tile = (code: string, label: string): StatTile => ({
    key: code,
    label,
    value: `${counts.get(code) ?? 0}건`,
    // 켜진 타일은 지금 표를 좁히고 있는 조건이다 — 강조로 그 사실을 말한다.
    emphasis: selected.includes(code),
    onClick: () => onToggle(code),
  })

  const known = new Set(statuses.map((s) => s.code))
  const ledger = statuses.filter((s) => counts.has(s.code)).map((s) => tile(s.code, s.label))
  const orphan = [...counts.keys()]
    .filter((code) => code !== PENDING_STATUS && !known.has(code))
    .map((code) => tile(code, statusOf(statuses, code)?.label ?? code))

  return counts.has(PENDING_STATUS)
    ? [...ledger, ...orphan, tile(PENDING_STATUS, PENDING_LABEL)]
    : [...ledger, ...orphan]
}

export interface PersonSummary {
  workdays: number
  /** 총 재실 시간(시간, 소수 첫째 자리). 출근·퇴근이 모두 찍힌 날만 더한다. */
  hours: number
}

/**
 * 한 사람의 기간 합계 — 근무일 수와 총 재실 시간.
 *
 * 지각·휴가 건수는 여기서 세지 않는다. 상태별 건수는 요약 타일이 이미 답하고, 타일은 조건에
 * 좁혀진 집합을 세므로 같은 '지각'이 두 자리에서 다른 수로 적힐 수 있다.
 */
export function personSummary(rows: AttendanceEntry[]): PersonSummary {
  let workdays = 0
  let minutes = 0
  for (const row of rows) {
    if (row.isWorkday) workdays += 1
    if (row.checkInAt && row.checkOutAt) {
      minutes += dayjs(row.checkOutAt).diff(dayjs(row.checkInAt), 'minute')
    }
  }
  return { workdays, hours: Math.round((minutes / 60) * 10) / 10 }
}
