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

/**
 * 알림 유형별 한 줄 — 무슨 일이 있었나.
 *
 * 문구를 유형(`type`)으로 고르고 본문(`body_preview`)을 읽어 판정하지 않는다. 본문은 물품명·
 * 기간처럼 사람이 읽을 값이지 기계가 갈라야 할 값이 아니며, 파싱으로 결과를 알아내는 목록은
 * 값이 조금만 바뀌어도 '승인'을 '반려'로 읽는다. 그래서 승인과 반려는 유형부터 갈라 둔다.
 */
function headline(type: string): string {
  switch (type) {
    case 'checkout_request':
      return '님이 물품 반출 승인을 요청했습니다.'
    case 'checkout_approved':
      return '님이 반출 요청을 승인했습니다.'
    case 'checkout_rejected':
      return '님이 반출 요청을 반려했습니다.'
    default:
      return '님이 코멘트에서 회원님을 언급했습니다.'
  }
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
                    <b className="font-semibold">{n.actor_name ?? '누군가'}</b>
                    {headline(n.type)}
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
