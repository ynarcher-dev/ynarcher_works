import { Dropdown, cn } from '@ynarcher/ui'
import { Bell, CalendarDays } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { hasWorkspaceRead, useAuthStore } from '@/auth/authStore'
import { MenuSectionLabel } from '@/app/SidebarFlyout'

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
        className="w-64"
        trigger={
          <button
            type="button"
            aria-label="알림"
            title="알림"
            onClick={() => setNotifOpen((v) => !v)}
            className={topbarIconButton}
          >
            <Bell aria-hidden className="size-5" strokeWidth={1.8} />
          </button>
        }
      >
        <MenuSectionLabel>알림</MenuSectionLabel>
        {/* 알림 원장·구독 모델이 아직 없다. 배지·건수를 임의로 표시하지 않고 상태를 그대로 밝힌다. */}
        <p className="px-3 py-2 text-body text-gray-500">
          알림 기능은 준비 중입니다.
        </p>
      </Dropdown>
    </div>
  )
}
