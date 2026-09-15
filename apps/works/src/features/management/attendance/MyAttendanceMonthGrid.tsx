import { Card, cn, tableText } from '@ynarcher/ui'
import dayjs from 'dayjs'
import { useMemo, useState } from 'react'
import { useAttendanceMonth } from '@/features/management/attendance/attendanceApi'
import {
  DayCell,
  DayCellHeader,
  GRID_CELL_BOX,
  InlineStat,
  SumLine,
} from '@/features/management/attendance/AttendanceDayCell'
import { AttendancePeriodNav } from '@/features/management/attendance/AttendancePeriodNav'
import type {
  AttendancePolicy,
  AttendanceStatus,
} from '@/features/management/attendance/attendanceModel'
import {
  minutesText,
  myDayStats,
  myPeriodTotals,
  weekStartOf,
  type MyDayStat,
} from '@/features/management/attendance/myAttendanceStats'

/** 요일 머리글 — 한 주는 월요일에 시작한다(`weekStartOf`와 같은 차례). */
const WEEK_HEAD = ['월요일', '화요일', '수요일', '목요일', '금요일', '토요일', '일요일']

/**
 * 한 달을 주 단위로 접는다. 격자가 받는 날은 **달의 첫 주 월요일부터 마지막 주 일요일까지**라
 * 앞뒤로 이웃 달의 날이 몇 개 끼며, 그 날들도 기록을 그대로 그린다 — 달력에서 빈 칸으로 두면
 * 그 주의 합계와 보이는 칸이 어긋난다(월요일이 지난달인 주가 매달 한 번은 생긴다).
 */
function toWeeks(stats: MyDayStat[]): MyDayStat[][] {
  const weeks: MyDayStat[][] = []
  for (let i = 0; i < stats.length; i += 7) weeks.push(stats.slice(i, i + 7))
  return weeks
}

/**
 * 월 근무현황 달력 — 하루를 칸으로, 한 주를 줄로 본다.
 * 기획: docs_planning/3_7_3_management_attendance.md
 *
 * 주간 격자와 **같은 하루 칸**(`DayCell`)을 좁은 모양으로 쓴다. 달력이 자기 칸을 따로 가지면
 * 같은 날이 탭에 따라 다르게 그려진다.
 *
 * 달의 요약(지각·결근 건수와 총근무시간)은 이 달에 **속한 날만** 센다. 격자에 보이는 이웃 달의
 * 날까지 더하면 9월 화면이 8월 말의 지각을 함께 세게 되어, 같은 값이 두 달에 두 번 잡힌다.
 */
