import { Button, Spinner, StatTileGrid, TextAction, type StatTile } from '@ynarcher/ui'
import dayjs from 'dayjs'
import { useMemo, useState } from 'react'
import { DateNav } from '@/components/DateNav'
import { AttendanceDayTable } from '@/features/management/attendance/AttendanceDayTable'
import { AttendanceEditModal, type AttendanceTarget } from '@/features/management/attendance/AttendanceEditModal'
import { AttendanceMonthTable } from '@/features/management/attendance/AttendanceMonthTable'
import { AttendanceSettingsModal } from '@/features/management/attendance/AttendanceSettingsModal'
import {
  useAttendanceBoard,
  useAttendanceMonth,
} from '@/features/management/attendance/attendanceApi'
import { useAttendanceStatuses } from '@/features/management/attendance/attendanceConfigApi'
import { displayStatusCode, statusOf } from '@/features/management/attendance/attendanceModel'
import { affiliationLabel } from '@/features/management/departmentOptions'
import { useDepartments } from '@/features/management/hooks'

/** 인력별 월간으로 들어간 상태(누구를 보고 있는가). null이면 날짜별 일간이다. */
interface PersonView {
  userId: string
  userName: string
}

/**
 * MANAGEMENT 근태 관리 — 날짜별 일간이 기본이고, 이름을 누르면 인력별 월간으로 축이 바뀐다.
 * 기획: docs_planning/3_7_3_management_attendance.md
 *
 * 메뉴를 둘로 쪼개지 않는 이유는 두 뷰가 같은 원장을 다른 각도로 자르는 것일 뿐이기 때문이다.
 * 근무일 판정과 상태 파생은 서버(attendance_board / attendance_month)가 붙여 주고, 이 화면은
 * 날짜·대상·모달만 소유한다.
 */
export function AttendancePanel() {
  const [date, setDate] = useState(() => dayjs())
  const [person, setPerson] = useState<PersonView | null>(null)
  const [target, setTarget] = useState<AttendanceTarget | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)

  const dateKey = date.format('YYYY-MM-DD')
  const monthFrom = date.startOf('month').format('YYYY-MM-DD')
  const monthTo = date.endOf('month').format('YYYY-MM-DD')

  const { data: statuses } = useAttendanceStatuses()
  const { data: depts } = useDepartments()
  const boardQuery = useAttendanceBoard(dateKey)
  const monthQuery = useAttendanceMonth(person?.userId, monthFrom, monthTo)

  const statusList = useMemo(() => statuses ?? [], [statuses])
  const boardRows = useMemo(() => boardQuery.data ?? [], [boardQuery.data])
  const monthRows = useMemo(() => monthQuery.data ?? [], [monthQuery.data])

  const affiliationOf = useMemo(() => {
    const rows = depts ?? []
    return (departmentId: string | null) => affiliationLabel(rows, departmentId)
  }, [depts])

  /**
   * 요약 타일 — 그날의 상태 분포. 상태 원장이 늘어나면 타일도 함께 늘어난다(값을 코드에 박지
   * 않는다). 기록이 없는 사람은 결근(지난 날)이거나 미출근(오늘 이후)으로 갈린다.
   */
  const tiles = useMemo<StatTile[]>(() => {
    const counts = new Map<string, number>()
    let pending = 0
    for (const row of boardRows) {
      if (!row.isWorkday) continue
      const code = displayStatusCode(row, dateKey)
      if (!code) {
        pending += 1
        continue
      }
      counts.set(code, (counts.get(code) ?? 0) + 1)
    }
    const used = statusList
      .filter((s) => counts.has(s.code))
      .map((s) => ({ key: s.code, label: s.label, value: `${counts.get(s.code)}건` }))
    // 아직 찍지 않은 사람은 상태가 아니라 '아직 일어나지 않은 일'이라 맨 뒤에 따로 센다.
    return pending ? [...used, { key: 'PENDING', label: '미출근', value: `${pending}건` }] : used
  }, [boardRows, dateKey, statusList])

  const monthSummary = useMemo(() => {
    let workdays = 0
    let late = 0
    let leave = 0
    let minutes = 0
    for (const row of monthRows) {
      if (row.isWorkday) workdays += 1
      const status = statusOf(statusList, displayStatusCode(row, row.workDate))
      if (status?.code === 'LATE' || status?.code === 'LATE_EARLY') late += 1
      if (status?.kind === 'LEAVE') leave += 1
      if (row.checkInAt && row.checkOutAt) {
        minutes += dayjs(row.checkOutAt).diff(dayjs(row.checkInAt), 'minute')
      }
    }
    return { workdays, late, leave, hours: Math.round((minutes / 60) * 10) / 10 }
  }, [monthRows, statusList])

  const loading = boardQuery.isLoading || monthQuery.isLoading

  return (
    <div className="space-y-4">
      <div className="relative flex items-center justify-center gap-3">
        <DateNav date={date} onChange={setDate} unit={person ? 'month' : 'day'} />
        {person ? (
          <div className="absolute left-0">
            <TextAction arrow="left" onClick={() => setPerson(null)}>
              일간으로
            </TextAction>
          </div>
        ) : (
          <div className="absolute left-0">
            <Button variant="secondary" onClick={() => setDate(dayjs())}>
              오늘
            </Button>
          </div>
        )}
        <div className="absolute right-0">
          <Button variant="secondary" onClick={() => setSettingsOpen(true)}>
            근태 설정
          </Button>
        </div>
      </div>

      {person ? (
        <div className="rounded-radius-md border border-gray-300 bg-white px-4 py-3">
          <p className="text-body-lg font-semibold text-gray-900">{person.userName}</p>
          <p className="mt-0.5 text-caption text-gray-600">
            근무일 {monthSummary.workdays}일 · 지각 {monthSummary.late}일 · 휴가{' '}
            {monthSummary.leave}일 · 총 근무 {monthSummary.hours}시간
          </p>
        </div>
      ) : (
        tiles.length > 0 && <StatTileGrid tiles={tiles} />
      )}

      {loading ? (
        <div className="flex justify-center py-10">
          <Spinner />
        </div>
      ) : person ? (
        <AttendanceMonthTable
          rows={monthRows}
          statuses={statusList}
          onRowClick={(row) =>
            setTarget({
              userId: person.userId,
              userName: person.userName,
              workDate: row.workDate,
              entry: row,
            })
          }
        />
      ) : (
        <AttendanceDayTable
          rows={boardRows}
          dateKey={dateKey}
          statuses={statusList}
          affiliationOf={affiliationOf}
          onRowClick={(row) =>
            setTarget({
              userId: row.userId,
              userName: row.userName,
              workDate: dateKey,
              entry: row,
            })
          }
          onOpenPerson={(row) => setPerson({ userId: row.userId, userName: row.userName })}
        />
      )}

      <AttendanceEditModal
        target={target}
        statuses={statusList}
        onClose={() => setTarget(null)}
      />
      <AttendanceSettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
  )
}
