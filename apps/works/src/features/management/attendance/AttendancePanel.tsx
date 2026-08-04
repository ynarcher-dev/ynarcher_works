import { Button, EmptyState, Spinner, StatTileGrid, Tabs } from '@ynarcher/ui'
import dayjs from 'dayjs'
import { useMemo, useState } from 'react'
import { DateNav } from '@/components/DateNav'
import { AttendanceDayTable } from '@/features/management/attendance/AttendanceDayTable'
import { AttendanceEditModal, type AttendanceTarget } from '@/features/management/attendance/AttendanceEditModal'
import { AttendanceMonthTable } from '@/features/management/attendance/AttendanceMonthTable'
import { AttendanceSettingsModal } from '@/features/management/attendance/AttendanceSettingsModal'
import { AttendanceToolbar } from '@/features/management/attendance/AttendanceToolbar'
import {
  useAttendanceBoard,
  useAttendanceMonth,
} from '@/features/management/attendance/attendanceApi'
import { useAttendanceStatuses } from '@/features/management/attendance/attendanceConfigApi'
import { personSummary } from '@/features/management/attendance/attendanceSummary'
import {
  ATTENDANCE_PAGE_SIZE,
  useAttendanceList,
} from '@/features/management/attendance/useAttendanceList'
import { useOrgTiers } from '@/features/management/orgTiers'

/** 무엇을 축으로 자를 것인가. 이 값이 표뿐 아니라 날짜 바의 이동 단위(일/월)까지 정한다. */
type ViewAxis = 'day' | 'person'

const VIEW_TABS = [
  { key: 'day', label: '날짜별' },
  { key: 'person', label: '인력별' },
]

/**
 * MANAGEMENT 근태 관리 — 날짜별 일간과 인력별 월간, 두 축을 한 화면에서 오간다.
 * 기획: docs_planning/3_7_3_management_attendance.md
 *
 * 메뉴를 둘로 쪼개지 않는 이유는 두 뷰가 같은 원장을 다른 각도로 자르는 것일 뿐이기 때문이다.
 * 다만 축 전환을 표 안의 이름 링크에만 맡기지 않는다 — 그러면 "김OO의 이번 달"을 보려고 먼저
 * 수백 줄에서 그 사람을 눈으로 찾아야 하고, 그런 문은 있어도 없는 것과 같다. 탭이 축을
 * 드러내고, 이름 링크는 표 안에서의 지름길로 남는다.
 *
 * 화면은 넓은 것에서 좁은 것으로 내려간다 — **통계 현황(상태 원장 전체) → 축(탭) → 날짜 →
 * 조건(툴바) → 표**. 위로 갈수록 범위를 말하고 아래로 갈수록 그 범위를 좁힌다.
 *
 * 컨트롤의 규칙도 하나다. **축은 탭, 날짜 이동은 날짜 바, 목록 조건은 툴바(검색·필터 칩), 화면
 * 동작은 버튼**이며, 텍스트 링크는 표 안의 인라인 이동에만 쓴다. 같은 자리에 같은 일을 하는 것이
 * 어떤 때는 링크로 어떤 때는 버튼으로 서면 규칙이 없는 화면이 된다.
 *
 * 근무일 판정과 상태 파생은 서버(attendance_board / attendance_month)가 붙여 주고, 이 화면은
 * 축·날짜·조건·모달만 소유한다. 세는 규칙은 attendanceFilters/attendanceSummary가 갖는다.
 */
