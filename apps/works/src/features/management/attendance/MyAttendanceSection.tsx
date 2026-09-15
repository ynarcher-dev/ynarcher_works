import { Button, Card, StatStrip, TextAction, type StripTile } from '@ynarcher/ui'
import dayjs from 'dayjs'
import { useAttendanceMonth } from '@/features/management/attendance/attendanceApi'
import { MyAttendanceWeek } from '@/features/management/attendance/MyAttendanceWeek'
import type {
  AttendancePolicy,
  AttendanceStatus,
} from '@/features/management/attendance/attendanceModel'
import {
  EMPTY_TEXT,
  correctedAverageMinutes,
  minutesText,
  myDayStats,
  myPeriodTotals,
} from '@/features/management/attendance/myAttendanceStats'

/** 지표 띠의 칸 수는 카드마다 다르다 — 기본 격자(5칸) 대신 이 둘을 쓴다. */
const GRID_4 = 'grid grid-cols-2 divide-gray-200 sm:grid-cols-4 sm:divide-x'
const GRID_3 = 'grid grid-cols-1 divide-gray-200 sm:grid-cols-3 sm:divide-x'

/** 절 제목 — 카드 제목(16px)보다 한 단 위의 층이다. */
function SectionTitle({ children }: { children: string }) {
  return <h2 className="text-title-sm font-bold text-gray-900">{children}</h2>
}

/**
 * 휴가/근무 — 올해 요약과 이번 주, 그리고 신청을 시작하는 자리.
 * 기획: docs_planning/3_7_3_management_attendance.md
 *
 * 근태현황 다섯 탭의 첫 화면이다. 여기가 답하는 것은 **올해와 이번 주**뿐이고, 달력(월)·휴가
 * 내역·연간 통계·신청 내역은 각자의 탭이 답한다. 한 화면에 다 얹으면 기간을 옮기는 줄이 넷이
 * 되어, 어느 줄을 움직였는지 모른 채 값을 읽게 된다.
 *
 * 관리자의 `근태 관리`와 합치지 않는다. 그 화면은 **전 직원을 날짜로** 자르고 이 화면은
 * **한 사람을 기간으로** 자른다 — 축이 다르므로 한 화면에 얹으면 필터와 요약이 두 뜻을 갖는다.
 * 대신 원장과 조회 경로는 같은 것을 쓴다(`attendance_month`는 SECURITY INVOKER라 RLS가 본인
 * 행만 내어 준다). 화면이 새 길을 내지 않는다는 뜻이다.
 *
 * 모든 블록이 **같은 집계 함수를 기간만 바꿔** 부른다. 정의가 블록마다 살면 같은 '총근무시간'이
 * 위에서는 800시간, 아래에서는 795시간으로 적힌다.
 */
