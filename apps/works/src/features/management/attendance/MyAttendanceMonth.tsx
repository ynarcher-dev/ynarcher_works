import { Card, DataTable, type Column } from '@ynarcher/ui'
import dayjs from 'dayjs'
import { useState } from 'react'
import { useAttendanceMonth } from '@/features/management/attendance/attendanceApi'
import { AttendancePeriodNav } from '@/features/management/attendance/AttendancePeriodNav'
import type { AttendancePolicy } from '@/features/management/attendance/attendanceModel'
import {
  EMPTY_TEXT,
  minutesText,
  myDayStats,
  myPeriodTotals,
} from '@/features/management/attendance/myAttendanceStats'

/**
 * 월 근무현황 표의 한 줄. 값이 `null`인 칸은 아직 답하지 못하는 칸이라 **비워 둔다** —
 * 0으로 적으면 '연장 근무가 없었다'는 사실을 말하게 되어 거짓이 된다.
 */
interface MonthRow {
  key: string
  label: string
  /** 기준근무 — 근무일 수 × 소정. */
  base: number | null
  /** 계획 — 계획 원장이 없어 기준근무와 같은 값이다(§ 근무계획 참조). */
  plan: number | null
  /** 실근무 — 실제로 잰 시간. */
  actual: number | null
  /** 연월차 — 연차 원장이 서기 전이다. */
  annual: number | null
  /** 모든 휴가 — 같은 이유로 아직 없다. */
  allLeave: number | null
}

/** 값 칸 하나. 시간 표기는 한 곳(`minutesText`)이 소유한다. */
function cell(v: number | null) {
  return minutesText(v) ?? EMPTY_TEXT
}

/**
 * 값 열 다섯의 규격 — **폭을 값이 정하게 두지 않는다.**
 *
 * 종류(`money`)를 주면 값 열이 8rem 고정폭으로 오른쪽에 몰리고 남는 폭을 구분 열이 통째로
 * 가져간다 — 세 글자짜리 라벨 하나가 표의 절반을 차지하고 값 다섯이 끝에 붙어 선다. 이 표는
 * 한 줄이 레코드가 아니라 **집계의 한 축**이라 열마다 성격이 갈리지 않으므로, 종류를 빼고
 * `layout="fixed"`로 여섯 열이 폭을 **균등하게 나눠 갖게** 한다.
 *
 * 균등 분할은 값 길이와 무관하므로 달을 옮겨도 열 경계가 움직이지 않는다 — 값이 빈 달과
 * 채워진 달을 나란히 견줄 수 있다는 원래 요점은 그대로다. 우측 정렬과 수치 서식은 종류가
 * 하던 일을 여기서 직접 적는다.
 */
const valueColumn = (key: keyof MonthRow, header: string): Column<MonthRow> => ({
  key,
  header,
  align: 'right',
  numeric: true,
  render: (r) => cell(r[key] as number | null),
})

const COLUMNS: Column<MonthRow>[] = [
  { key: 'label', header: '구분', primary: true, render: (r) => r.label },
  valueColumn('base', '기준근무'),
  valueColumn('plan', '계획'),
  valueColumn('actual', '실근무'),
  valueColumn('annual', '연월차'),
  valueColumn('allLeave', '모든 휴가'),
]

/**
 * 월간 근무현황 — 한 달을 한 덩어리로 요약한 표.
 * 기획: docs_planning/3_7_3_management_attendance.md
 *
 * 주간 표와 **같은 자리·같은 모양으로 달을 옮긴다**(`AttendancePeriodNav`). 한 화면에 기간을
 * 옮기는 줄이 둘 있는데 하나만 움직이면, 위에서 지난주를 보다가 내려온 눈이 아래 표도 따라온
 * 줄 알고 읽는다.
 *
 * **연장은 기준근무·계획 칸을 갖지 않는다.** 연장은 미리 정하는 값이 아니라 일한 결과라,
 * 그 자리에 소정과 같은 숫자를 채우면 '연장을 이만큼 하기로 했다'는 뜻이 되어 버린다.
 */
export function MyAttendanceMonth({
  userId,
  policy,
}: {
  userId: string | undefined
  policy: AttendancePolicy | null
}) {
  const [month, setMonth] = useState(() => dayjs().startOf('month'))
  const isThisMonth = month.isSame(dayjs(), 'month')
  const workMinutes = policy?.workMinutes ?? 540
  const { data } = useAttendanceMonth(
    userId,
    month.startOf('month').format('YYYY-MM-DD'),
    month.endOf('month').format('YYYY-MM-DD'),
  )
  const totals = myPeriodTotals(myDayStats(data ?? [], workMinutes), workMinutes)

  const rows: MonthRow[] = [
    {
      key: 'regular',
      label: '소정',
      base: totals.baseMinutes,
      plan: totals.baseMinutes,
      actual: totals.regularMinutes,
      annual: totals.leaveMinutes,
      allLeave: totals.leaveMinutes,
    },
    {
      key: 'overtime',
      label: '연장, 휴일',
      base: null,
      plan: null,
      actual: totals.overtimeMinutes,
      annual: null,
      allLeave: null,
    },
    {
      key: 'total',
      label: '총 근무',
      base: totals.baseMinutes,
      plan: totals.baseMinutes,
      actual: totals.workedMinutes,
      annual: totals.leaveMinutes,
      allLeave: totals.leaveMinutes,
    },
  ]

  return (
    <Card
      title="월간 근무현황"
      help="기준근무는 그 달 근무일 수에 소정 근무시간을 곱한 값입니다. 계획은 별도 근무계획 원장이 없어 기준근무와 같습니다. 연월차·모든 휴가는 연차 원장 연동 전이라 아직 값이 없습니다."
    >
      <div className="space-y-4">
        <AttendancePeriodNav
          label={month.format('YYYY년 M월')}
          prevLabel="이전 달"
          nextLabel="다음 달"
          resetLabel="이번 달"
          atCurrent={isThisMonth}
          onPrev={() => setMonth(month.subtract(1, 'month'))}
          onNext={() => setMonth(month.add(1, 'month'))}
          onReset={() => setMonth(dayjs().startOf('month'))}
        />

        {/*
          No.도 표준 열(생성자·수정일·관리)도 세우지 않는다. 이 표의 한 줄은 레코드가 아니라
          **집계의 한 축**(소정·연장·총)이라, 누가 만들었고 언제 고쳤는지가 가리킬 대상 자체가
          없다. 그대로 두면 값이 영영 `-`인 열 셋이 표 폭의 절반을 가져간다.
        */}
        <DataTable
          columns={COLUMNS}
          rows={rows}
          rowKey={(r) => r.key}
          numbered={false}
          standardColumns={false}
          layout="fixed"
        />
      </div>
    </Card>
  )
}
