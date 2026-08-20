/**
 * 근태 요약 — 상태 분포 타일과 인력별 합계.
 * 기획: docs_planning/3_7_3_management_attendance.md
 *
 * 세는 기준은 필터와 같다(`countedStatus`) — 타일이 '지각 3건'이라고 말했는데 그 타일을 눌러
 * 좁힌 표가 4줄이면 둘 중 하나는 거짓말이 된다.
 */
import type { StripTile } from '@ynarcher/ui'
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
 * 전체 타일의 키. 상태 코드와 같은 자리에 서지만 상태가 아니므로, 원장에 우연히 같은 코드가
 * 생겨도 부딪히지 않게 코드로 쓸 수 없는 글자를 쓴다.
 */
export const TOTAL_KEY = '__TOTAL__'

export interface StatusTilesInput {
  items: DatedEntry[]
  statuses: AttendanceStatus[]
  /** 지금 걸린 상태 조건. 켜진 타일을 강조하는 데 쓴다. */
  selected: string[]
  onToggle: (code: string) => void
  /** 전체 타일에서 상태 조건을 모두 푼다. */
  onClear: () => void
  /** 전체 타일이 세는 것의 단위 — 날짜별은 사람('명'), 인력별은 날('일')을 센다. */
  totalUnit: string
}

/**
 * 상태 분포 타일 — 맨 앞에 전체, 그 뒤로 근태 상태 원장 전체를 세운다.
 * 상태별 건수는 근무일만 센다(휴무일의 빈 칸은 셀 것이 없다).
 *
 * **전체는 근무일 여부를 가리지 않는다.** 그래야 "오늘은 근무일이 아니다"가 화면에서 읽힌다 —
 * 전체 12명인데 상태가 전부 0이면 그날은 아무도 근무일이 아닌 날이다. 전체까지 근무일로 좁히면
 * 그 사실이 0 = 0으로 뭉개져 사라진다. 평일에는 두 수가 같아 합이 맞는다.
 *
 * **활성 상태는 0건이어도 자리를 지킨다.** 건수가 있는 것만 세우면 타일이 날마다 나타났다
 * 사라져 어제와 오늘을 같은 눈으로 비교할 수 없고, 무엇보다 "오늘 지각 0"이라는 사실 자체가
 * 화면에서 지워진다 — 0은 값이 없는 것이 아니라 값이 0인 것이다.
 *
 * 상태 원장이 늘거나 줄면 타일도 함께 움직인다(값을 코드에 박지 않는다). 비활성으로 내린
 * 상태와 원장에 없는 코드는 그 코드로 남은 기록이 있을 때만 뒤에 붙인다 — 세어 놓고 안 보여
 * 주면 타일의 합과 표의 줄 수가 어긋난다. 미출근은 상태가 아니라 아직 일어나지 않은 일이라
 * 언제나 맨 뒤다.
 *
 * 타일은 곧 그 상태의 필터다. 건수를 세어 놓고 누를 수 없으면 다음에 할 일이 표를 눈으로 훑는
 * 일밖에 남지 않는다.
 */
export function statusTiles({
  items,
  statuses,
  selected,
  onToggle,
  onClear,
  totalUnit,
}: StatusTilesInput): StripTile[] {
  const counts = new Map<string, number>()
  for (const { entry, dateKey } of items) {
    if (!entry.isWorkday) continue
    const code = countedStatus(entry, dateKey)
    counts.set(code, (counts.get(code) ?? 0) + 1)
  }

  const tile = (code: string, label: string): StripTile => ({
    key: code,
    label,
    // 단위는 값에 이어 붙이지 않는다 — 크게 읽혀야 하는 것은 건수이고 '건'은 모든 칸에
    // 똑같이 반복되는 글자다. 회색·한 단 작은 규격은 StatStrip이 소유한다.
    value: `${counts.get(code) ?? 0}`,
    unit: '건',
    // 켜진 칸은 지금 표를 좁히고 있는 조건이다 — 옅은 브랜드 면으로 그 사실을 말한다.
    selected: selected.includes(code),
    onClick: () => onToggle(code),
  })

  /**
   * 전체 — 다른 타일이 상태로 좁히는 문이라면 이것은 그 조건을 푸는 문이다. 총계라고 못 누르게
   * 두면 상태 하나를 눌러 좁힌 뒤 되돌아올 자리가 필터 팝오버 안으로 숨는다.
   */
  const total: StripTile = {
    key: TOTAL_KEY,
    label: '전체',
    value: `${items.length}`,
    unit: totalUnit,
    selected: selected.length === 0,
    onClick: onClear,
  }

  const known = new Set(statuses.map((s) => s.code))
  // 원장 순서(sort_order)를 그대로 따른다 — 관리자가 근태 설정에서 정한 차례가 곧 타일의 차례다.
  const active = statuses.filter((s) => s.isActive).map((s) => tile(s.code, s.label))
  const retired = statuses
    .filter((s) => !s.isActive && counts.has(s.code))
    .map((s) => tile(s.code, s.label))
  const orphan = [...counts.keys()]
    .filter((code) => code !== PENDING_STATUS && !known.has(code))
    .map((code) => tile(code, statusOf(statuses, code)?.label ?? code))

  return [total, ...active, ...retired, ...orphan, tile(PENDING_STATUS, PENDING_LABEL)]
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
