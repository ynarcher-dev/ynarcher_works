import type { ReactNode } from 'react'
import { cn } from '../utils/cn'

export interface PaginationProps {
  page: number // 1-base
  pageCount: number
  onChange: (page: number) => void
  className?: string
  /** 좌측에 노출할 부가 정보(예: "12 / 87건"). 우측 직접 이동 입력창과 좌우 대칭으로 배치된다. */
  info?: ReactNode
}

/** 
 * 토스 스타일의 모던 페이지네이션 (번호 뱃지, 퀵점프, 직접 이동).
 * 근거: 5_component_spec_rules.md §3.2
 */
export function Pagination({
  page,
  pageCount,
  onChange,
  className,
  info,
}: PaginationProps) {
  // 페이지가 1개뿐이어도 페이저를 노출한다(현재 페이지·전체 페이지 수를 항상 보여주기 위함).

  // 렌더링할 페이지 번호 계산 (현재 페이지 기준 좌우 2개씩 노출)
  const getPageNumbers = () => {
    const pages = []
    const start = Math.max(1, page - 2)
    const end = Math.min(pageCount, page + 2)
    for (let i = start; i <= end; i++) {
      pages.push(i)
    }
    return pages
  }

  const pageNumbers = getPageNumbers()

  return (
    <nav
      className={cn('relative flex items-center justify-center gap-1.5 text-caption font-semibold py-4 w-full', className)}
      aria-label="페이지네이션"
    >
      {/* 좌측 부가 정보(필터 반영 수 / 전체 수 등) */}
      {info != null && (
        <div className="absolute left-0 hidden items-center font-medium text-gray-500 sm:flex">
          {info}
        </div>
      )}

      {/* 맨 앞으로 (⏮) */}
      <button
        type="button"
        disabled={page <= 1}
        onClick={() => onChange(1)}
        className="flex h-8 w-8 items-center justify-center rounded-radius-sm border border-gray-300 text-gray-600 transition-all hover:bg-gray-50 active:scale-95 disabled:scale-100 disabled:opacity-30"
        aria-label="첫 페이지로 이동"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m11 17-5-5 5-5"/><path d="m18 17-5-5 5-5"/></svg>
      </button>

      {/* 이전 페이지 (◀) */}
      <button
        type="button"
        disabled={page <= 1}
        onClick={() => onChange(page - 1)}
        className="flex h-8 w-8 items-center justify-center rounded-radius-sm border border-gray-300 text-gray-600 transition-all hover:bg-gray-50 active:scale-95 disabled:scale-100 disabled:opacity-30"
        aria-label="이전 페이지로 이동"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"/></svg>
      </button>

      {/* 페이지 번호 리스트 */}
      <div className="flex items-center gap-1">
        {pageNumbers.map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => onChange(p)}
            className={cn(
              'h-8 min-w-8 px-2 flex items-center justify-center rounded-radius-sm text-caption transition-all font-semibold active:scale-95',
              p === page
                ? 'bg-brand text-white shadow-sm shadow-brand/10'
                : 'text-gray-700 hover:bg-gray-100'
            )}
            aria-current={p === page ? 'page' : undefined}
          >
            {p}
          </button>
        ))}
      </div>

      {/* 다음 페이지 (▶) */}
      <button
        type="button"
        disabled={page >= pageCount}
        onClick={() => onChange(page + 1)}
        className="flex h-8 w-8 items-center justify-center rounded-radius-sm border border-gray-300 text-gray-600 transition-all hover:bg-gray-50 active:scale-95 disabled:scale-100 disabled:opacity-30"
        aria-label="다음 페이지로 이동"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6"/></svg>
      </button>

      {/* 맨 뒤로 (⏭) */}
      <button
        type="button"
        disabled={page >= pageCount}
        onClick={() => onChange(pageCount)}
        className="flex h-8 w-8 items-center justify-center rounded-radius-sm border border-gray-300 text-gray-600 transition-all hover:bg-gray-50 active:scale-95 disabled:scale-100 disabled:opacity-30"
        aria-label="마지막 페이지로 이동"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m17 17 5-5-5-5"/><path d="m10 17 5-5-5-5"/></svg>
      </button>

      {/* 우측 직접 이동 입력창 (Go-To-Page) */}
      <div className="absolute right-0 hidden sm:flex items-center gap-1.5 text-gray-500">
        <span>페이지 이동</span>
        <input
          type="number"
          min={1}
          max={pageCount}
          defaultValue={page}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              const targetPage = Number((e.target as HTMLInputElement).value)
              if (targetPage >= 1 && targetPage <= pageCount) {
                onChange(targetPage)
              }
            }
          }}
          className="h-8 w-14 rounded-radius-sm border border-gray-300 px-1.5 text-center text-body text-gray-800 transition-all focus:border-brand/50 focus:outline-none focus:shadow-popover [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
        />
      </div>
    </nav>
  )
}
