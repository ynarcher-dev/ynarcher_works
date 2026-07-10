import type { ReactNode } from 'react'

/**
 * 그룹 헤드라인 + 오른쪽으로 이어지는 얇은 구분선.
 * 여러 카드로 이뤄진 묶음(예: 성장 지표)을 위 블록과 시각적으로 분리할 때 쓴다.
 * `accent`로 라벨 앞에 브랜드색 액센트 바를 붙일 수 있고, `className`으로 위 여백 등을 조정한다.
 */
export function SectionHeading({
  title,
  accent = false,
  className,
}: {
  title: ReactNode
  /** 라벨 앞 브랜드색 액센트 바 노출. */
  accent?: boolean
  /** 래퍼 추가 클래스(기본 상단 여백 pt-2). */
  className?: string
}) {
  return (
    <div className={`flex items-center gap-3 ${className ?? 'pt-2'}`}>
      {accent && <span className="h-4 w-1 shrink-0 rounded bg-brand" aria-hidden />}
      <h2 className="shrink-0 text-title-sm font-bold text-gray-900">{title}</h2>
      <span className="h-px flex-1 bg-gray-200" aria-hidden />
    </div>
  )
}
