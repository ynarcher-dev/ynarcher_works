import { Button, Tooltip } from '@ynarcher/ui'
import type { ReactNode } from 'react'

/**
 * 대시보드 섹션 셸. 제목은 배경 위에 두고 설명(`subtitle`)은 제목 옆 툴팁 아이콘 호버로 노출하며,
 * 본문은 고정 높이 카드(내부 스크롤)에 담는다. `onExpand` 지정 시 하단에 전체보기 버튼을 노출한다.
 * `compact` 지정 시 카드 높이를 낮춰(12rem) 첫 화면에 더 많은 카드가 들어오게 한다(대시보드 밀도용).
 * `bodyH` 지정 시 임의의 고정 높이(예: `h-[10.5rem]`)로 덮어써 카드를 더 촘촘히 줄인다(compact/기본보다 우선).
 * `fill` 지정 시 고정 높이 대신 그리드 셀 높이를 꽉 채운다(옆 블록 높이에 맞춰 세로로 늘릴 때).
 * `className`은 그리드 배치용(예: 열 span)으로 최상위 section 에 덧붙인다.
 */
export function DashboardCard({
  title,
  subtitle,
  onExpand,
  compact,
  bodyH,
  fill,
  className,
  children,
}: {
  title: string
  subtitle?: string
  onExpand?: () => void
  compact?: boolean
  bodyH?: string
  fill?: boolean
  className?: string
  children: ReactNode
}) {
  const boxHeight = fill ? 'min-h-[16rem] flex-1' : (bodyH ?? (compact ? 'h-[12rem]' : 'h-[23rem]'))
  return (
    <section className={`space-y-2${fill ? ' flex h-full flex-col' : ''}${className ? ` ${className}` : ''}`}>
      <div className="flex items-center gap-1">
        <h3 className="text-body font-semibold text-gray-800">{title}</h3>
        <Tooltip content={subtitle} />
      </div>
      <div
        className={`flex ${boxHeight} flex-col rounded-radius-md border border-gray-300 bg-white p-4`}
      >
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
