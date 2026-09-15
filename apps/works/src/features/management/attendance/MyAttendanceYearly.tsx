import { Card, Spinner, cn, tableText } from '@ynarcher/ui'
import dayjs from 'dayjs'
import { useMemo, useState } from 'react'
import { useAttendanceMonth } from '@/features/management/attendance/attendanceApi'
import { AttendancePeriodNav } from '@/features/management/attendance/AttendancePeriodNav'
import type { AttendancePolicy } from '@/features/management/attendance/attendanceModel'
import {
  EMPTY_TEXT,
  correctedAverageMinutes,
  minutesText,
  myDayStats,
  myPeriodTotals,
  type MyPeriodTotals,
} from '@/features/management/attendance/myAttendanceStats'

/** 값 한 칸이 무엇으로 적히는가. 시간은 `시:분`, 건수·일수는 숫자다. */
type Unit = 'MINUTES' | 'COUNT' | 'DAYS'

interface StatRow {
  key: string
  label: string
  unit: Unit
  /** 그 기간 합계에서 값을 꺼낸다. `null`이면 아직 답하지 못하는 칸이다. */
  pick: (t: MyPeriodTotals) => number | null
}

interface RowGroup {
  key: string
  label: string
  rows: StatRow[]
}

/**
 * 연간 통계가 세는 것 — **집계 정의는 여기 한 곳에만 둔다.**
 *
 * 같은 '실근무'가 요약 카드·월 표·이 표에서 각각 계산되면 한 화면 안에서 값이 갈린다. 세 화면이
 * 모두 `myPeriodTotals`를 기간만 바꿔 부르고, 이 목록은 그 결과에서 무엇을 꺼내 어떤 이름으로
 * 적을지만 정한다.
 */
const GROUPS: RowGroup[] = [
  {
    key: 'attendance',
    label: '근태',
    rows: [
      { key: 'late', label: '지각', unit: 'COUNT', pick: (t) => t.lateCount },
      { key: 'early', label: '조기퇴근', unit: 'COUNT', pick: (t) => t.earlyLeaveCount },
      { key: 'missing', label: '퇴근미체크', unit: 'COUNT', pick: (t) => t.missingCheckoutCount },
      { key: 'absent', label: '결근', unit: 'COUNT', pick: (t) => t.absentCount },
    ],
  },
  {
    /*
      휴가 두 줄은 **연차 원장이 서기 전이라 값이 없다.** 0으로 적지 않는 이유는 '휴가를 쓰지
      않았다'는 말과 '모른다'는 말이 다르기 때문이다. 줄 자체를 빼지 않는 것은, 이 표가 답해야
      할 축이 무엇인지를 화면이 계속 말하고 있어야 원장이 붙을 자리가 분명해서다.
    */
    key: 'leave',
    label: '휴가',
    rows: [
      { key: 'granted', label: '생성된 휴가 사용', unit: 'DAYS', pick: () => null },
      { key: 'other', label: '기타 휴가 사용', unit: 'DAYS', pick: () => null },
    ],
  },
  {
    key: 'worktime',
    label: '근무시간',
    rows: [
      { key: 'base', label: '기준근무', unit: 'MINUTES', pick: (t) => t.baseMinutes },
      // 계획 원장이 없어 기준근무와 같은 값이다(월간 표와 같은 판단).
      { key: 'plan', label: '근무계획', unit: 'MINUTES', pick: (t) => t.baseMinutes },
      { key: 'actual', label: '실근무', unit: 'MINUTES', pick: (t) => t.workedMinutes },
      { key: 'days', label: '출근일수', unit: 'DAYS', pick: (t) => t.attendedDays },
      {
        key: 'avg',
        label: '일평균근무',
        unit: 'MINUTES',
        // 분모가 근무일 수다 — 쉰 날까지 넣고 나눈 값이라 '하루에 얼마나 일했나'와는 다르다.
        pick: (t) => (t.workdays === 0 ? null : Math.round(t.workedMinutes / t.workdays)),
      },
      { key: 'corrected', label: '보정평균근무', unit: 'MINUTES', pick: correctedAverageMinutes },
    ],
  },
]

/** 값 → 글자. 적을 값이 없으면 공란이다(0이 아니다). */
function cellText(value: number | null, unit: Unit): string {
  if (value === null) return EMPTY_TEXT
  if (unit === 'MINUTES') return minutesText(value) ?? EMPTY_TEXT
  return unit === 'DAYS' ? `${value}일` : `${value}`
}

const CELL = 'border-b border-l border-gray-200 px-2.5 py-2 text-right tabular-nums'
const HEAD_CELL = 'border-b border-l border-gray-200 bg-gray-25 px-2.5 py-2 text-right'

