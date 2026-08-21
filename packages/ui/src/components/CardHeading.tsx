import type { ElementType, ReactNode } from 'react'
import { cn } from '../utils/cn'
import { cardText } from '../densityScale'

export interface CardHeadingProps {
  /** 제목 본문. */
  children: ReactNode
  /**
   * 제목 옆 건수. 지정하면 `[3]` 말머리로 붙는다.
   *
   * 0건은 강조색을 걷고 회색으로 물러난다 — '있음'과 '없음'을 색으로 가르는 것이 이 표기의
   * 쓸모다. 값이 없어 건수를 셀 수 없는 경우에는 아예 넘기지 않는다(`0`과 `undefined`는 다르다).
   */
  count?: number
  /** 제목 단계 — 카드 제목(16px, 기본)과 카드 안 소제목(14px). */
  level?: 'title' | 'subhead'
  /** 렌더할 태그. 생략하면 단계를 따른다(title → `h2`, subhead → `h3`). */
  as?: ElementType
  /** 건수 뒤에 붙는 보조 한 줄('최근 20건까지 표시' 등). */
  trailing?: ReactNode
  /** 제목 줄 전체에 붙일 클래스(아래 divider·여백 등). */
  className?: string
  /** 제목 글자에만 붙일 클래스(`truncate` 등). */
  titleClassName?: string
  /** 제목이 잘릴 수 있을 때 전체 문구를 알리는 네이티브 툴팁. */
  titleTooltip?: string
}

/**
 * 카드 제목 줄 — 제목과 그 옆 건수를 함께 세우는 유일한 자리.
 *
 * 폼의 라벨을 `Field`가, 카드의 라벨:값을 `InfoField`가 소유하는 것과 같은 자리다. 소유자가
 * 없던 동안 works에는 제목+건수가 여섯 곳에 손으로 쓰여 있었고, **간격이 넷**(`ml-2`·`gap-2`·
 * `gap-1.5`·`gap-1`)**으로 갈렸으며 0건 처리는 셋으로 갈렸다** — `PanelCard`만 0건을 회색으로
 * 눌렀고, 나머지는 `[0]`을 붉게 세우거나(있지도 않은 것을 강조한다) 아예 숨겼다.
 *
 * 건수를 알약 배지가 아니라 대괄호 말머리로 두는 근거는 `cardText.count`에 있다.
 */
export function CardHeading({
  children,
  count,
  level = 'title',
  as,
  trailing,
  className,
  titleClassName,
  titleTooltip,
}: CardHeadingProps) {
  const Comp: ElementType = as ?? (level === 'title' ? 'h2' : 'h3')
  return (
    // 건수는 제목보다 작고 대괄호가 아래로 뻗는 글자라, baseline이 아니라 세로 중앙에 맞춘다.
    <Comp className={cn('flex min-w-0 items-center gap-1', className)}>
      <span
        title={titleTooltip}
        className={cn(
          'min-w-0',
          level === 'title' ? cardText.title : cardText.subhead,
          titleClassName,
        )}
      >
        {children}
      </span>
      {count !== undefined && (
        <span className={cn('shrink-0', cardText.count, count === 0 && 'text-gray-400')}>
          [{count}]
        </span>
      )}
      {trailing}
    </Comp>
  )
}
