import { cardText, cn, tableText } from '@ynarcher/ui'
import dayjs from 'dayjs'
import {
  statusOf,
  type AttendancePolicy,
  type AttendanceStatus,
} from '@/features/management/attendance/attendanceModel'
import { EMPTY_TEXT, minutesText, type MyDayStat } from '@/features/management/attendance/myAttendanceStats'

/**
 * 내 근태 격자의 하루 칸 — 주간 격자(7칸)와 월 달력(7×N)이 **같은 칸**을 쓴다.
 * 기획: docs_planning/3_7_3_management_attendance.md
 *
 * 두 화면이 각자의 칸을 가지면 같은 하루가 자리에 따라 다른 모양으로 그려진다 — 주간에서는
 * 결근이 붉은 글씨인데 월간에서는 회색이 되는 식이다. 칸의 규격(높이·여백·읽는 차례)을 한
 * 곳에 두고, 달력이 정하는 것은 몇 개를 어떤 격자에 세우는가뿐이다.
 */

/**
 * 하루 칸의 규격 — **높이는 기록이 정하지 않는다.**
 *
 * 내용에 맡기면 아무도 찍지 않은 주는 한 줄짜리 납작한 띠가 되고, 닷새를 꽉 채운 주는 그 세
 * 배로 부푼다. 기간을 앞뒤로 넘길 때마다 격자가 커졌다 작아지면 두 기간을 견줄 때 눈이 먼저
 * 읽는 것이 값이 아니라 상자 크기가 된다.
 */
export const CELL_BOX = 'min-h-[12rem] border-b border-l border-gray-200 px-3 py-2.5'

/**
 * 달력 격자의 하루 칸 — 주간보다 낮다.
 *
 * 한 달은 다섯 주가 세로로 쌓이므로 주간과 같은 높이를 쓰면 한 화면에 두 주도 들어오지 않는다.
 * 대신 칸이 답하는 것을 줄인다(출근·퇴근·근무시간 셋) — 소정·연장의 분해는 같은 탭의 월간
 * 요약표가 이미 답한다.
 */
export const GRID_CELL_BOX = 'min-h-[7.5rem] border-b border-l border-gray-200 px-2.5 py-2'

/** 요약 한 줄(라벨 + 값). 합계 칸 안에서만 쓰는 좁은 규격이다. */
export function SumLine({ label, value }: { label: string; value: string | null }) {
  return (
    <p className="flex items-baseline justify-between gap-2">
      <span className={tableText.meta}>{label}</span>
      <span className={cn(tableText.body, 'tabular-nums')}>{value ?? EMPTY_TEXT}</span>
    </p>
  )
}

/** 찍힌 시각 한 묶음(라벨 위·값 아래). 값은 이 칸에서 가장 먼저 읽혀야 하므로 굵게 세운다. */
function StampLine({
  label,
  value,
  first,
}: {
  label: string
  value: string | null
  first?: boolean
}) {
  return (
    <div className={first ? 'pb-2' : 'py-2'}>
      <p className={tableText.meta}>{label}</p>
      <p className={cn(tableText.primary, 'font-semibold tabular-nums')}>{value ?? EMPTY_TEXT}</p>
    </div>
  )
}

/** 기록이 없는 날에 적을 말 — 무슨 날인지를 답한다(빈 칸으로 두지 않는다). */
function emptyDayText(
  stat: MyDayStat,
  status: AttendanceStatus | null,
  policy: AttendancePolicy | null,
  today: string,
): { text: string; className: string } {
  if (!stat.isWorkday) return { text: '휴무일', className: 'text-gray-400' }
  // 지난 근무일인데 기록이 없으면 결근이고, 아직 오지 않은 날은 적용될 근무제를 적는다.
  if (stat.workDate < today) return { text: status?.label ?? '결근', className: 'text-danger' }
  return {
    text: policy?.ignoreSchedule ? '자율출퇴근제' : '근무 예정',
    className: 'text-gray-500',
  }
}

/**
 * 하루 칸의 내용.
 *
 * 기록이 있으면 찍힌 시각과 잰 시간을 적고, 없으면 **그날이 무슨 날인지**를 적는다. 빈 칸으로
 * 두면 '아직 오지 않은 날'과 '오늘 안 나온 날'이 같은 모양이 된다.
 *
 * `compact`는 달력 격자가 쓰는 좁은 모양이다. 적는 사실의 **차례와 말은 그대로**이고, 출근·퇴근을
 * 한 줄에 붙이고 소정·연장 분해를 접는다 — 좁은 칸에서 같은 다섯 줄을 우겨넣으면 글자가 줄바꿈으로
 * 흩어져 오히려 읽히지 않는다.
 */
