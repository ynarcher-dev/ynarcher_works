import { Dropdown, cn } from '@ynarcher/ui'
import { Bell, CalendarDays } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { hasWorkspaceRead, useAuthStore } from '@/auth/authStore'
import { MenuSectionLabel } from '@/app/SidebarFlyout'
import {
  useMarkAllNotificationsRead,
  useMarkNotificationRead,
  useNotifications,
  type Notification,
} from '@/features/notifications/notificationHooks'
import { notificationRoute } from '@/features/notifications/notificationRoute'

function formatWhen(v: string): string {
  return v.length >= 16 ? v.slice(5, 16).replace('T', ' ') : v.slice(0, 10)
}

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
 * OFFICE 안에 있는 전역 기능 바로가기(권한이 없으면 통째로 감춘다).
 * AI 에이전트는 반짝임(Sparkles) 아이콘만으로는 무슨 기능인지 읽히지 않아 "AI" 글자를 그대로
 * 얹는다. 버튼 크기는 옆의 아이콘 버튼과 같은 40px 정사각을 유지한다.
 */
const QUICK_LINKS: { label: string; icon?: LucideIcon; to: string; text?: string }[] = [
  { label: 'AI 에이전트', to: '/office?tab=ai', text: 'AI' },
  { label: '전사 캘린더', icon: CalendarDays, to: '/office?tab=calendar' },
]

/**
 * 상단바 우측 전역 액션 — OFFICE 바로가기 + 알림.
 * 워크스페이스 전환·계정 메뉴는 사이드바가 담당하므로 여기서 중복 노출하지 않는다.
 */
export function TopbarActions() {
  const user = useAuthStore((s) => s.user)
  const navigate = useNavigate()
  const [notifOpen, setNotifOpen] = useState(false)
  const canOffice = hasWorkspaceRead(user, 'office')

  const { data: notifications } = useNotifications()
  const markRead = useMarkNotificationRead()
  const markAllRead = useMarkAllNotificationsRead()
  const list = notifications ?? []
  const unread = list.filter((n) => n.read_at == null).length

  /** 알림 클릭: 읽음 처리 후 대상 상세로 이동(경로가 없으면 이동 생략). */
  const openNotification = (n: Notification) => {
    if (n.read_at == null) markRead.mutate(n.id)
    const to = notificationRoute(n.target_type, n.target_id)
    setNotifOpen(false)
    if (to) navigate(to)
  }

  return (
    <div className="flex items-center gap-1">
      {canOffice &&
        QUICK_LINKS.map(({ label, icon: Icon, to, text }) => (
          <button
            key={to}
            type="button"
            aria-label={label}
            title={label}
            onClick={() => navigate(to)}
            // 모바일에서는 햄버거·검색과 경합하므로 아이콘 바로가기는 sm 이상에서만 노출한다.
            className={cn(topbarIconButton, 'hidden sm:flex')}
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
      <Dropdown
        open={notifOpen}
        onClose={() => setNotifOpen(false)}
        align="right"
        className="w-80"
        trigger={
          <button
            type="button"
            aria-label={unread > 0 ? `알림 ${unread}건` : '알림'}
            title="알림"
            onClick={() => setNotifOpen((v) => !v)}
            className={cn(topbarIconButton, 'relative')}
          >
            <Bell aria-hidden className="size-5" strokeWidth={1.8} />
            {unread > 0 && (
              // 미읽음 배지(9건 초과는 9+). 종 아이콘 우상단에 겹친다.
              <span className="absolute right-1.5 top-1.5 flex min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[0.625rem] font-bold leading-4 text-white">
                {unread > 9 ? '9+' : unread}
              </span>
            )}
          </button>
        }
      >
        <div className="flex items-center justify-between pr-1">
          <MenuSectionLabel>알림</MenuSectionLabel>
          {unread > 0 && (
            <button
              type="button"
              onClick={() => markAllRead.mutate()}
              className="px-2 py-1 text-caption text-gray-500 hover:text-gray-900"
            >
              모두 읽음
            </button>
          )}
        </div>
        {list.length === 0 ? (
          <p className="px-3 py-2 text-body text-gray-500">받은 알림이 없습니다.</p>
        ) : (
          <ul className="max-h-96 overflow-auto">
            {list.map((n) => (
              <li key={n.id}>
                <button
                  type="button"
                  onClick={() => openNotification(n)}
                  className={cn(
                    'flex w-full flex-col gap-0.5 px-3 py-2 text-left hover:bg-gray-50',
                    n.read_at == null && 'bg-brand/5',
                  )}
                >
                  <span className="flex items-center gap-1.5">
                    {n.read_at == null && (
                      <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-brand" />
                    )}
                    <span className="text-body text-gray-900">
                      <b className="font-semibold">{n.actor_name ?? '누군가'}</b>님이 코멘트에서 회원님을
                      언급했습니다.
                    </span>
                  </span>
                  {n.body_preview && (
                    <span className="line-clamp-2 text-caption text-gray-500">{n.body_preview}</span>
                  )}
                  <span className="text-caption tabular-nums text-gray-400">
                    {formatWhen(n.created_at)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Dropdown>
    </div>
  )
}
