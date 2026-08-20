import type { ReactNode } from 'react'
import { EmptyValue } from '../components/EmptyValue'
import { cardText } from '../densityScale'
import { cn } from '../utils/cn'

export interface InfoFieldProps {
  label: string
  /** 값. `null`/`undefined`/빈 문자열이면 `EmptyValue`로 대체한다. */
  value: ReactNode
  /**
   * 메타 값 표시. 생성자·수정일처럼 레코드 자체가 아니라 레코드를 다룬 흔적인 값에 준다.
   * 도메인 값보다 한 단 연한 톤(`cardText.meta`)을 받아, 대표자·사업자번호 같은 업무 사실과
   * 같은 무게로 읽히지 않게 한다.
   */
  meta?: boolean
  className?: string
  /** 값 표시 보정(말줄임 등). 긴 값이 열을 밀지 않도록 `truncate`를 줄 때 쓴다. */
  valueClassName?: string
}

/**
 * 라벨: 값 한 줄. 상세 화면 전 워크스페이스 공용 규격.
 *
 * 라벨과 값은 크기를 `text-body` 하나로 통일하고 위계는 색으로만 만든다. 한 줄 안에서 크기가
 * 갈리면 2px 차이도 '작은 글씨'가 아니라 다른 폰트로 읽혀, 정작 색으로 줘야 할 위계를 크기가
 * 가져가 버린다. 근거: densityScale.ts `tableText` — "크기는 하나, 구분은 굵기와 색으로만".
 */
export function InfoField({ label, value, meta, className, valueClassName }: InfoFieldProps) {
  const empty = value === null || value === undefined || value === ''
  return (
    <div className={cn('flex items-baseline gap-2', className)}>
      <span className={cn('shrink-0', cardText.label)}>{label}:</span>
      <span
        className={cn(meta ? cardText.meta : cardText.value, valueClassName)}
        title={typeof value === 'string' ? value : undefined}
      >
        {/*
          빈 값은 `EmptyValue`에 맡긴다(2026-08-20).

          이전에는 여기서 직접 `'-'`를 찍으면서 값과 같은 톤(gray-900)을 그대로 씌웠다. 그래서
          표에서는 없는 값이 gray-400으로 물러나는데 카드에서는 실제 값만큼 진했다 — 같은 '없음'이
          자리마다 다르게 보였고, "홈페이지: -"가 "대표자: 정민서"와 같은 무게로 읽혔다.
          없다는 사실은 알리되 읽히지는 않게 하는 것이 이 자리의 목적이다.
        */}
        {empty ? <EmptyValue /> : value}
      </span>
    </div>
  )
}

export interface InfoGridProps {
  /** 열 수(기본 3열). 1열은 우측 패널 등 좁은 폭에서 사용한다. */
  columns?: 1 | 2 | 3
  className?: string
  children: ReactNode
}

/** `InfoField` 나열용 반응형 그리드. 모바일 1열 → 지정 열 수로 확장한다. */
export function InfoGrid({ columns = 3, className, children }: InfoGridProps) {
  return (
    <div
      className={cn(
        'grid grid-cols-1 gap-2.5',
        columns === 2 && 'sm:grid-cols-2',
        columns === 3 && 'sm:grid-cols-3',
        className,
      )}
    >
      {children}
    </div>
  )
}
