import { Button, CardHeading, IconButton, Spinner } from '@ynarcher/ui'
import dayjs from 'dayjs'
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react'
import { DayAgenda } from '@/features/hub/DayAgenda'
import { EventEditorModal } from '@/features/hub/EventEditorModal'
import { DATE_KEY, WEEKDAYS } from '@/features/hub/calendarGrid'
import { useCalendarView } from '@/features/hub/calendarView'
import { eventDot } from '@/features/hub/eventStyle'

/**
 * 전사 일정 캘린더의 좁은 배치(우측 슬라이드오버) — 위는 월간 그리드(일정은 레이어색 바로만
 * 표시), 아래는 선택한 날짜의 일정. 등록은 모달로 연다.
 *
 * 원장·달 이동·선택일은 `useCalendarView`가 갖는다. 여기가 소유한 것은 **좁은 자리에 맞춘
 * 배치**뿐이다 — 칸에 제목을 담지 않고(폭이 없다) 좌우로 가르지 않고 세로로 쌓는다. 넓은 배치는
 * OFFICE '전사 일정'(`CompanyCalendarWorkspace`)이 같은 원장을 같은 훅으로 세운다.
 */
export function MonthCalendar() {
  const view = useCalendarView()

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      {/* 헤더: 월 이동(중앙) + 오늘(우측) */}
      <div className="relative flex items-center justify-center">
        <div className="flex items-center gap-1">
          <IconButton
            variant="ghost"
            label="이전 달"
            onClick={() => view.setMonth(view.month.subtract(1, 'month'))}
            icon={<ChevronLeft className="h-4 w-4" />}
          />
          <span className="min-w-[6.5rem] text-center text-body font-semibold text-gray-900">
            {view.month.format('YYYY년 M월')}
          </span>
          <IconButton
            variant="ghost"
            label="다음 달"
            onClick={() => view.setMonth(view.month.add(1, 'month'))}
            icon={<ChevronRight className="h-4 w-4" />}
          />
        </div>
        <Button variant="outline" density="card" className="absolute right-0" onClick={view.goToday}>
          오늘
        </Button>
      </div>

      {/* 그리드 — 칸을 띄운 라운드 셀로 그리고, 일정은 색 바로만 표시한다
          (제목은 아래 상세에서 본다). 표 테두리·카드 겹을 두지 않아 좁은 슬라이드오버에서도 가볍다. */}
      <div className="grid shrink-0 grid-cols-7 gap-1">
        {WEEKDAYS.map((w, i) => (
          <div
            key={w}
            className={`py-1 text-center text-caption font-semibold ${
              i === 0 ? 'text-brand' : i === 6 ? 'text-info' : 'text-gray-700'
            }`}
          >
            {w}
          </div>
        ))}
        {view.weeks.flat().map((day) => {
          const key = day.format(DATE_KEY)
          const inMonth = day.isSame(view.month, 'month')
          const isToday = day.isSame(view.today, 'day')
          const isSelected = key === view.selected
          const dayEvents = view.byDate.get(key) ?? []

          return (
            <button
              type="button"
              key={key}
              onClick={() => view.select(key)}
              className={`flex min-h-[3.25rem] flex-col gap-1 rounded-radius-sm border p-1 text-left transition-colors duration-fast ${
                isSelected
                  ? 'border-info-border bg-info-subtle/60'
                  : `border-gray-200 hover:bg-gray-25 ${inMonth ? 'bg-white' : 'bg-gray-25/60'}`
              }`}
            >
              <span
                className={`text-caption tabular-nums ${
                  isToday
                    ? 'grid h-5 w-5 place-items-center rounded-full bg-brand font-bold text-gray-0'
                    : inMonth
                      ? 'text-gray-700'
                      : 'text-gray-400'
                }`}
              >
                {day.date()}
              </span>
              <span className="flex flex-col gap-0.5">
                {dayEvents.slice(0, 3).map((ev) => (
                  <span
                    key={ev.id}
                    title={ev.title}
                    className={`h-1 rounded-full ${eventDot(ev.event_type)}`}
                  />
                ))}
              </span>
            </button>
          )
        })}
      </div>

      {/* 선택한 날짜의 일정(아래) — 업무/휴가/기타로 묶어 표시 + 등록 진입. */}
      <section className="flex min-h-0 flex-1 flex-col rounded-radius-sm border border-gray-200 bg-gray-25 px-3 py-2.5">
        <div className="mb-2 flex shrink-0 items-center justify-between">
          <CardHeading level="subhead" as="p" count={view.selectedEvents.length}>
            {dayjs(view.selected).format('M월 D일')} ({WEEKDAYS[dayjs(view.selected).day()]})
          </CardHeading>
          {view.canWrite && (
            <Button variant="outline" density="card" onClick={view.openCreate}>
              <Plus className="size-3.5" />
              일정 등록
            </Button>
          )}
        </div>
        <div className="min-h-0 flex-1 overflow-auto">
          {/* 불러오는 중에도 그리드는 남긴다 — 캘린더가 사라지면 달 이동·등록 진입까지 함께 사라진다. */}
          {view.isLoading ? <Spinner /> : <DayAgenda events={view.selectedEvents} onEdit={view.openEdit} />}
        </div>
      </section>

      <EventEditorModal
        open={view.editorOpen}
        dateKey={view.selected}
        event={view.editTarget}
        onClose={view.closeEditor}
      />
    </div>
  )
}
