import type { ElementType, ReactNode } from 'react'
import { cn } from '../utils/cn'
import { DensityProvider } from '../density'

export interface CardShellProps {
  /** 렌더할 태그(기본 `section`). 폼 안에서 쓸 때 `fieldset` 등으로 바꾼다. */
  as?: ElementType
  className?: string
  children: ReactNode
}

/**
 * 카드 셸 — 헤더 없이 상자만 필요한 자리의 최소 단위.
 *
 * 화면마다 `<div className="rounded-radius-lg border border-gray-300 bg-white p-5 shadow-soft">`를
 * 손으로 반복하던 것을 흡수한다. 클래스 중복 제거보다 중요한 이유는 **밀도 맥락 전달**이다.
 * 수제 div로 만든 카드는 `card` 맥락을 내려주지 못해, 그 안의 버튼·태그가 페이지 밀도(40px)로
 * 렌더된다 — 카드가 작아 보이는데 안의 버튼만 큰 현상이 여기서 나왔다.
 *
 * 제목·부제·우측 액션이 필요하면 `Card`, 한 줄 헤더 + 건수 배지가 필요하면 `PanelCard`를 쓴다.
 * 근거: 5_component_spec_rules.md §1.2 / §3.x (카드 규격)
 */
export function CardShell({ as: Comp = 'section', className, children }: CardShellProps) {
  return (
    <DensityProvider value="card">
      <Comp
        className={cn(
          'rounded-radius-lg border border-gray-300 bg-white p-5 shadow-soft',
          className,
        )}
      >
        {children}
      </Comp>
    </DensityProvider>
  )
}
