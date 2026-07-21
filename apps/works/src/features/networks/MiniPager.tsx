import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useState } from 'react'

/**
 * 클라이언트 페이징 훅(기본 5개 단위). 목록이 줄어 현재 페이지가 범위를 벗어나면
 * 표시 페이지를 자동으로 마지막 페이지로 클램프한다.
 */
export function usePaged<T>(items: T[], size = 5) {
  const [page, setPage] = useState(0)
  const pageCount = Math.max(1, Math.ceil(items.length / size))
  const safePage = Math.min(page, pageCount - 1)
  const start = safePage * size
  return {
    pageItems: items.slice(start, start + size),
    page: safePage,
    setPage,
    pageCount,
  }
}

/**
 * 상세페이지 패널용 미니멀 페이저. 테이블 `Pagination`과 달리 페이지 번호 나열 없이
 * 이전/다음 화살표 + `현재/전체`만 가운데 정렬로 노출한다. 1페이지 이하면 숨긴다.
 */
export function MiniPager({
  page,
  pageCount,
  onPage,
}: {
  page: number
  pageCount: number
  onPage: (next: number) => void
}) {
  if (pageCount <= 1) return null
  const btn =
    'grid size-6 place-items-center rounded-radius-sm text-gray-400 transition-colors duration-fast hover:bg-gray-100 hover:text-gray-700 disabled:pointer-events-none disabled:opacity-40'
  return (
    <div className="mt-3 flex items-center justify-center gap-2 text-caption text-gray-600">
      <button
        type="button"
        aria-label="이전"
        disabled={page <= 0}
        onClick={() => onPage(page - 1)}
        className={btn}
      >
        <ChevronLeft className="size-4" />
      </button>
      <span className="tabular-nums">
        {page + 1} / {pageCount}
      </span>
      <button
        type="button"
        aria-label="다음"
        disabled={page >= pageCount - 1}
        onClick={() => onPage(page + 1)}
        className={btn}
      >
        <ChevronRight className="size-4" />
      </button>
    </div>
  )
}
