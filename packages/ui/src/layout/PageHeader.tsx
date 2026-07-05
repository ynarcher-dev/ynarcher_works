import type { ReactNode } from 'react'

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
}

export function PageHeader({
  back,
  title,
  titleExtra,
  search,
  actions,
  description,
}: PageHeaderProps) {
  return (
    <div className="flex flex-col gap-4">
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
          <p className="mt-1 text-caption text-gray-500">{description}</p>
        )}
      </div>

      {/* 검색필드 + 버튼 영역 */}
      {(search || actions) && (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          {search && <div className="w-full sm:max-w-xs">{search}</div>}
          {actions && <div className="flex items-center gap-2 sm:ml-auto">{actions}</div>}
        </div>
      )}
    </div>
  )
}
