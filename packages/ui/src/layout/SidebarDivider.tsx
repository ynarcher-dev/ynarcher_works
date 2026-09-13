import { cn } from '../utils/cn'

export interface SidebarDividerProps {
  /** 접힘 상태에서는 좌우 들여쓰기를 줄여 아이콘 열 폭에 맞춘다. */
  collapsed?: boolean
  /** 펼침 상태에서 선 앞에 표시할 메뉴 그룹명. */
  label?: string
  className?: string
}

/**
 * 사이드바 구분선(그룹 경계·항목 구분 공용). 그룹명이 있으면 `그룹명 ───` 형태로 그린다.
 *
 * 부모가 `flex flex-col gap-1`(0.25rem) 리스트라는 전제에서, 자체 `my-2`(0.5rem)와
 * 부모 gap이 상하로 더해져 항상 **0.75rem 대칭** 여백을 냅니다.
 * 인디고 사이드바 배경(`bg-brand-700`) 위 저대비 라인(`border-white/15`) 기준입니다.
 */
export function SidebarDivider({ collapsed = false, label, className }: SidebarDividerProps) {
  if (label && !collapsed) {
    return (
      <div
        role="separator"
        aria-label={label}
        className={cn('mx-3 my-2 flex items-center gap-2', className)}
      >
        <span className="shrink-0 text-caption font-medium text-white/70">
          {label}
        </span>
        <span aria-hidden className="h-px flex-1 bg-white/15" />
      </div>
    )
  }

  return (
    <div
      role="separator"
      aria-label={label}
      className={cn(
        'my-2 border-t border-white/15',
        collapsed ? 'mx-1' : 'mx-3',
        className,
      )}
    />
  )
}