export function AttendancePanel() {
  const [date, setDate] = useState(() => dayjs())
  const [view, setView] = useState<ViewAxis>('day')
  const [personId, setPersonId] = useState('')
  const [target, setTarget] = useState<AttendanceTarget | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)

  const isPerson = view === 'person'
  const dateKey = date.format('YYYY-MM-DD')
  const monthFrom = date.startOf('month').format('YYYY-MM-DD')
  const monthTo = date.endOf('month').format('YYYY-MM-DD')

  const { data: statuses } = useAttendanceStatuses()
  // 소속 컬럼의 눈금(뎁스)은 조직 관리가 정한다 — 인사 관리 목록과 같은 훅을 쓴다.
  const org = useOrgTiers()
  const boardQuery = useAttendanceBoard(dateKey)
  const monthQuery = useAttendanceMonth(
    isPerson && personId ? personId : undefined,
    monthFrom,
    monthTo,
  )

  const statusList = useMemo(() => statuses ?? [], [statuses])
  const boardRows = useMemo(() => boardQuery.data ?? [], [boardQuery.data])
  const monthRows = useMemo(() => monthQuery.data ?? [], [monthQuery.data])

  /**
   * 대상 선택지는 임직원 원장이 아니라 **그 표에 선 사람들**(attendance_board의 명부)에서 뽑는다.
   * 두 목록이 갈리면 표에서 이름을 눌러 들어온 사람이 정작 선택 상자에는 없는 상태가 된다.
   */
  const people = useMemo(
    () => boardRows.map((r) => ({ id: r.userId, name: r.userName })),
    [boardRows],
  )

  const personName = useMemo(
    () => people.find((p) => p.id === personId)?.name ?? '',
    [people, personId],
  )

  // 검색어·필터·페이지와 거기서 파생되는 행·선택지·타일은 훅이 갖는다(조건을 아는 자리는 하나).
  const list = useAttendanceList({
    boardRows,
    monthRows,
    statusList,
    dateKey,
    isPerson,
    affiliationNamesOf: org.namesOf,
  })

  const summary = useMemo(() => personSummary(monthRows), [monthRows])

  const loading = boardQuery.isLoading || monthQuery.isLoading

  const openPerson = (userId: string) => {
    setPersonId(userId)
    setView('person')
  }

  return (
    <div className="space-y-4">
      {/*
        통계 현황 — 화면 맨 위에서 "지금 보고 있는 범위가 어떤 상태로 갈리는가"를 먼저 말한다.
        상태 원장 전체가 서므로 0건도 자리를 지킨다(0은 값이 없는 것이 아니라 값이 0인 것이다).
        타일 수는 원장이 정하니 기본 5열보다 촘촘히 깐다 — 열 폭이 아니라 항목 수가 기준이다.
      */}
      {/* 원장을 아직 못 읽었으면 세우지 않는다 — '미출근' 한 칸만 덩그러니 떴다 사라진다. */}
      {statusList.length > 0 && (
        <StatTileGrid
          tiles={list.tiles}
          className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-6"
        />
      )}

      {/* 축 전환 — 표뿐 아니라 아래 날짜 바의 이동 단위(일/월)와 조건 구성까지 이 탭이 정한다. */}
      <Tabs items={VIEW_TABS} value={view} onChange={(k) => setView(k as ViewAxis)} />

      <DateNav date={date} onChange={setDate} unit={isPerson ? 'month' : 'day'} />

      <AttendanceToolbar
        person={isPerson ? { id: personId, options: people, onChange: setPersonId } : null}
        keyword={list.keyword}
        onKeywordChange={list.setKeyword}
        filters={list.filters}
        onFiltersChange={list.setFilters}
        statusOptions={list.statusOptions}
        affiliationOptions={list.affiliationOptions}
        actions={
          <Button variant="secondary" onClick={() => setSettingsOpen(true)}>
            근태 설정
          </Button>
        }
      />

      {isPerson && personId && (
        <div className="rounded-radius-md border border-gray-300 bg-white px-4 py-3">
          <p className="text-body-lg font-semibold text-gray-900">{personName}</p>
          {/* 상태별 건수는 위 통계 현황이 답한다 — 여기서 또 세면 조건을 걸었을 때 두 수가 갈린다. */}
          <p className="mt-0.5 text-caption text-gray-600">
            {date.format('YYYY년 M월')} · 근무일 {summary.workdays}일 · 총 근무 {summary.hours}시간
          </p>
        </div>
      )}

      {isPerson && !personId ? (
        <EmptyState
          title="임직원을 선택하세요"
          description="위 목록에서 사람을 고르면 그 사람의 한 달 근태가 날짜순으로 섭니다."
        />
      ) : loading ? (
        <div className="flex justify-center py-10">
          <Spinner />
        </div>
      ) : isPerson ? (
        // 월간은 한 달이 곧 한 페이지(최대 31줄)라 페이저를 두지 않는다 — 달을 넘기는 일은
        // 날짜 바가 이미 한다.
        <AttendanceMonthTable
          rows={list.personRows}
          statuses={statusList}
          onRowClick={(row) =>
            setTarget({
              userId: personId,
              userName: personName,
              workDate: row.workDate,
              entry: row,
            })
          }
        />
      ) : (
        <AttendanceDayTable
          rows={list.pagedDayRows}
          dateKey={dateKey}
          statuses={statusList}
          org={org}
          onRowClick={(row) =>
            setTarget({
              userId: row.userId,
              userName: row.userName,
              workDate: dateKey,
              entry: row,
            })
          }
          onOpenPerson={(row) => openPerson(row.userId)}
          pagination={{
            page: list.page,
            pageSize: ATTENDANCE_PAGE_SIZE,
            total: list.dayRows.length,
            totalAll: boardRows.length,
            onChange: list.setPage,
          }}
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
