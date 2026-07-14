import { Button } from '@ynarcher/ui'
import type { ReactNode } from 'react'

/**
 * 대시보드 섹션 셸. '네트워크 현황'과 동일하게 제목·부제는 배경 위에 두고,
 * 본문은 고정 높이 카드(내부 스크롤)에 담는다. `onExpand` 지정 시 하단에 전체보기 버튼을 노출한다.
 */
export function DashboardCard({
  title,
  subtitle,
  onExpand,
  children,
}: {
  title: string
  subtitle?: string
  onExpand?: () => void
  children: ReactNode
}) {
  return (
    <section className="space-y-2">
      <div className="space-y-0.5">
        <h3 className="text-body font-semibold text-gray-800">{title}</h3>
        {subtitle && (
          <p className="truncate text-caption text-gray-400" title={subtitle}>
            {subtitle}
          </p>
        )}
      </div>
      <div className="flex h-[23rem] flex-col rounded-radius-md border border-gray-300 bg-white p-4">
        <div className="min-h-0 flex-1 overflow-y-auto pr-0.5">{children}</div>
        {onExpand && (
          <Button variant="outline" size="sm" className="mt-3 w-full" onClick={onExpand}>
            전체보기
          </Button>
        )}
      </div>
    </section>
  )
}
