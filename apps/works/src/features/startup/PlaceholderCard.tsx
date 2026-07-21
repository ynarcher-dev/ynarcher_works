import { Badge, CardShell } from '@ynarcher/ui'
import type { ReactNode } from 'react'

/**
 * 헤드라인만 있는 빈 카드 섹션(내용은 후속 구현). 다른 상세 카드와 동일한
 * 테두리·모서리·그림자를 공유한다. `children`을 주면 빈 안내 대신 내용을 렌더한다.
 * `count`를 주면 제목 옆에 건수 뱃지를 노출한다(자료 관리 패널과 동일한 로그 뱃지 디자인).
 */
export function PlaceholderCard({
  title,
  count,
  emptyText = '준비 중입니다.',
  children,
}: {
  title: ReactNode
  /** 제목 옆 로그 건수 뱃지(미지정 시 숨김). */
  count?: number
  /** 내용이 없을 때 표시할 안내 문구. */
  emptyText?: string
  children?: ReactNode
}) {
  return (
    <CardShell>
      <h3 className="flex items-center gap-1.5 text-body font-semibold text-gray-900">
        {title}
        {count !== undefined && (
          <Badge tone="neutral">
            {count}
          </Badge>
        )}
      </h3>
      {children ?? <p className="mt-3 text-body text-gray-500">{emptyText}</p>}
    </CardShell>
  )
}
