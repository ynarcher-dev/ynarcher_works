import { cn } from '../utils/cn'

export interface PaginationProps {
  page: number // 1-base
  pageCount: number
  onChange: (page: number) => void
  className?: string
}

/** 페이지네이션(이전/다음 + 현재 위치). */
export function Pagination({
  page,
  pageCount,
  onChange,
  className,
}: PaginationProps) {
  if (pageCount <= 1) return null
  return (
    <nav
      className={cn('flex items-center justify-end gap-2 text-caption', className)}
      aria-label="페이지 이동"
    >
      <button
        type="button"
        disabled={page <= 1}
        onClick={() => onChange(page - 1)}
        className="rounded border border-gray-300 px-2 py-1 text-gray-700 hover:bg-gray-50 disabled:opacity-40"
      >
        이전
      </button>
      <span className="tabular-nums text-gray-600">
        {page} / {pageCount}
      </span>
      <button
        type="button"
        disabled={page >= pageCount}
        onClick={() => onChange(page + 1)}
        className="rounded border border-gray-300 px-2 py-1 text-gray-700 hover:bg-gray-50 disabled:opacity-40"
      >
        다음
      </button>
    </nav>
  )
}
