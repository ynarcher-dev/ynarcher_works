/**
 * 근태 목록의 조건 상태 — 검색어·필터·페이지와 거기서 파생되는 행·선택지·요약 타일.
 *
 * 화면(AttendancePanel)에서 떼어 낸 이유는 두 가지다. 하나는 조건이 날짜별·인력별 두 뷰에
 * 공통이라 한 곳에서 같은 규칙으로 좁혀야 한다는 것이고, 다른 하나는 "지금 무엇이 걸려 있는가"를
 * 아는 자리가 하나여야 페이지 되돌리기 같은 일이 빠지지 않는다는 것이다.
 */
import type { FilterOption, StripTile } from '@ynarcher/ui'
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  EMPTY_ATTENDANCE_FILTERS,
  NO_AFFILIATION,
  PENDING_LABEL,
  PENDING_STATUS,
  matchesPlace,
  matchesStatus,
  toggleStatusFilter,
  type AttendanceFilters,
} from '@/features/management/attendance/attendanceFilters'
import type {
  AttendanceBoardRow,
  AttendanceMonthRow,
  AttendanceStatus,
} from '@/features/management/attendance/attendanceModel'
import { statusTiles } from '@/features/management/attendance/attendanceSummary'

/** 일간 표의 페이지당 행 수(다른 원장 목록과 같은 값). */
export const ATTENDANCE_PAGE_SIZE = 30

interface Input {
  boardRows: AttendanceBoardRow[]
  monthRows: AttendanceMonthRow[]
  statusList: AttendanceStatus[]
  /** 날짜별 뷰가 보고 있는 날. 빈 칸이 결근인지 미출근인지를 이 날짜가 가른다. */
  dateKey: string
  isPerson: boolean
  /**
   * 부서 id → 그 사람이 걸치는 소속명들(본부·그룹·팀…). 소속 조건은 뎁스를 가리지 않는다 —
   * 'AC본부'를 고르면 그 아래 팀 사람까지 걸려야 조직으로 묶어 보는 일이 된다.
   */
  affiliationNamesOf: (departmentId: string | null) => string[]
}

export function useAttendanceList({
  boardRows,
  monthRows,
  statusList,
  dateKey,
  isPerson,
  affiliationNamesOf,
}: Input) {
  const [keyword, setKeyword] = useState('')
  const [filters, setFilters] = useState<AttendanceFilters>(EMPTY_ATTENDANCE_FILTERS)
  const [page, setPage] = useState(0)

  /** 조건이 바뀌면 첫 페이지로 되돌린다(있지도 않은 3페이지에 머무르지 않게). */
  const filtersKey = JSON.stringify(filters)
  useEffect(() => {
    setPage(0)
  }, [keyword, filtersKey, dateKey, isPerson])

  /**
   * 상태를 뺀 나머지 조건까지만 좁힌 집합. 요약 타일은 이것을 센다 — 타일이 곧 상태 필터라서,
   * 타일을 누를 때마다 자기 건수가 함께 줄면 무엇을 고르는지 알 수 없게 된다.
   */
  const scopedDayRows = useMemo(() => {
    const kw = keyword.trim()
    return boardRows.filter((r) => {
      if (kw && !r.userName.includes(kw)) return false
      if (filters.affiliations.length) {
        const names = affiliationNamesOf(r.departmentId)
        // 소속이 없는 사람은 '소속 없음'이라는 한 칸으로 묶어 고를 수 있게 한다.
        const pick = names.length ? names : [NO_AFFILIATION]
        if (!pick.some((n) => filters.affiliations.includes(n))) return false
      }
      return matchesPlace(r, filters)
    })
  }, [boardRows, keyword, filters, affiliationNamesOf])

  const dayRows = useMemo(
    () => scopedDayRows.filter((r) => matchesStatus(r, dateKey, filters)),
    [scopedDayRows, dateKey, filters],
  )

  const scopedMonthRows = useMemo(
    () => monthRows.filter((r) => matchesPlace(r, filters)),
    [monthRows, filters],
  )

  const personRows = useMemo(
    () => scopedMonthRows.filter((r) => matchesStatus(r, r.workDate, filters)),
    [scopedMonthRows, filters],
  )

  // 페이지 구간은 화면이 자른다 — attendance_board는 그날의 전 임직원을 한 번에 돌려주고,
  // 이름·소속 조건도 여기서 판정하므로 서버에 페이지를 물어볼 근거가 없다.
  const pagedDayRows = useMemo(
    () => dayRows.slice(page * ATTENDANCE_PAGE_SIZE, (page + 1) * ATTENDANCE_PAGE_SIZE),
    [dayRows, page],
  )

  const toggleStatus = useCallback((code: string) => {
    setFilters((f) => toggleStatusFilter(f, code))
  }, [])

  const clearStatuses = useCallback(() => {
    setFilters((f) => ({ ...f, statuses: [] }))
  }, [])

  const tiles = useMemo<StripTile[]>(
    () =>
      statusTiles({
        items: isPerson
          ? scopedMonthRows.map((r) => ({ entry: r, dateKey: r.workDate }))
          : scopedDayRows.map((r) => ({ entry: r, dateKey })),
        statuses: statusList,
        selected: filters.statuses,
        onToggle: toggleStatus,
        onClear: clearStatuses,
        // 날짜별은 그날의 사람을 세고, 인력별은 한 사람의 날을 센다.
        totalUnit: isPerson ? '일' : '명',
      }),
    [
      isPerson,
      scopedMonthRows,
      scopedDayRows,
      dateKey,
      statusList,
      filters.statuses,
      toggleStatus,
      clearStatuses,
    ],
  )

  const statusOptions = useMemo<FilterOption[]>(
    () => [
      ...statusList.filter((s) => s.isActive).map((s) => ({ value: s.code, label: s.label })),
      // 상태 원장에 없는 값이지만 표에서는 한 칸을 차지한다 — 고를 수 있어야 "안 온 사람만" 볼 수 있다.
      { value: PENDING_STATUS, label: PENDING_LABEL },
    ],
    [statusList],
  )

  // 소속 선택지는 조직도 전체가 아니라 그날 표에 실제로 선 소속만 담는다 — 아무도 없는 부서를
  // 골라 빈 표를 보게 만들 이유가 없다. 뎁스를 가리지 않으므로 본부도 팀도 함께 선다.
  const affiliationOptions = useMemo<FilterOption[]>(() => {
    const names = new Set<string>()
    for (const r of boardRows) {
      const own = affiliationNamesOf(r.departmentId)
      if (own.length) own.forEach((n) => names.add(n))
      else names.add(NO_AFFILIATION)
    }
    return [...names]
      .sort((a, b) => a.localeCompare(b, 'ko'))
      .map((value) => ({ value, label: value }))
  }, [boardRows, affiliationNamesOf])

  return {
    keyword,
    setKeyword,
    filters,
    setFilters,
    page,
    setPage,
    /** 조건에 맞는 일간 전체(페이저의 total). */
    dayRows,
    /** 지금 페이지에 그릴 일간 행. */
    pagedDayRows,
    personRows,
    tiles,
    statusOptions,
    affiliationOptions,
  }
}
