import { cn } from '@ynarcher/ui'
import { useNavigate } from 'react-router-dom'
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

export interface NotificationListProps {
  /** 알림을 눌러 대상으로 이동한 뒤 호출(패널 닫기 등). */
  onNavigate?: () => void
}

/**
 * 알림 목록(우측 슬라이드오버 본문). 조회·읽음 처리 훅과 대상 라우팅을 담고,
 * 표시 마크업만 렌더한다. 상단바 버튼의 미읽음 배지는 호출부(TopbarActions)가 담당한다.
 */
export function NotificationList({ onNavigate }: NotificationListProps) {
  const navigate = useNavigate()
  const { data: notifications } = useNotifications()
  const markRead = useMarkNotificationRead()
  const markAllRead = useMarkAllNotificationsRead()

  const list = notifications ?? []
  const unread = list.filter((n) => n.read_at == null).length

  /** 알림 클릭: 읽음 처리 후 대상 상세로 이동(경로가 없으면 이동 생략). */
  const openNotification = (n: Notification) => {
    if (n.read_at == null) markRead.mutate(n.id)
    const to = notificationRoute(n.target_type, n.target_id)
    onNavigate?.()
    if (to) navigate(to)
  }

  return (
    <div className="flex h-full flex-col">
      {unread > 0 && (
        <div className="flex shrink-0 items-center justify-end border-b border-gray-100 px-4 py-2">
          <button
            type="button"
            onClick={() => markAllRead.mutate()}
            className="px-2 py-1 text-caption text-gray-500 transition-colors duration-fast hover:text-gray-900"
          >
            모두 읽음
          </button>
        </div>
      )}
      {list.length === 0 ? (
        <p className="px-4 py-6 text-body text-gray-500">받은 알림이 없습니다.</p>
      ) : (
        <ul className="min-h-0 flex-1 overflow-auto">
          {list.map((n) => (
            <li key={n.id}>
              <button
                type="button"
                onClick={() => openNotification(n)}
                className={cn(
                  'flex w-full flex-col gap-0.5 border-b border-gray-50 px-4 py-3 text-left hover:bg-gray-50',
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
    </div>
  )
}
