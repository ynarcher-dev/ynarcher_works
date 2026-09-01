import {
  Card,
  PageHeader,
  ScheduleBoard,
  Spinner,
  ViewToggleGroup,
  type ScheduleView,
} from '@ynarcher/ui'
import {
  MODULE_STATUS_BAR_CLASS,
  MODULE_STATUS_TONE,
  MODULE_STATUS_COLUMNS,
  moduleDisplayName,
  moduleStatusLabel,
  readModuleSettings,
} from '@ynarcher/master-data'
import { ChartGantt, SquareKanban } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useGuestModules } from '@/features/moduleHooks'
import { modulePath } from '@/config/navigation'

/**
 * 게스트 쪽 뷰는 **칸반·간트 둘**이다(2026-09-01 사용자 지정 — WORKS 일정안내 탭은 캘린더까지
 * 셋을 유지한다). 참여자가 묻는 것은 '이번 달 며칠에 무엇이 있나'보다 '지금 무엇이 열려 있고
 * 언제 끝나나'에 가깝고, 그 물음에 답하는 축은 시간(간트)과 단계(칸반)다. 달력은 하루 한 칸이
 * 좁아 행사명을 담지 못해 날짜를 눌러야 비로소 답하는데, 그 한 번을 거치지 않아도 되는
 * 그림이 이미 둘 있다.
 */
const VIEWS = [
  { key: 'gantt' as const, label: '간트', icon: <ChartGantt className="size-4" /> },
  { key: 'kanban' as const, label: '칸반', icon: <SquareKanban className="size-4" /> },
]

/**
 * 일정안내 — 고정 메뉴 세 번째 줄. **사이드바에 선 메뉴들의 기간**을 간트·칸반으로 보여 준다.
 * WORKS 사업 상세의 일정안내 탭과 같은 부품을 쓰되 게스트는 두 뷰만 서고(WORKS는 캘린더까지 셋)
 * 기본은 간트다. 담기는 것은 행사명·설명·날짜 셋뿐이다.
 *
 * 목록의 출처가 사이드바와 같다는 점이 이 화면의 요지다 — 담당자가 WORKS에서 메뉴의
 * 공유범위를 WORKS+GUEST로 올리고 기간을 넣으면 그 메뉴가 사이드바에 서고 여기 일정에도
 * 함께 선다. 무엇이 공개인지의 판정은 RLS(app.guest_module_ids())가 하며, 화면은 돌아온
 * 것을 그린다(별도 일정 원장이 없으므로 두 목록이 어긋날 여지도 없다).
 * 일정을 누르면 그 메뉴 화면으로 넘어간다.
 */
export function SchedulePage() {
  const navigate = useNavigate()
  const { data: modules, isLoading } = useGuestModules()
  const [view, setView] = useState<ScheduleView>('gantt')

  if (isLoading) return <Spinner />

  const events = (modules ?? []).map((mod) => {
    const settings = readModuleSettings(mod.settings)
    return {
      id: mod.id,
      title: moduleDisplayName(mod),
      description: settings.memo ?? null,
      start: settings.start_date ?? null,
      end: settings.end_date ?? null,
      status: mod.status ?? 'DRAFT',
      // 제목 옆 상태 태그 — 프로그램 탭 간트와 같은 말·같은 색(라벨·톤은 공통 어휘 소유).
      statusLabel: moduleStatusLabel(mod.status),
      statusTone: MODULE_STATUS_TONE[mod.status ?? 'DRAFT'] ?? 'neutral',
      barClass: MODULE_STATUS_BAR_CLASS[mod.status ?? 'DRAFT'],
      onClick: () => navigate(modulePath(mod.id)),
    }
  })

  return (
    <div className="space-y-5">
      <PageHeader title="일정안내" />
      {/* 이 화면은 공지·사업개요의 2:1 분할을 쓰지 않고 전체 폭으로 선다 — 간트 축은 폭이 곧
          정보량이라, 3분의 2 칸에 넣으면 눈금만 보이고 막대는 뭉갠다. 곁칸에 세울 것도
          없다(상세는 메뉴 화면으로 넘어가 열린다). */}
      <Card
        title="공유된 일정"
        count={events.length}
        actions={<ViewToggleGroup options={VIEWS} value={view} onChange={setView} />}
      >
        <ScheduleBoard
          events={events}
          view={view}
          columns={[...MODULE_STATUS_COLUMNS]}
          emptyText="아직 공유된 일정이 없습니다."
        />
      </Card>
    </div>
  )
}