export function DayCell({
  stat,
  statuses,
  policy,
  today,
  compact,
}: {
  stat: MyDayStat
  statuses: AttendanceStatus[]
  policy: AttendancePolicy | null
  today: string
  compact?: boolean
}) {
  const status = statusOf(statuses, stat.statusCode)
  // 하루를 규정하는 상태(연차·반차 등)는 출퇴근 기록보다 먼저 읽혀야 한다.
  if (status && status.kind === 'LEAVE') {
    return <p className={tableText.primary}>{status.label}</p>
  }
  if (!stat.checkInAt) {
    const empty = emptyDayText(stat, status, policy, today)
    return <p className={cn(compact ? tableText.meta : tableText.body, empty.className)}>{empty.text}</p>
  }

  const checkIn = dayjs(stat.checkInAt).format('HH:mm')
  const checkOut = stat.checkOutAt ? dayjs(stat.checkOutAt).format('HH:mm') : null

  if (compact) {
    return (
      <div className="space-y-0.5">
        <p className={cn(tableText.meta, 'tabular-nums')}>출근 {checkIn}</p>
        {/* 퇴근이 없는 날은 빈칸이 아니라 '미체크'라고 적는다 — 아직 안 찍은 것과 안 나온 것은 다르다. */}
        <p className={cn(tableText.meta, 'tabular-nums')}>
          퇴근 {checkOut ?? <span className="text-danger">미체크</span>}
        </p>
        <p className={cn(tableText.body, 'pt-0.5 font-semibold tabular-nums')}>
          {minutesText(stat.workedMinutes) ?? EMPTY_TEXT}
        </p>
      </div>
    )
  }

  return (
    /*
      출근·퇴근·총은 **서로 다른 세 가지 사실**이다(언제 왔나 / 언제 갔나 / 얼마나 있었나).
      간격만으로 나누면 다섯 줄이 한 덩어리로 흐르고, 특히 값이 비어 있는 날은 라벨과 값의
      짝이 어긋나 읽힌다. 선으로 끊으면 칸 안에서 세 묶음이 곧바로 갈린다.

      소정·연장은 넷째 묶음이 아니라 **'총'을 가른 결과**라 같은 칸 안에 선 없이 잇는다.
    */
    <div className="divide-y divide-gray-200">
      <StampLine label="출근" value={checkIn} first />
      <StampLine label="퇴근" value={checkOut} />
      <div className="pt-2">
        <p className={tableText.meta}>총</p>
        <p className={cn(tableText.primary, 'font-semibold tabular-nums')}>
          {minutesText(stat.workedMinutes) ?? EMPTY_TEXT}
        </p>
        <p className={cn(tableText.meta, 'mt-1.5 tabular-nums')}>
          소정 {minutesText(stat.regularMinutes)}
        </p>
        <p className={cn(tableText.meta, 'tabular-nums')}>
          연장 {minutesText(stat.overtimeMinutes)}
        </p>
      </div>
    </div>
  )
}

/** 칸 머리의 날짜 줄(`15 (화)`). 주간·월간이 같은 규격으로 쓴다. */
export function DayCellHeader({
  date,
  isWorkday,
  isToday,
  dim,
  className,
}: {
  date: string
  isWorkday: boolean
  isToday: boolean
  /** 이 달에 속하지 않는 날(달력 격자의 앞뒤 채움). */
  dim?: boolean
  className?: string
}) {
  const d = dayjs(date)
  return (
    <p
      className={cn(
        'tabular-nums',
        tableText.head,
        (!isWorkday || dim) && 'text-gray-400',
        isToday && 'text-brand-700',
        className,
      )}
    >
      {d.format('DD')} ({WEEKDAY_LABELS[d.day()]})
    </p>
  )
}

/** 요일 이름. 달력 머리글과 칸 머리가 같은 목록을 쓴다. */
const WEEKDAY_LABELS = ['일', '월', '화', '수', '목', '금', '토'] as const

/** 지표 한 줄(라벨 + 값)을 가로로 세우는 줄 — 달 머리의 요약 띠가 쓴다. */
export function InlineStat({ label, value }: { label: string; value: string }) {
  return (
    <span className="inline-flex items-baseline gap-1.5">
      <span className={cardText.label}>{label}</span>
      <span className={cn(cardText.value, 'tabular-nums')}>{value}</span>
    </span>
  )
}
