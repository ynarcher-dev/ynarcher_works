import type { ReactNode } from 'react'
import { cn } from '../utils/cn'
import { CardShell } from './CardShell'
import { CardHeading } from './CardHeading'
import { cardText } from '../densityScale'

export interface CardProps {
  /** 카드 상단 제목. 미지정 시 헤더 없이 본문만 렌더한다. */
  title?: ReactNode
  /** 제목 옆 건수(미지정 시 숨김). `[3]` 말머리 형태로 렌더한다. */
  count?: number
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
 * 상자 자체는 `CardShell`에 맡긴다 — 이 파일이 셸 클래스를 다시 적고 있었을 때, 카드 규격이
 * 두 곳에 존재했다. 밀도 맥락(`card`)도 `CardShell`이 함께 내려준다.
 *
 * 제목 줄은 `CardHeading`이 소유한다. 그래서 `PanelCard`와 이 카드의 '제목 옆 건수'가 같은
 * 간격·같은 0건 처리로 렌더된다.
 */
export function Card({
  title,
  count,
  subtitle,
  actions,
  className,
  bodyClassName,
  children,
}: CardProps) {
  return (
    <CardShell className={className}>
      {(title || actions) && (
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="min-w-0 space-y-1">
            {title && <CardHeading count={count}>{title}</CardHeading>}
            {subtitle && <p className={cardText.subtitle}>{subtitle}</p>}
          </div>
          {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
        </div>
      )}
      <div className={cn(bodyClassName)}>{children}</div>
    </CardShell>
  )
}
