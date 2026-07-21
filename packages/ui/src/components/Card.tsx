import type { ReactNode } from 'react'
import { cn } from '../utils/cn'
import { DensityProvider } from '../density'
import { cardText } from '../densityScale'

export interface CardProps {
  /** 카드 상단 제목. 미지정 시 헤더 없이 본문만 렌더한다. */
  title?: ReactNode
  /** 제목 하단 보조 설명(캡션). */
  subtitle?: ReactNode
  /** 헤더 우측 액션 영역(배지·버튼 등). */
  actions?: ReactNode
  className?: string
  /** 본문 래퍼에 덧붙일 클래스(스크롤·고정 높이 등). */
  bodyClassName?: string
  children: ReactNode
}

/**
 * 섹션 카드 셸(제목·부제·우측 액션 내장 흰 박스).
 * 상세 화면을 좌우 패널로 컴포지션할 때 각 패널의 컨테이너로 사용한다.
 *
 * 카드 내부는 밀도 맥락을 `card`로 고정한다 — 안에 놓인 버튼·입력·배지가 별도 지정 없이
 * 카드 규격(32px 계열)으로 렌더된다. 근거: 5_component_spec_rules.md §1.2
 */
export function Card({
  title,
  subtitle,
  actions,
  className,
  bodyClassName,
  children,
}: CardProps) {
  return (
    <DensityProvider value="card">
    <section
      className={cn(
        'rounded-radius-lg border border-gray-300 bg-white p-5 shadow-soft',
        className,
      )}
    >
      {(title || actions) && (
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="space-y-1">
            {title && <h2 className={cardText.title}>{title}</h2>}
            {subtitle && <p className={cardText.subtitle}>{subtitle}</p>}
          </div>
          {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
        </div>
      )}
      <div className={cn(bodyClassName)}>{children}</div>
    </section>
    </DensityProvider>
  )
}
