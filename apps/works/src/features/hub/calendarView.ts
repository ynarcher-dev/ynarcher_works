import dayjs, { type Dayjs } from 'dayjs'
import { useMemo, useState } from 'react'
import { hasWorkspaceWrite, useAuthStore } from '@/auth/authStore'
import { buildWeeks, DATE_KEY, groupByDate, monthRange } from '@/features/hub/calendarGrid'
import { useSystemEvents, type SystemEvent } from '@/features/hub/hooks'

export interface CalendarView {
  today: Dayjs
  /** 보고 있는 달(1일 0시). */
  month: Dayjs
  weeks: Dayjs[][]
  byDate: Map<string, SystemEvent[]>
  /** 선택한 날짜(YYYY-MM-DD). */
  selected: string
  selectedEvents: SystemEvent[]
  isLoading: boolean
  /** OFFICE 쓰기 권한 — 등록·수정 진입 노출 판정(강제는 RLS가 한다). */
  canWrite: boolean
  /** 보는 달을 옮긴다(1일로 정규화 — 달 칸은 날짜가 아니라 달 단위다). */
  setMonth: (next: Dayjs) => void
  /** 이번 달 + 오늘로 함께 돌아온다(달만 옮기면 선택일이 화면 밖에 남는다). */
  goToday: () => void
  select: (dateKey: string) => void
  editorOpen: boolean
  /** 모달 대상 — null이면 신규 등록. */
  editTarget: SystemEvent | null
  openCreate: () => void
  openEdit: (ev: SystemEvent) => void
  closeEditor: () => void
}

/**
 * 전사 일정 캘린더의 상태·데이터 한 벌.
 *
 * 두 화면이 이것을 함께 쓴다 — OFFICE '전사 일정'(주원장 화면)과 우측 슬라이드오버의 좁은
 * 캘린더다. 달 이동·선택일·등록 모달까지 여기 모아 둔 이유는 자리가 아니라 **답**이다: 보는 달이
 * 곧 조회 구간이라(`monthRange`) 상태와 질의를 갈라 두면 두 화면이 서로 다른 구간을 집게 되고,
 * 같은 원장을 보면서 같은 달에 다른 건수를 답하기 시작한다. 갈리는 것은 배치뿐이므로 배치만
 * 각 화면이 갖는다.
 */
export function useCalendarView(): CalendarView {
  const user = useAuthStore((s) => s.user)
  const canWrite = hasWorkspaceWrite(user, 'office')

  const today = dayjs()
  const [month, setMonth] = useState<Dayjs>(today.startOf('month'))
  const [selected, setSelected] = useState<string>(today.format(DATE_KEY))
  const [editorOpen, setEditorOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<SystemEvent | null>(null)

  const range = useMemo(() => monthRange(month), [month])
  const { data, isLoading } = useSystemEvents(range)

  const byDate = useMemo(() => groupByDate(data ?? []), [data])
  const weeks = useMemo(() => buildWeeks(month), [month])
  const selectedEvents = byDate.get(selected) ?? []

  return {
    today,
    month,
    weeks,
    byDate,
    selected,
    selectedEvents,
    isLoading,
    canWrite,
    setMonth: (next) => setMonth(next.startOf('month')),
    goToday: () => {
      setMonth(today.startOf('month'))
      setSelected(today.format(DATE_KEY))
    },
    select: setSelected,
    editorOpen,
    editTarget,
    openCreate: () => {
      setEditTarget(null)
      setEditorOpen(true)
    },
    openEdit: (ev) => {
      setEditTarget(ev)
      setEditorOpen(true)
    },
    closeEditor: () => setEditorOpen(false),
  }
}
