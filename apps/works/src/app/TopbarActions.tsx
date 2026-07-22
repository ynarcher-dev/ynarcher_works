import { cn } from '@ynarcher/ui'
import { Bell, CalendarDays } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { hasWorkspaceRead, useAuthStore } from '@/auth/authStore'
import { useNotifications } from '@/features/notifications/notificationHooks'
import { useRightPanel, type RightPanelKey } from '@/app/rightPanel'

/**
 * 상단바 아이콘 버튼 공통 규격(40px 정사각, 흰 배경 위 회색 아이콘).
 * 좌측의 사이드바 접기 토글도 이 규격을 써서 상단바 양 끝 버튼의 크기·여백을 일치시킨다.
 */
export const topbarIconButton = cn(
  'flex size-10 shrink-0 items-center justify-center rounded-radius-md text-gray-500',
  'transition-colors duration-fast hover:bg-gray-100 hover:text-gray-900',
  'focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand/10',
)

/**
 * 전역 진입점(OFFICE 권한 필요, 없으면 감춘다). 페이지 이동이 아니라 우측 슬라이드오버를
 * 토글한다. AI 에이전트는 아이콘만으로 읽히지 않아 "AI" 글자를 얹고, 버튼 크기는 옆의 아이콘
 * 버튼과 같은 40px 정사각을 유지한다.
 */
const QUICK_LINKS: { label: string; icon?: LucideIcon; key: RightPanelKey; text?: string }[] = [
  { label: 'AI 에이전트', key: 'ai', text: 'AI' },
  { label: '전사 캘린더', icon: CalendarDays, key: 'calendar' },
]

/**
 * 상단바 우측 전역 액션 — AI·캘린더·알림 진입점. 셋 다 우측 슬라이드오버(RightPanelHost)를
 * 여는 토글이며, 하나를 열면 나머지는 닫힌다(단일 활성). 상단바는 패널보다 z가 높아 패널을 연
 * 채로도 다른 진입점으로 전환할 수 있다. 워크스페이스 전환·계정 메뉴는 사이드바 소관.
 */
export function TopbarActions() {
  const user = useAuthStore((s) => s.user)
  const canOffice = hasWorkspaceRead(user, 'office')
  const { active, toggle } = useRightPanel()

  // 종 배지용 미읽음 수(목록 본문은 NotificationList가 조회한다 — 같은 queryKey라 캐시 공유).
  const { data: notifications } = useNotifications()
  const unread = (notifications ?? []).filter((n) => n.read_at == null).length

  return (
    <div className="flex items-center gap-1">
      {canOffice &&
        QUICK_LINKS.map(({ label, icon: Icon, key, text }) => (
          <button
            key={key}
            type="button"
            aria-label={label}
            title={label}
            aria-pressed={active === key}
            onClick={() => toggle(key)}
            // 모바일에서는 햄버거·검색과 경합하므로 아이콘 진입점은 sm 이상에서만 노출한다.
            className={cn(
              topbarIconButton,
              'hidden sm:flex',
              active === key && 'bg-gray-100 text-gray-900',
            )}
          >
            {Icon ? (
              <Icon aria-hidden className="size-5" strokeWidth={1.8} />
            ) : (
              <span aria-hidden className="text-body font-bold tracking-tight">
                {text}
              </span>
            )}
          </button>
        ))}
      <button
        type="button"
        aria-label={unread > 0 ? `알림 ${unread}건` : '알림'}
        title="알림"
        aria-pressed={active === 'notifications'}
        onClick={() => toggle('notifications')}
        className={cn(
          topbarIconButton,
          'relative',
          active === 'notifications' && 'bg-gray-100 text-gray-900',
        )}
      >
        <Bell aria-hidden className="size-5" strokeWidth={1.8} />
        {unread > 0 && (
          // 미읽음 배지(9건 초과는 9+). 종 아이콘 우상단에 겹친다.
          <span className="absolute right-1.5 top-1.5 flex min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[0.625rem] font-bold leading-4 text-white">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>
    </div>
  )
}
