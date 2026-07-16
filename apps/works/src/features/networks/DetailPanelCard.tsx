import { Badge } from '@ynarcher/ui'
import type { ReactNode } from 'react'

/**
 * 상세페이지 우측 패널(자료 관리·변동 이력·피드백) 공용 카드 래퍼.
 * 좌측 본문 카드(`SectionCard`)와 동일한 톤(테두리·라운드·소프트 섀도)을 유지한다.
 * `count`가 주어지면 제목 옆에 건수 뱃지를 노출한다.
 */
export function DetailPanelCard({
  title,
  count,
  action,
  children,
}: {
  title: string
  /** 제목 옆 건수 뱃지(미지정 시 숨김). */
  count?: number
  action?: ReactNode
  children: ReactNode
}) {
  return (
    <section className="rounded-radius-lg border border-gray-300 bg-white p-5 shadow-soft">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-1.5 text-body font-semibold text-gray-900">
          {title}
          {count !== undefined && (
            <Badge tone="neutral" size="sm">
              {count}
            </Badge>
          )}
        </h2>
        {action}
      </div>
      {children}
    </section>
  )
}
