import { Card, cardText, cn, tableText } from '@ynarcher/ui'
import dayjs from 'dayjs'
import { useState, type ReactNode } from 'react'
import { useAttendanceMonth } from '@/features/management/attendance/attendanceApi'
import {
  CELL_BOX,
  DayCell,
  DayCellHeader,
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
} from '@/features/management/attendance/myAttendanceStats'

/** 주 상한(분) — 법정 최대 근로시간 52시간. 진행 막대의 축이 이 값이다. */
const WEEK_CAP_MINUTES = 52 * 60
/** 막대 아래 눈금. 축이 무엇인지 숫자로 말한다. */
const WEEK_TICKS = [0, 8, 16, 24, 32, 40, 52]

/**
 * 주간 누적근무시간 막대 — 0시간부터 주 상한(52시간)까지의 축 위에 이번 주 실근무를 얹는다.
 *
 * 비율만 칠하지 않고 눈금을 함께 세우는 이유는, 이 막대가 '얼마나 채웠나'가 아니라 '상한까지
 * 얼마나 남았나'를 묻는 자리이기 때문이다. 축의 끝이 52라는 것을 모르면 반쯤 찬 막대가
 * 무엇의 절반인지 알 수 없다.
 */
function WeekCapBar({ minutes }: { minutes: number }) {
  const ratio = Math.min(1, minutes / WEEK_CAP_MINUTES)
  return (
    <div className="space-y-1.5">
      <p className={cn(cardText.label, 'text-right')}>주간 누적근무시간</p>
      <div className="h-2 w-full overflow-hidden rounded-full bg-gray-100">
        <div
          className="h-full rounded-full bg-brand-600 transition-[width] duration-normal"
          style={{ width: `${ratio * 100}%` }}
        />
      </div>
      <div className="flex justify-between">
        {WEEK_TICKS.map((t) => (
          <span key={t} className="text-caption tabular-nums text-gray-500">
            {t}
          </span>
        ))}
      </div>
    </div>
  )
}

/**
 * 주간 근무현황 — 한 주를 요일로 잘라 보는 자리.
 * 기획: docs_planning/3_7_3_management_attendance.md
 *
 * 요일이 **열**이라 `DataTable`을 쓰지 않는다. 그 표는 한 줄이 한 레코드인 목록의 규격이고,
 * 여기는 레코드 일곱이 가로로 서는 달력꼴 격자다. 대신 글자 위계는 표의 것(`tableText`)을
 * 그대로 빌려 카드 안 다른 표들과 같은 크기·같은 색으로 읽히게 한다.
 */
export function MyAttendanceWeek({
  userId,
  policy,
  statuses,
  actions,
}: {
  userId: string | undefined
  policy: AttendancePolicy | null
  statuses: AttendanceStatus[]
  /**
   * 카드 머리 오른쪽에 서는 조작 — 연장·휴일 근무 신청이 이 자리를 받는다.
   *
   * 신청 버튼을 이 카드에 두는 이유는, 연장·휴일 근무를 올리는 사람이 먼저 보는 것이 '이번 주에
   * 내가 얼마나 일했나'이기 때문이다. 요약 카드 셋에 네 번째 카드로 세우면 올해를 말하는 줄에
   * 이번 주의 일이 끼어든다.
   */
  actions?: ReactNode
}) {
  const today = dayjs().format('YYYY-MM-DD')
  const [start, setStart] = useState(() => weekStartOf(dayjs()))
  const from = start.format('YYYY-MM-DD')
  const end = start.add(6, 'day')
  const workMinutes = policy?.workMinutes ?? 540

  const { data } = useAttendanceMonth(userId, from, end.format('YYYY-MM-DD'))
  const stats = myDayStats(data ?? [], workMinutes, today)
  const totals = myPeriodTotals(stats, workMinutes)
  const isThisWeek = from === weekStartOf(dayjs()).format('YYYY-MM-DD')

  return (
    <Card title="주간 근무현황" actions={actions}>
      <div className="space-y-4">
        <AttendancePeriodNav
          label={`${start.format('YYYY년 MM월 DD일')} ~ ${end.format('DD일')}`}
          prevLabel="이전 주"
          nextLabel="다음 주"
          resetLabel="이번 주"
          atCurrent={isThisWeek}
          onPrev={() => setStart(start.subtract(7, 'day'))}
          onNext={() => setStart(start.add(7, 'day'))}
          onReset={() => setStart(weekStartOf(dayjs()))}
        />

        <WeekCapBar minutes={totals.workedMinutes} />

        {/* 여덟 칸(요일 7 + 합계)은 좁은 화면에서 접지 않고 가로로 민다 — 한 주는 나란히 놓고
            견주는 것이 목적이라, 세로로 쌓으면 표가 아니라 목록이 된다. */}
        <div className="overflow-x-auto">
          <div className="grid min-w-[64rem] grid-cols-8 border-t border-gray-200">
            {stats.map((stat) => {
              const isToday = stat.workDate === today
              return (
                <div
                  key={stat.workDate}
                  className={cn(
                    CELL_BOX,
                    'first:border-l-0',
                    isToday && 'bg-brand-25',
                  )}
                >
                  <DayCellHeader
                    date={stat.workDate}
                    isWorkday={stat.isWorkday}
                    isToday={isToday}
                    className="mb-2"
                  />
                  <DayCell stat={stat} statuses={statuses} policy={policy} today={today} />
                </div>
              )
            })}

            {/* 합계 칸 — 일곱 칸과 같은 격자에 서지만 회색 면으로 '더한 값'임을 말한다. */}
            <div className={cn(CELL_BOX, 'bg-gray-25')}>
              <p className={cn('mb-2', tableText.head)}>주간 합계</p>
              <div className="space-y-1.5">
                <SumLine label="계획" value={minutesText(totals.baseMinutes)} />
                <SumLine label="휴가" value={minutesText(totals.leaveMinutes)} />
                <div className="border-t border-gray-200 pt-1.5">
                  <p className={cn(tableText.primary, 'mb-1')}>실근무</p>
                  <SumLine label="총" value={minutesText(totals.workedMinutes)} />
                  <SumLine label="소정" value={minutesText(totals.regularMinutes)} />
                  <SumLine label="연장" value={minutesText(totals.overtimeMinutes)} />
                  <SumLine label="야간" value={minutesText(totals.nightMinutes)} />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Card>
  )
}
