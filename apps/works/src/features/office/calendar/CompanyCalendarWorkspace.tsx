import { Button, CardShell, PageHeader, PanelCard, Spinner } from '@ynarcher/ui'
import dayjs from 'dayjs'
import { Plus } from 'lucide-react'
import { DateNav } from '@/components/DateNav'
import { DayAgenda } from '@/features/hub/DayAgenda'
import { EventEditorModal } from '@/features/hub/EventEditorModal'
import { WEEKDAYS } from '@/features/hub/calendarGrid'
import { useCalendarView } from '@/features/hub/calendarView'
import { CompanyCalendarGrid } from '@/features/office/calendar/CompanyCalendarGrid'

/**
 * OFFICE '전사 일정' — 전사 일정 원장(`system_events`)의 주원장 화면.
 *
 * 우측 슬라이드오버의 캘린더와 **같은 원장·같은 훅**(`useCalendarView`)을 쓰고 배치만 다르다
 * (달 이동·선택일·등록 모달까지 한 벌이다). 갈라 두지 않는 이유는 같은 물음에 답하는 자리가
 * 둘이기 때문이다 — 조회 구간이나 등록 규칙이 한쪽에만 붙으면 두 화면이 같은 달에 다른 답을 한다.
 * 여기가 주원장인 것은 달 전체를 제목까지 펼쳐 읽고 일정을 고치는 일이 이 자리에서 끝난다는 뜻이고,
 * 슬라이드오버는 어느 화면에 있든 오늘 무엇이 있나를 훑는 창이다.
 *
 * 달 이동은 날짜를 축으로 삼는 다른 화면(회의실 예약·근태 관리)과 같은 `DateNav` 알약을 쓴다 —
 * 같은 축을 움직이는 컨트롤이 화면마다 다른 모양이면 같은 자리를 두 번 누르지 못한다.
 */
export function CompanyCalendarWorkspace() {
  const view = useCalendarView()
  const selected = dayjs(view.selected)

  return (
    <div className="flex h-full min-h-0 flex-col gap-5">
      <PageHeader
        title="전사 일정"
        actions={
          view.canWrite && (
            <Button onClick={view.openCreate}>
              <Plus className="size-4" />
              일정 등록
            </Button>
          )
        }
      />

      <div className="flex min-h-0 flex-1 gap-5">
        {/* 좌: 달 이동 + 월간 그리드. 칸 높이는 화면이 아니라 고정 하한이 정한다 — 그날의 일정 수나
            화면 높이에 따라 행 높이가 갈리면 같은 자리를 두 번 누르지 못한다.

            상자는 `CardShell`이다(수제 div가 아니다) — 우측 패널이 카드라 격자만 페이지 바탕에
            놓이면 같은 줄의 두 덩어리가 다른 겹에 서고, 무엇보다 카드는 `card` 밀도를 아래로
            내려준다(수제 상자 안의 버튼은 페이지 밀도 그대로라 상자만 작고 버튼만 크다). */}
        <CardShell className="flex min-h-0 min-w-0 flex-[2] flex-col gap-3">
          <div className="relative flex shrink-0 items-center justify-center">
            <DateNav date={view.month} unit="month" onChange={view.setMonth} />
            <Button variant="outline" className="absolute right-0" onClick={view.goToday}>
              오늘
            </Button>
          </div>
          {/* 달력은 스크롤하지 않는다 — 격자가 이 칸의 높이를 그대로 받아 주 수로 나눠 쓴다.
              (스크롤을 두면 요일 머리줄이 칸과 한 격자라 스크롤바 폭만큼 열도 함께 어긋난다.) */}
          <div className="min-h-0 flex-1 overflow-hidden">
            <CompanyCalendarGrid view={view} />
          </div>
        </CardShell>

        {/* 우: 선택한 날짜의 일정 전부(칸에서 접힌 `+N`이 여기서 펼쳐진다).

            높이는 좌측 카드에 맞춰 고정하고 넘치는 목록은 **카드 안에서** 스크롤한다 — 카드가
            내용만큼 자라면 일정이 많은 날에만 오른쪽이 아래로 길어져, 같은 화면인데 날짜를 고를
            때마다 페이지 길이가 달라진다(제목 줄도 함께 밀려 올라간다). */}
        <aside className="relative min-w-0 flex-1">
          {/* 안을 통째로 띄운다(`absolute inset-0`) — 이 칸이 자기 내용으로 높이를 주장하지 않게
              하려는 것이다. 그냥 두면 일정이 열두 건인 날에 **우측이 좌측 달력보다 길어지며 줄 전체를
              키우고**, 달력 칸은 뷰포트로 고정돼 있으니 카드 아래에 빈자리만 생기고 페이지에는
              스크롤이 붙는다. 띄워 두면 줄 높이는 언제나 좌측 카드가 정하고 이 칸은 거기에 맞춰
              잘린 뒤 안에서 스크롤한다 — '좌측과 같은 높이'가 규칙이 아니라 구조가 된다. */}
          <PanelCard
            className="absolute inset-0 flex flex-col"
            bodyClassName="min-h-0 flex-1 overflow-y-auto"
            title={`${selected.format('M월 D일')} (${WEEKDAYS[selected.day()]})`}
            count={view.selectedEvents.length}
          >
            {view.isLoading ? <Spinner /> : <DayAgenda events={view.selectedEvents} onEdit={view.openEdit} />}
          </PanelCard>
        </aside>
      </div>

      <EventEditorModal
        open={view.editorOpen}
        dateKey={view.selected}
        event={view.editTarget}
        onClose={view.closeEditor}
      />
    </div>
  )
}