export function MyAttendanceSection({
  userId,
  policy,
  statuses,
  onRequest,
  onOpenLeaveHistory,
}: {
  userId: string | undefined
  policy: AttendancePolicy | null
  statuses: AttendanceStatus[]
  /** 신청 화면을 연다(휴가·연장근무·휴일근무). */
  onRequest: (kind: 'leave' | 'overtime' | 'holiday') => void
  /** 휴가 내역 탭으로 옮겨 간다. */
  onOpenLeaveHistory: () => void
}) {
  const year = dayjs().year()
  const today = dayjs().format('YYYY-MM-DD')
  const workMinutes = policy?.workMinutes ?? 540

  // 올해 = 1월 1일부터 오늘까지. 아직 오지 않은 날을 넣으면 근무일 수가 연말 기준으로 잡혀
  // 기준근무가 실제보다 커지고, 그 값과 견주는 실근무는 늘 모자란 것처럼 보인다.
  const { data: yearRows } = useAttendanceMonth(userId, `${year}-01-01`, today)
  const totals = myPeriodTotals(myDayStats(yearRows ?? [], workMinutes, today), workMinutes)
  const average = correctedAverageMinutes(totals)

  const countTiles: StripTile[] = [
    { key: 'late', label: '지각', value: `${totals.lateCount}`, unit: '회' },
    { key: 'early', label: '조기퇴근', value: `${totals.earlyLeaveCount}`, unit: '회' },
    { key: 'missing', label: '퇴근미체크', value: `${totals.missingCheckoutCount}`, unit: '회' },
    { key: 'absent', label: '결근', value: `${totals.absentCount}`, unit: '회' },
  ]

  const timeTiles: StripTile[] = [
    { key: 'days', label: '근무일수', value: `${totals.workdays}`, unit: '일' },
    { key: 'total', label: '총근무시간', value: minutesText(totals.workedMinutes) ?? EMPTY_TEXT },
    { key: 'avg', label: '보정평균', value: minutesText(average) ?? EMPTY_TEXT },
  ]

  return (
    <div className="space-y-5">
      <section className="space-y-3">
        <SectionTitle>{`${year}년 근무 정보`}</SectionTitle>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <Card
            title="근태 현황"
            help="지각·조기퇴근은 근태 원장이 매긴 상태를 셉니다(지각·조기퇴근이 겹친 날은 두 칸 모두에 듭니다). 퇴근미체크는 출근만 찍힌 지난 날이며, 결근은 근무일인데 기록이 없는 날입니다."
          >
            <StatStrip tiles={countTiles} className={GRID_4} variant="label-led" />
          </Card>

          {/*
            휴가 현황 — 왼쪽은 남은 것, 오른쪽은 할 일이다.

            **잔여 휴가는 아직 자리만 세운다.** 연차 지급·소진 원장이 없고, `hr_profiles`의 연차
            칸은 어느 화면도 갱신하지 않는 죽은 값이라 그것을 읽으면 틀린 수를 보여 준다. 0으로
            적지 않는 이유도 같다 — 0일 남았다는 말과 모른다는 말은 다르다. 예시 값이 서는 곳은
            `휴가 내역` 탭 하나이고, 그 화면은 예시임을 스스로 적는다.

            **`휴가 신청`은 이 화면에서 시작한다**(2026-09-15 사용자 확정). 만들어지는 것은
            지금까지와 같은 전자결재 문서이고(휴가는 결재가 만든다 — 캘린더의 휴가 행도 같은
            이유로 결재만 만들 수 있다), 달라진 것은 입력 화면 하나다.
          */}
          <Card
            title="휴가 현황"
            help="잔여 휴가는 연차 원장 연동 후 채워집니다. 휴가 신청은 이 카드의 `휴가 신청`에서 시작하며, 결재 문서로 올라갑니다."
          >
            <div className="flex items-center justify-between gap-3">
              <div className="flex min-h-16 min-w-0 flex-col justify-center gap-3 px-3 py-1">
                <p className="truncate text-body font-semibold text-gray-900">잔여 휴가</p>
                <p className="text-body font-normal text-gray-400">{EMPTY_TEXT}</p>
              </div>
              <div className="flex shrink-0 items-center gap-3">
                {/* 갈 곳이 생겼다 — `휴가 내역` 탭이 발생·사용·신청을 한 화면에서 답한다. */}
                <TextAction onClick={onOpenLeaveHistory}>휴가 내역</TextAction>
                <span aria-hidden className="text-gray-300">
                  |
                </span>
                <Button variant="outline" onClick={() => onRequest('leave')}>
                  휴가 신청
                </Button>
              </div>
            </div>
          </Card>

          <Card
            title="근무시간"
            help="보정평균은 총근무시간을 실제로 출근한 날 수로 나눈 값입니다. 휴가·결근으로 일하지 않은 날은 나누는 수에 들지 않습니다."
          >
            <StatStrip tiles={timeTiles} className={GRID_3} variant="label-led" />
          </Card>
        </div>
      </section>

      <MyAttendanceWeek
        userId={userId}
        policy={policy}
        statuses={statuses}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" onClick={() => onRequest('overtime')}>
              연장근무 신청
            </Button>
            <Button variant="outline" onClick={() => onRequest('holiday')}>
              휴일근무 신청
            </Button>
          </div>
        }
      />
    </div>
  )
}
