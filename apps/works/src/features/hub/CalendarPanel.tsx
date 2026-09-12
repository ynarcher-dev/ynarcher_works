import { Button } from '@ynarcher/ui'
import { ArrowRight } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { BirthdayCard } from '@/features/hub/BirthdayCard'
import { MonthCalendar } from '@/features/hub/MonthCalendar'

/**
 * 우측 슬라이드오버의 전사 캘린더. 담는 것은 좁은 배치의 캘린더(`MonthCalendar`)와 **주원장
 * 화면으로 가는 길** 하나다.
 *
 * 길을 두는 이유는 두 자리가 같은 원장을 보되 답하는 폭이 다르기 때문이다 — 여기서는 오늘 무엇이
 * 있나를 훑고, 달 전체를 제목까지 펼쳐 보는 일은 OFFICE '전사 일정'이 한다. 길이 없으면 담당자가
 * 좁은 칸에서 날짜를 하나씩 눌러 가며 그 일을 한다.
 */
export function CalendarPanel({ onNavigate }: { onNavigate?: () => void }) {
  const navigate = useNavigate()

  return (
    <>
      <BirthdayCard />
      <MonthCalendar />
      <Button
        variant="outline"
        className="mt-3 shrink-0"
        onClick={() => {
          navigate('/office?tab=calendar')
          onNavigate?.()
        }}
      >
        전사 일정 전체보기
        <ArrowRight className="size-4" />
      </Button>
    </>
  )
}
