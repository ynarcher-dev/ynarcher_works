import { useState } from 'react'
import { IconButton } from '../components/IconButton'
import { tableText } from '../densityScale'

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

/** 아이콘은 앱에서 주입받지 않고 인라인으로 그린다 — UI 패키지는 아이콘 라이브러리에 의존하지 않는다. */
const Chevron = ({ dir }: { dir: 'left' | 'right' }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d={dir === 'left' ? 'm15 18-6-6 6-6' : 'm9 18 6-6-6-6'} />
  </svg>
)

/**
 * 카드·패널 안에 놓인 목록의 미니멀 페이저. 표 `Pagination`과 달리 페이지 번호 나열 없이
 * 이전/다음 화살표 + `현재/전체`만 가운데 정렬로 노출한다. 1페이지 이하면 숨긴다.
 *
 * 페이저가 둘인 것은 중요도가 아니라 **놓이는 자리**가 갈라서다(크기를 가르는 축과 같다).
 * 페이지에 바로 놓인 표는 그 화면의 작업 대상이라 몇 페이지가 있고 지금 어디인지를 번호로
 * 펴 보여야 하지만, 카드 안 목록은 상세를 받치는 보조 목록이라 번호줄이 카드 폭의 절반을
 * 먹는다. 그 자리에는 다음 장으로 넘길 화살표 둘이면 족하다.
 */
export function MiniPager({
  page,
  pageCount,
  onPage,
  alwaysVisible = false,
}: {
  page: number
  pageCount: number
  onPage: (next: number) => void
  /** 한 페이지뿐이어도 현재 위치를 표시한다. 기본값은 숨김. */
  alwaysVisible?: boolean
}) {
  if (pageCount <= 1 && !alwaysVisible) return null
  // 현재/전체는 데이터가 아니라 내비 메타이므로 목록 행의 메타 단계와 같이 둔다.
  return (
    <div className={`mt-3 flex items-center justify-center gap-2 ${tableText.meta}`}>
      <IconButton
        variant="ghost"
        label="이전"
        disabled={page <= 0}
        onClick={() => onPage(page - 1)}
        icon={<Chevron dir="left" />}
      />
      <span className="tabular-nums">
        {page + 1} / {pageCount}
      </span>
      <IconButton
        variant="ghost"
        label="다음"
        disabled={page >= pageCount - 1}
        onClick={() => onPage(page + 1)}
        icon={<Chevron dir="right" />}
      />
    </div>
  )
}