export function MyAttendanceMonthGrid({
  userId,
  policy,
  statuses,
}: {
  userId: string | undefined
  policy: AttendancePolicy | null
  statuses: AttendanceStatus[]
}) {
  const today = dayjs().format('YYYY-MM-DD')
  const [month, setMonth] = useState(() => dayjs().startOf('month'))
  const workMinutes = policy?.workMinutes ?? 540

  const gridStart = weekStartOf(month.startOf('month'))
  const gridEnd = weekStartOf(month.endOf('month')).add(6, 'day')
  const monthKey = month.format('YYYY-MM')

  // 창을 넘길 때 이전 달의 값을 든 채로 새 달을 받는다 — 그러지 않으면 화살표를 누를 때마다
  // 달력이 한 번 비고, 그 빈손이 화면에서 깜빡임으로 보인다.
  const { data } = useAttendanceMonth(
    userId,
    gridStart.format('YYYY-MM-DD'),
    gridEnd.format('YYYY-MM-DD'),
    { keepPrevious: true },
  )

  const stats = useMemo(
    () => myDayStats(data ?? [], workMinutes, today),
    [data, workMinutes, today],
  )
  const weeks = useMemo(() => toWeeks(stats), [stats])
  const monthTotals = useMemo(
    () => myPeriodTotals(stats.filter((s) => s.workDate.startsWith(monthKey)), workMinutes),
    [stats, monthKey, workMinutes],
  )

  return (
    <Card
      title="월 근무현황"
      help="달력에는 그 주 전체(월~일)가 서므로 앞뒤 달의 날이 몇 칸 함께 보입니다. 위 요약과 아래 표는 이 달에 속한 날만 셉니다."
    >
      <div className="space-y-4">
        <AttendancePeriodNav
          label={month.format('YYYY년 M월')}
          prevLabel="이전 달"
          nextLabel="다음 달"
          resetLabel="이번 달"
          atCurrent={month.isSame(dayjs(), 'month')}
          onPrev={() => setMonth(month.subtract(1, 'month'))}
          onNext={() => setMonth(month.add(1, 'month'))}
          onReset={() => setMonth(dayjs().startOf('month'))}
        />

        {/* 달의 요약 한 줄 — 달력을 읽기 전에 '이 달이 어땠는가'를 먼저 말한다. */}
        <div className="flex flex-wrap items-baseline gap-x-5 gap-y-1.5 border-y border-gray-200 py-2.5">
          <InlineStat
            label="총근무시간"
            value={`${minutesText(monthTotals.workedMinutes) ?? '0시간'} (계획 ${
              minutesText(monthTotals.baseMinutes) ?? '0시간'
            })`}
          />
          <InlineStat label="지각" value={`${monthTotals.lateCount}`} />
          <InlineStat label="조기퇴근" value={`${monthTotals.earlyLeaveCount}`} />
          <InlineStat label="결근" value={`${monthTotals.absentCount}`} />
          <InlineStat label="퇴근미체크" value={`${monthTotals.missingCheckoutCount}`} />
        </div>

        {/* 여덟 칸(요일 7 + 주간합계)은 좁은 화면에서 접지 않고 가로로 민다 — 한 주를 나란히
            놓고 견주는 것이 목적이라, 세로로 쌓으면 달력이 아니라 목록이 된다. */}
        <div className="overflow-x-auto">
          <div className="min-w-[64rem]">
            <div className="grid grid-cols-8 border-t border-gray-200 bg-gray-25">
              {WEEK_HEAD.map((label) => (
                <p
                  key={label}
                  className={cn(
                    tableText.head,
                    'border-b border-l border-gray-200 px-2.5 py-2 first:border-l-0',
                  )}
                >
                  {label}
                </p>
              ))}
              <p className={cn(tableText.head, 'border-b border-l border-gray-200 px-2.5 py-2')}>
                주간합계
              </p>
            </div>

            {weeks.map((week) => {
              const weekTotals = myPeriodTotals(week, workMinutes)
              return (
                <div key={week[0]?.workDate} className="grid grid-cols-8">
                  {week.map((stat) => {
                    const isToday = stat.workDate === today
                    const outside = !stat.workDate.startsWith(monthKey)
                    return (
                      <div
                        key={stat.workDate}
                        className={cn(
                          GRID_CELL_BOX,
                          'first:border-l-0',
                          isToday && 'bg-brand-25',
                          // 이웃 달의 날은 값을 지우지 않고 **면을 눌러** 이 달이 아님을 말한다.
                          outside && !isToday && 'bg-gray-25/60',
                        )}
                      >
                        <DayCellHeader
                          date={stat.workDate}
                          isWorkday={stat.isWorkday}
                          isToday={isToday}
                          dim={outside}
                          className="mb-1.5"
                        />
                        <DayCell
                          stat={stat}
                          statuses={statuses}
                          policy={policy}
                          today={today}
                          compact
                        />
                      </div>
                    )
                  })}

                  <div className={cn(GRID_CELL_BOX, 'bg-gray-25')}>
                    <div className="space-y-1">
                      <SumLine label="계획" value={minutesText(weekTotals.baseMinutes)} />
                      <SumLine label="휴가" value={minutesText(weekTotals.leaveMinutes)} />
                      <SumLine label="실근무" value={minutesText(weekTotals.workedMinutes)} />
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </Card>
  )
}
