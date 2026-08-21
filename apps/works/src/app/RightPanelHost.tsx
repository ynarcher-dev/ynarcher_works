import { IconButton, SlideOver } from '@ynarcher/ui'
import { X } from 'lucide-react'
import { AiAgentPanel } from '@/features/hub/AiAgentPanel'
import { CalendarPanel } from '@/features/hub/CalendarPanel'
import { PersonalPanel } from '@/features/hub/dashboard/PersonalPanel'
import { NotificationList } from '@/features/notifications/NotificationList'
import { QuickMemoPanel } from '@/features/quick-memo/QuickMemoPanel'
import { useRightPanel, type RightPanelKey } from '@/app/rightPanel'

const TITLES: Record<RightPanelKey, string> = {
  memo: '퀵 메모',
  me: '개인 메뉴',
  ai: 'AI 에이전트',
  calendar: '전사 캘린더',
  notifications: '알림',
}

/**
 * 전역 우측 패널 호스트 — `RightPanelProvider`의 활성 키에 따라 슬라이드오버 안에
 * 해당 진입점(개인 메뉴·AI·캘린더·알림)을 렌더한다. 각 내용 컴포넌트는 OFFICE 화면에서 쓰던
 * 것을 그대로 재사용하고, 여기서는 공통 프레임(제목 + 닫기 + 스크롤 본문)만 씌운다.
 */
export function RightPanelHost() {
  const { active, close } = useRightPanel()
  const title = active ? TITLES[active] : undefined

  return (
    <SlideOver open={active != null} onClose={close} label={title}>
      <header className="flex shrink-0 items-center justify-between border-b border-gray-100 px-4 py-3">
        <h2 className="text-title-sm font-medium text-gray-900">{title}</h2>
        <IconButton
          variant="ghost"
          label="패널 닫기"
          onClick={close}
          icon={<X aria-hidden className="size-5" strokeWidth={1.8} />}
        />
      </header>

      {/* 개인 메뉴 — 대시보드 우측 열과 같은 한 벌(인사말·근무체크·전자결재). 어느 페이지에 있든
          OFFICE로 돌아가지 않고 출퇴근을 찍고 결재함을 확인하기 위한 자리라, 카드 셋이 세로로
          이어지는 만큼 본문은 세로 스크롤을 갖는다. */}
      {active === 'me' && (
        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          <PersonalPanel onNavigate={close} />
        </div>
      )}
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
      {active === 'memo' && (
        <div className="min-h-0 flex-1 overflow-hidden">
          <QuickMemoPanel />
        </div>
      )}
    </SlideOver>
  )
}
