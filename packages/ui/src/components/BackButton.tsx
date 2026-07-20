import type { ComponentType, ElementType } from 'react'
import { cn } from '../utils/cn'

export interface BackButtonProps {
  /**
   * 렌더할 엘리먼트/컴포넌트. 기본은 `button`이며, 라우팅이 필요하면 앱에서
   * `as={Link} to="..."` 형태로 주입한다(UI 패키지는 라우터에 의존하지 않는다).
   */
  as?: ElementType
  className?: string
  /** `as`에 따라 달라지는 나머지 속성(onClick·to·href 등). */
  [key: string]: unknown
}

/**
 * 상세 화면 공통 뒤로가기 버튼.
 *
 * 라벨은 **항상 '뒤로가기'로 고정**한다. 이전에는 화면마다 '← 발굴기업', '← FUND 보드'처럼
 * 목적지 이름을 각자 적어 같은 동작이 매번 다르게 보였다. 어디로 돌아가는지는 직전 화면에서
 * 이미 알고 있으므로, 라벨을 통일해 '뒤로가기'라는 동작 자체를 학습시킨다.
 *
 * 형태는 Outline 버튼 규격을 따른다(근거: 4_color_system_rules.md §5.1). 텍스트 링크가 아니라
 * 버튼으로 보여야 누를 수 있는 요소임이 분명해지고, 우측 주요 액션(Primary)과는 색으로 무게가
 * 구분된다. 치수는 Button의 기본 크기(md: h-10 / px-4 / text-body)와 정확히 일치시켜, 같은 줄에
 * 놓이는 '수정'·'편집' 버튼과 높이가 어긋나지 않게 한다.
 */
export function BackButton({ as, className, ...rest }: BackButtonProps) {
  const Comp = (as ?? 'button') as unknown as ComponentType<Record<string, unknown>>
  const extra = as ? {} : { type: 'button' }
  return (
    <Comp
      {...extra}
      {...rest}
      className={cn(
        'inline-flex h-10 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-radius-md px-4',
        'border border-gray-300 bg-white text-body font-semibold text-gray-800 shadow-sm',
        'transition-all duration-fast ease-in-out hover:border-gray-400 hover:bg-gray-25 active:bg-gray-50',
        'active:scale-[0.98] transform-gpu',
        'focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand/10',
        className,
      )}
    >
      <svg
        aria-hidden
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        className="size-4 shrink-0"
      >
        <path d="m15 18-6-6 6-6" />
      </svg>
      뒤로가기
    </Comp>
  )
}
