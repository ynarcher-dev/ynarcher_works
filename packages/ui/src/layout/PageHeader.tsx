import type { ReactNode } from 'react'
import { cn } from '../utils/cn'

export interface PageHeaderProps {
  /** 
   * 뒤로가기 링크/요소.
   * 제공되지 않아도 `min-h-6` 높이를 확보하여 상단 여백의 일관성을 제공합니다.
   */
  back?: ReactNode
  /** 페이지 제목(메뉴명) */
  title: ReactNode
  /** 타이틀 우측에 표시될 배지 등의 부가 요소 */
  titleExtra?: ReactNode
  /** 검색 필드 영역 */
  search?: ReactNode
  /** 액션 버튼 영역 */
  actions?: ReactNode
  /** 타이틀 하단의 부가 설명 */
  description?: ReactNode
  /**
   * 헤더와 본문을 가르는 하단 구분선. **기본 노출**이며, 모든 화면이
   * `메뉴명 → 구분선 → 콘텐츠` 구조를 갖도록 강제하기 위한 것이다.
   * 구분선이 어울리지 않는 예외 화면에서만 `divider={false}`로 끈다.
   */
  divider?: boolean
  className?: string
}

/**
 * 페이지 상단 헤더(메뉴명 + 선택적 검색·액션).
 *
 * 구분선을 컴포넌트가 직접 그린다. 이전에는 일부 화면만 `border-b ...`를 손으로 감싸고 있어
 * 같은 리스트뷰인데도 화면마다 구성이 달랐다. 기본값을 켠 상태로 두어 새 화면도 별도 조치 없이
 * 동일한 구조를 따르게 한다.
 */
export function PageHeader({
  back,
  title,
  titleExtra,
  search,
  actions,
  description,
  divider = true,
  className,
}: PageHeaderProps) {
  return (
    <div className={cn('flex flex-col', className)}>
      {/* 구분선 위: 뒤로가기 + 메뉴명만 둔다. */}
      <div
        className={cn(
          'flex flex-col gap-4',
          divider && 'border-b border-gray-200 pb-4',
        )}
      >
        {/* 뒤로가기 영역 (있을 때만 렌더링) */}
        {back && (
          <div className="flex items-center min-h-[1.5rem]">
            {back}
          </div>
        )}

        {/* 메뉴명 및 배지 */}
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-title-lg font-bold text-gray-900">{title}</h1>
            {titleExtra}
          </div>
          {description && (
            <p className="mt-1 text-caption text-gray-600">{description}</p>
          )}
        </div>
      </div>

      {/* 검색필드 + 버튼 영역 — 항상 구분선 '아래'에 둔다.
          일부 화면은 검색을 PageHeader에 넘기고 일부는 본문 상단에 직접 그려서, 같은 리스트뷰인데도
          검색 위치가 제각각이었다. 위치를 헤더 아래로 고정해 모든 화면에서 도구 영역이 한 줄에 모이게 한다.
          간격(mt-5)은 페이지 컨테이너의 space-y-5와 맞춰, 본문에 직접 그린 툴바와도 리듬이 일치한다. */}
      {(search || actions) && (
        <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          {search && <div className="w-full sm:max-w-xs">{search}</div>}
          {actions && <div className="flex items-center gap-2 sm:ml-auto">{actions}</div>}
        </div>
      )}
    </div>
  )
}