/**
 * 연간 통계 — 한 해를 달로 잘라 한 장에서 견준다.
 * 기획: docs_planning/3_7_3_management_attendance.md
 *
 * 조회는 **한 번**이다(1월 1일 ~ 12월 31일). 달마다 따로 부르면 열두 번의 요청이 각자 도착해
 * 표가 왼쪽부터 조금씩 채워지고, 무엇보다 같은 해의 합계가 요청 순서에 따라 달라질 수 있다.
 *
 * 기준근무는 **연말까지** 잡는다 — 아직 오지 않은 달도 근무일 수가 정해져 있기 때문이다. 요약
 * 카드의 올해 기준근무(오늘까지)와 값이 다른 것은 그래서이며, 둘은 다른 질문에 답한다.
 */
export function MyAttendanceYearly({
  userId,
  policy,
}: {
  userId: string | undefined
  policy: AttendancePolicy | null
}) {
  const [year, setYear] = useState(() => dayjs().year())
  const workMinutes = policy?.workMinutes ?? 540
  const today = dayjs().format('YYYY-MM-DD')

  const { data, isLoading } = useAttendanceMonth(
    userId,
    `${year}-01-01`,
    `${year}-12-31`,
    { keepPrevious: true },
  )

  const { months, total } = useMemo(() => {
    const stats = myDayStats(data ?? [], workMinutes, today)
    const byMonth = Array.from({ length: 12 }, (_, i) => {
      const key = `${year}-${String(i + 1).padStart(2, '0')}`
      return myPeriodTotals(
        stats.filter((s) => s.workDate.startsWith(key)),
        workMinutes,
      )
    })
    return { months: byMonth, total: myPeriodTotals(stats, workMinutes) }
  }, [data, workMinutes, today, year])

  if (isLoading && !data) return <Spinner />

  return (
    <Card
      title={`${year}년 연간 통계`}
      help="기준근무는 그 달 근무일 수에 소정 근무시간을 곱한 값이라 아직 오지 않은 달에도 값이 섭니다. 휴가 두 줄은 연차 원장 연동 전이라 비어 있습니다."
    >
      <div className="space-y-4">
        <AttendancePeriodNav
          label={`${year}년`}
          prevLabel="이전 해"
          nextLabel="다음 해"
          resetLabel="올해"
          atCurrent={year === dayjs().year()}
          onPrev={() => setYear(year - 1)}
          onNext={() => setYear(year + 1)}
          onReset={() => setYear(dayjs().year())}
        />

        {/* 열넷(구분 2 + 월 12 + 합계)은 접지 않고 가로로 민다 — 달을 나란히 견주는 표다. */}
        <div className="overflow-x-auto">
          <table className="min-w-[72rem] w-full border-t border-gray-200">
            <thead>
              <tr>
                <th colSpan={2} className={cn(HEAD_CELL, tableText.head, 'border-l-0')} />
                {months.map((_, i) => (
                  <th key={i} className={cn(HEAD_CELL, tableText.head)}>{`${i + 1}월`}</th>
                ))}
                <th className={cn(HEAD_CELL, tableText.head)}>합계</th>
              </tr>
            </thead>
            <tbody>
              {GROUPS.map((group) =>
                group.rows.map((row, idx) => (
                  <tr key={`${group.key}-${row.key}`}>
                    {idx === 0 && (
                      // 묶음 이름은 첫 줄에서 세로로 걸친다 — 줄마다 같은 말을 반복하면 표의
                      // 왼쪽 끝이 '근태 근태 근태'로 읽힌다.
                      <th
                        rowSpan={group.rows.length}
                        scope="rowgroup"
                        className={cn(
                          'border-b border-gray-200 bg-gray-25 px-2.5 py-2 text-center align-middle',
                          tableText.head,
                        )}
                      >
                        {group.label}
                      </th>
                    )}
                    <th
                      scope="row"
                      className={cn(
                        'border-b border-l border-gray-200 px-2.5 py-2 text-left',
                        tableText.body,
                      )}
                    >
                      {row.label}
                    </th>
                    {months.map((t, i) => (
                      <td key={i} className={cn(CELL, tableText.body)}>
                        {cellText(row.pick(t), row.unit)}
                      </td>
                    ))}
                    <td className={cn(CELL, tableText.primary, 'bg-gray-25 font-semibold')}>
                      {cellText(row.pick(total), row.unit)}
                    </td>
                  </tr>
                )),
              )}
            </tbody>
          </table>
        </div>
      </div>
    </Card>
  )
}
