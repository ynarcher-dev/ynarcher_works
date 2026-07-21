import { ChevronRight } from 'lucide-react'
import { Link } from 'react-router-dom'

export interface TopbarBreadcrumbProps {
  /** 현재 워크스페이스 표기명(예: `OFFICE`). */
  workspaceLabel: string
  /** 워크스페이스 루트 경로. 워크스페이스명 클릭 시 이동한다. */
  workspacePath: string
  /** 현재 사이드바 메뉴(섹션) 라벨. 없으면 워크스페이스명만 표시한다. */
  sectionLabel?: string
}

/**
 * 상단바 좌측 현재 위치 표시(워크스페이스 › 섹션).
 * 사이드바가 "어디로 갈 수 있는가"를, 상단바가 "지금 어디인가"를 담당한다.
 * 근거: 2_app_layout_navigation.md §2
 */
export function TopbarBreadcrumb({
  workspaceLabel,
  workspacePath,
  sectionLabel,
}: TopbarBreadcrumbProps) {
  return (
    <nav
      aria-label="현재 위치"
      // 모바일에서는 햄버거 옆 공간이 좁아 워크스페이스명만 남긴다(섹션은 sm 이상에서 노출).
      className="flex min-w-0 items-center gap-1.5"
    >
      <Link
        to={workspacePath}
        className="shrink-0 rounded-radius-md px-1 text-body font-semibold tracking-tight text-gray-900 transition-colors duration-fast hover:text-brand focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand/10"
      >
        {workspaceLabel}
      </Link>
      {sectionLabel && (
        <span className="hidden min-w-0 items-center gap-1.5 sm:flex">
          <ChevronRight aria-hidden className="size-4 shrink-0 text-gray-400" />
          <span className="truncate text-body text-gray-600">{sectionLabel}</span>
        </span>
      )}
    </nav>
  )
}
