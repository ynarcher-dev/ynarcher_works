import { SlideOver } from '@ynarcher/ui'
import { X } from 'lucide-react'
import { AiAgentPanel } from '@/features/hub/AiAgentPanel'
import { CalendarPanel } from '@/features/hub/CalendarPanel'
import { NotificationList } from '@/features/notifications/NotificationList'
import { useRightPanel, type RightPanelKey } from '@/app/rightPanel'

const TITLES: Record<RightPanelKey, string> = {
  ai: 'AI 에이전트',
  calendar: '전사 캘린더',
  notifications: '알림',
}

/**
 * 전역 우측 패널 호스트 — `RightPanelProvider`의 활성 키에 따라 슬라이드오버 안에
 * 해당 진입점(AI·캘린더·알림)을 렌더한다. 각 내용 컴포넌트는 OFFICE 탭에서 쓰던 것을
 * 그대로 재사용하고, 여기서는 공통 프레임(제목 + 닫기 + 스크롤 본문)만 씌운다.
 */
export function RightPanelHost() {
  const { active, close } = useRightPanel()
  const title = active ? TITLES[active] : undefined

  return (
    <SlideOver open={active != null} onClose={close} label={title}>
      <header className="flex shrink-0 items-center justify-between border-b border-gray-100 px-4 py-3">
        <h2 className="text-title-sm font-medium text-gray-900">{title}</h2>
        <button
          type="button"
          onClick={close}
          aria-label="패널 닫기"
          className="flex size-8 items-center justify-center rounded-radius-md text-gray-500 transition-colors duration-fast hover:bg-gray-100 hover:text-gray-900 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand/10"
        >
          <X aria-hidden className="size-5" strokeWidth={1.8} />
        </button>
      </header>

      {active === 'ai' && (
        <div className="min-h-0 flex-1 overflow-hidden p-4">
          <AiAgentPanel />
        </div>
      )}
      {active === 'calendar' && (
        <div className="flex min-h-0 flex-1 flex-col p-4">
          <CalendarPanel />
        </div>
      )}
      {active === 'notifications' && (
        <div className="min-h-0 flex-1 overflow-hidden">
          <NotificationList onNavigate={close} />
        </div>
      )}
    </SlideOver>
  )
}
