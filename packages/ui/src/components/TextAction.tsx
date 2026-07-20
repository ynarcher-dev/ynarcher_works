import type { ComponentType, ElementType, ReactNode } from 'react'
import { cn } from '../utils/cn'

export interface TextActionProps {
  /**
   * 렌더할 엘리먼트/컴포넌트. 기본은 `button`이며, 라우팅이 필요하면 앱에서
   * `as={Link} to="..."` 형태로 주입한다(UI 패키지는 라우터에 의존하지 않는다).
   */
  as?: ElementType
  /** 좌측(←)·우측(→) 화살표 표기. 기본은 화살표 없음. */
  arrow?: 'left' | 'right' | 'none'
  className?: string
  children: ReactNode
  /** `as`에 따라 달라지는 나머지 속성(onClick·to·href 등). */
  [key: string]: unknown
}

/**
 * 브랜드 텍스트 액션(상세 뒤로가기 '← 목록', 패널 헤더 '전체 보기 →').
 * 링크·버튼 어느 쪽이든 동일한 텍스트 톤을 유지해 상세 화면 전반의 링크 스타일을 통일한다.
 */
export function TextAction({
  as,
  arrow = 'none',
  className,
  children,
  ...rest
}: TextActionProps) {
  const Comp = (as ?? 'button') as unknown as ComponentType<Record<string, unknown>>
  const extra = as ? {} : { type: 'button' }
  return (
    <Comp
      {...extra}
      {...rest}
      className={cn(
        'shrink-0 text-caption font-semibold text-brand transition-colors duration-fast hover:text-brand-600',
        className,
      )}
    >
      {arrow === 'left' && '← '}
      {children}
      {arrow === 'right' && ' →'}
    </Comp>
  )
}
