import type { ReactNode } from 'react'
import { cn } from '../utils/cn'

export interface SidebarProps {
  header?: ReactNode
  /** 헤더 바로 아래에 고정되는 영역(워크스페이스 스위처 등). 스크롤과 무관하게 항상 보인다. */
  subheader?: ReactNode
  children: ReactNode
  /** 스크롤 영역 아래 고정되는 하단 영역. 목록이 길어져도 항상 보인다. */
  footer?: ReactNode
  className?: string
  collapsed?: boolean
}

/**
 * 사이드바 컨테이너(브랜드 인디고 배경 표준). 근거: 2_app_layout_navigation.md
 *
 * 배경은 브랜드 인디고 한 단계(`brand.700`) **단색**이다. 한때 `brand.600`→`700`→`800`
 * 세로 그라디언트로 깊이를 줬는데, 화면 왼쪽 끝에서 위아래로 밝기가 변하는 면이 생기면서
 * 그 위에 얹히는 흰 pill·구분선의 대비가 자리마다 달라졌다 — 같은 메뉴 항목이 상단에서는
 * 또렷하고 하단에서는 묻힌다. 배경은 균일한 바탕으로 두고 위계는 항목 쪽(흰 pill·인디케이터
 * 바)이 만든다(2026-08-20).
 */
export function Sidebar({
  header,
  subheader,
  children,
  footer,
  className,
  collapsed = false,
}: SidebarProps) {
  return (
    <nav
      className={cn(
        'flex h-full flex-col border-r border-white/15 transition-[width] duration-300 ease-in-out',
        'bg-brand-700',
        collapsed ? 'w-16' : 'w-60',
        className,
      )}
    >
      {/* 접힘 상태에서도 헤더 자리는 남긴다 — 높이(h-16)가 상단바와 같아, 접혔다고 없애면
          사이드바 첫 메뉴가 상단바보다 위로 올라온다. 무엇을 감출지는 header를 주입하는 앱이 결정한다. */}
      {header && (
        <div
          // 좌우 여백은 메뉴 목록·워크스페이스 스위처와 같은 px-2 가로 격자를 쓴다.
          // 헤더만 px-4를 쓰면 로고가 그 아래 메뉴들과 어긋난 선에서 시작한다.
          className={cn(
            'flex h-16 items-center px-2',
            collapsed && 'justify-center',
          )}
        >
          {header}
        </div>
      )}
      {subheader && <div className="px-2 pb-2">{subheader}</div>}
      <div className="flex-1 space-y-1 overflow-y-auto px-2 py-2">
        {children}
      </div>
      {footer && (
        <div className="border-t border-white/15 px-2 py-2">{footer}</div>
      )}
    </nav>
  )
}
