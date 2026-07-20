import type { ReactNode } from 'react'
import { cn } from '../utils/cn'

export interface SidebarProps {
  header?: ReactNode
  /** 헤더 바로 아래에 고정되는 영역(워크스페이스 스위처 등). 스크롤과 무관하게 항상 보인다. */
  subheader?: ReactNode
  children: ReactNode
  /** 스크롤 영역 아래 고정되는 하단 영역(계정 메뉴 등). 목록이 길어져도 항상 보인다. */
  footer?: ReactNode
  className?: string
  collapsed?: boolean
}

/**
 * 사이드바 컨테이너(딥 네이비 배경 표준). 근거: 2_app_layout_navigation.md
 *
 * 배경은 브랜드 액센트와 같은 계열의 심도 단계를 위에서 아래로 잇는 세로 그라디언트
 * (`brand.600` → `brand.700` → `brand.800`)를 쓴다. 이전에는 본문 텍스트용 중간 명도
 * (`gray.600`) 단색을 배경으로 써서, 그 위의 반투명 흰 글씨가 배경과 섞여 메뉴 전체가
 * 뿌옇게 보이는 문제가 있었다. 배경을 충분히 어둡게 내리고 글자를 불투명 흰색으로 올려 해소하되,
 * 단색 딥 네이비가 답답해 보이지 않도록 상단을 한 단계 밝게 띄워 깊이를 준다.
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
        'bg-gradient-to-b from-brand-600 via-brand-700 to-brand-800',
        collapsed ? 'w-16' : 'w-60',
        className,
      )}
    >
      {/* 접힘 상태에서도 헤더는 렌더링한다 — 접기 토글이 헤더 안에 있어, 여기서 통째로 숨기면
          다시 펼 수단이 사라진다. 접힘 시 무엇을 감출지는 header를 주입하는 앱이 결정한다. */}
      {header && (
        <div
          className={cn(
            'flex h-16 items-center',
            collapsed ? 'justify-center px-2' : 'px-4',
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
