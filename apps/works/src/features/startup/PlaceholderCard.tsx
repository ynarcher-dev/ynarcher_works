import type { ReactNode } from 'react'

/**
 * 헤드라인만 있는 빈 카드 섹션(내용은 후속 구현). 다른 상세 카드와 동일한
 * 테두리·모서리·그림자를 공유한다. `children`을 주면 빈 안내 대신 내용을 렌더한다.
 */
export function PlaceholderCard({
  title,
  emptyText = '준비 중입니다.',
  children,
}: {
  title: ReactNode
  /** 내용이 없을 때 표시할 안내 문구. */
  emptyText?: string
  children?: ReactNode
}) {
  return (
    <section className="rounded-radius-lg border border-gray-200 bg-white p-5 shadow-soft">
      <h3 className="text-body font-semibold text-gray-900">{title}</h3>
      {children ?? <p className="mt-3 text-body text-gray-400">{emptyText}</p>}
    </section>
  )
}
