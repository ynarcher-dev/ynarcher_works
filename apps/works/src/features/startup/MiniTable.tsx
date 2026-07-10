import type { ReactNode } from 'react'

/**
 * 상세페이지 카드 안에서 쓰는 소형 표. 공용 `DataTable`과 동일한 테두리·모서리
 * (rounded-radius-md + border-gray-300 외곽선, 헤더 bg-gray-50, 셀 구분선 gray-200)를 맞춘다.
 * 카드 내부에 놓이므로 shadow-soft는 두지 않는다(카드가 이미 그림자를 가짐).
 */
export function MiniTable({
  head,
  children,
  className,
}: {
  head: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <div
      className={`w-full overflow-x-auto rounded-radius-md border border-gray-300 bg-white ${className ?? ''}`}
    >
      <table className="w-full border-separate border-spacing-0 text-caption">
        <thead>
          <tr className="bg-gray-50">{head}</tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  )
}

/** 공용 표 셀 클래스(DataTable과 동일한 정렬·구분선). 헤더는 caption·semibold·gray-500. */
export const th = 'h-9 border-b border-gray-300 px-3 text-right text-caption font-semibold text-gray-500'
export const thL = 'h-9 border-b border-gray-300 px-3 text-left text-caption font-semibold text-gray-500'
export const td = 'h-10 border-b border-gray-200 px-3 text-right tabular-nums text-gray-800'
export const tdL = 'h-10 border-b border-gray-200 px-3 text-left text-gray-800'
