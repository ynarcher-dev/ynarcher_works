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

export interface InfoRowItem {
  label: string
  /** 값. `null`/`undefined`/빈 문자열이면 `EmptyValue`로 대체한다. */
  value: ReactNode
  /** 메타 값 표시(`InfoField`의 `meta`와 같은 뜻). */
  meta?: boolean
  /** 값 표시 보정(여러 줄 유지 등). */
  valueClassName?: string
}

export interface InfoRowsProps {
  items: InfoRowItem[]
  className?: string
}

/**
 * 라벨: 값을 **세로로 쌓는** 자리. 값이 한 칸에 안 들어가는 항목(참석자 명단·안건·긴 설명)을
 * 위아래로 나열할 때 쓴다.
 *
 * `InfoGrid`와 갈리는 이유는 정렬 축이다. 그리드는 항목마다 자기 칸을 가져 라벨이 이웃과
 * 맞을 필요가 없지만, 세로로 쌓으면 라벨 길이가 제각각이라 값의 왼쪽 끝이 줄마다 어긋난다 —
 * 여섯 줄이 여섯 군데에서 시작하면 훑어 내려가는 눈이 매번 값을 다시 찾는다. 그래서 라벨은
 * 고정 폭 열에 세우고 값은 한 축에서 시작한다.
 *
 * 이 자리가 없던 동안 화면들이 `w-20 shrink-0` + `cardText.label`을 손으로 적었고, 같은 카드
 * 안에서 그리드 항목과 손으로 짠 줄이 서로 다른 축으로 서 있었다(회의록 상세, 2026-09-03 정리).
 * 규격 값(폭·간격·톤)의 소유자는 여기이며 화면은 항목만 준다.
 */
export function InfoRows({ items, className }: InfoRowsProps) {
  return (
    <dl className={cn('grid grid-cols-[6rem_minmax(0,1fr)] gap-x-3 gap-y-2', className)}>
      {items.map((item) => {
        const empty = item.value === null || item.value === undefined || item.value === ''
        return (
          <div key={item.label} className="contents">
            <dt className={cardText.label}>{item.label}</dt>
            <dd className={cn('min-w-0', item.meta ? cardText.meta : cardText.value, item.valueClassName)}>
              {empty ? <EmptyValue /> : item.value}
            </dd>
          </div>
        )
      })}
    </dl>
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
