import { Dropdown, DropdownItem, cn } from '@ynarcher/ui'
import { CircleUserRound, LogOut, UserRound } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { guestAuth } from '@/auth/guestAuthService'
import { useGuestStore } from '@/auth/guestStore'

/**
 * 상단바 우측 개인 메뉴 — WORKS와 같은 자리·같은 모양(뱃지 + 이름)으로 세운다.
 *
 * 로그아웃이 사이드바 바닥에 있던 시절에는 "지금 누구로 들어와 있는가"가 화면 반대편 구석에
 * 흩어져 있었다. WORKS 사용자가 이미 익힌 규칙(오른쪽 위 = 나)을 그대로 따르고, 누르면
 * 마이페이지와 로그아웃이 한 메뉴에서 열린다.
 *
 * 버튼 규격은 WORKS TopbarActions의 개인 메뉴 버튼과 같은 조합이되, 높이만 GUEST 터치
 * 하한(48px, 3_9_workspace_guest.md §3)으로 올린다.
 */
const topbarUserButton = cn(
  'flex min-h-12 shrink-0 items-center justify-center gap-2 rounded-radius-md px-2.5',
  'border border-transparent text-gray-500',
  'transition-colors duration-fast hover:bg-gray-100 hover:text-gray-800',
  'focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand/10',
)

export function GuestUserMenu() {
  const navigate = useNavigate()
  const user = useGuestStore((s) => s.user)
  const [open, setOpen] = useState(false)

  const go = (path: string) => {
    setOpen(false)
    navigate(path)
  }

  return (
    <Dropdown
      open={open}
      onClose={() => setOpen(false)}
      align="right"
      trigger={
        <button
          type="button"
          aria-label="개인 메뉴"
          aria-haspopup="menu"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
          className={cn(topbarUserButton, open && 'bg-gray-100 text-gray-800')}
        >
          <CircleUserRound aria-hidden className="size-5 shrink-0" strokeWidth={1.8} />
          {/* 이름이 곧 이 자리의 설명이다(계정 확인 겸용). 길어도 상단바를 밀지 않게 자른다. */}
          <span className="max-w-32 truncate text-body font-medium">
            {user?.name || '개인 메뉴'}
          </span>
        </button>
      }
    >
      <DropdownItem className="min-h-12" onClick={() => go('/me')}>
        <span className="flex items-center gap-2 whitespace-nowrap">
          <UserRound aria-hidden className="size-4 shrink-0 text-gray-400" />
          마이페이지
        </span>
      </DropdownItem>
      <DropdownItem className="min-h-12" onClick={() => guestAuth.signOut()}>
        <span className="flex items-center gap-2 whitespace-nowrap">
          <LogOut aria-hidden className="size-4 shrink-0 text-gray-400" />
          로그아웃
        </span>
      </DropdownItem>
    </Dropdown>
  )
}
