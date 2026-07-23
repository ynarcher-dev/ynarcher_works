import { Spinner } from '@ynarcher/ui'
import { MonthCalendar } from '@/features/hub/MonthCalendar'
import { useSystemEvents } from '@/features/hub/hooks'

/**
 * 전사 캘린더(사용자 업무/휴가). 일정이 없어도 캘린더 격자와 '일정 등록'은 항상 보여야 하므로
 * 빈 상태로 캘린더를 숨기지 않는다(선택일에 일정이 없으면 그 안내는 상세 영역이 담당한다).
 */
export function CalendarPanel() {
  const { data, isLoading } = useSystemEvents()

  if (isLoading) return <Spinner />

  return <MonthCalendar events={data ?? []} />
}
