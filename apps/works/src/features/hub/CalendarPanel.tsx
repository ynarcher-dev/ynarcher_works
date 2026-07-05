import { EmptyState, Spinner } from '@ynarcher/ui'
import { MonthCalendar } from '@/features/hub/MonthCalendar'
import { useSystemEvents } from '@/features/hub/hooks'

/** 전사 통합 캘린더(4개 레이어: AC/PROJECT/FUND/COMPANY). */
export function CalendarPanel() {
  const { data, isLoading } = useSystemEvents()

  if (isLoading) return <Spinner />
  if (!data || data.length === 0) {
    return <EmptyState title="등록된 일정이 없습니다." />
  }

  return <MonthCalendar events={data} />
}
