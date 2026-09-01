import { Card, ScheduleBoard, Spinner, ViewToggleGroup, type ScheduleView } from '@ynarcher/ui'
import {
  MODULE_STATUS_BAR_CLASS,
  MODULE_STATUS_COLUMNS,
  isGuestSharedModule,
  moduleDisplayName,
  readModuleSettings,
} from '@ynarcher/master-data'
import { CalendarDays, ChartGantt, ChevronLeft, ChevronRight, SquareKanban } from 'lucide-react'
import { useState } from 'react'
import { useProgramModules, type ProgramModule } from '@/features/program/hooks'

const VIEWS = [
  { key: 'calendar' as const, label: '캘린더', icon: <CalendarDays className="size-4" /> },
  { key: 'kanban' as const, label: '칸반', icon: <SquareKanban className="size-4" /> },
  { key: 'gantt' as const, label: '간트', icon: <ChartGantt className="size-4" /> },
]

/**
 * 일정안내 탭 — **공유범위가 WORKS+GUEST(또는 전체공개)인 메뉴들의 기간**을 캘린더·칸반·간트로
 * 보여 준다. 담고 있는 것은 행사명·설명·날짜 셋뿐이다.
 *
 * 원장을 새로 두지 않는다. 일정은 이미 프로그램 탭에서 담당자가 메뉴마다 세팅한 값
 * (settings의 시작/종료일과 메모)이고, 공유 여부도 이미 메뉴의 공유범위가 답한다 — 같은
 * 사실을 옮겨 적는 원장을 하나 더 두면 둘이 어긋났을 때 어느 쪽이 진짜인지 판정할 근거가
 * 없다. **여기는 세팅하는 자리가 아니라 그 세팅이 게스트에게 어떻게 보이는지 확인하는
 * 자리다**(수정은 프로그램 탭에서 한다).
 *
 * 화면 부품(ScheduleBoard)은 GUEST 일정안내 메뉴와 같은 것을 쓴다 — 담당자가 여기서 보는
 * 그림이 곧 참여자가 보는 그림이어야 확인하는 의미가 있다.
 */
export function ProgramSchedulePanel({
  programId,
  onOpenModule,
}: {
  programId: string
  onOpenModule: (module: ProgramModule) => void
}) {
  const { data: modules = [], isLoading } = useProgramModules(programId)
  const [view, setView] = useState<ScheduleView>('calendar')

  // 게스트에게 공유된 메뉴만. 판정 기준은 화면이 아니라 공통 어휘가 소유한다 —
  // GUEST 쪽 RLS와 같은 기준이어야 두 화면의 목록이 어긋나지 않는다.
  const shared = modules.filter(isGuestSharedModule)
  const events = shared.map((mod) => {
    const settings = readModuleSettings(mod.settings)
    return {
      id: mod.id,
      title: moduleDisplayName(mod),
      description: settings.memo ?? null,
      start: settings.start_date ?? null,
      end: settings.end_date ?? null,
      status: mod.status ?? 'DRAFT',
      barClass: MODULE_STATUS_BAR_CLASS[mod.status ?? 'DRAFT'],
      onClick: () => onOpenModule(mod),
    }
  })

  return (
    <Card
      title="일정안내"
      count={events.length}
      actions={<ViewToggleGroup options={VIEWS} value={view} onChange={setView} />}
    >
      {isLoading ? (
        <Spinner />
      ) : (
        <ScheduleBoard
          events={events}
          view={view}
          columns={[...MODULE_STATUS_COLUMNS]}
          emptyText="게스트에게 공유된 메뉴가 없습니다. 프로그램 탭에서 메뉴의 공유범위를 WORKS+GUEST로 올리면 여기에 일정이 섭니다."
          prevIcon={<ChevronLeft className="size-4" />}
          nextIcon={<ChevronRight className="size-4" />}
        />
      )}
    </Card>
  )
}
