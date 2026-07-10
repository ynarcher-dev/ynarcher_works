import type { ReactNode } from 'react'

/**
 * 상세페이지 카드 안에서 쓰는 소형 표. 카드가 이미 테두리·그림자를 가지므로
 * 표는 외곽선·모서리 없이, 헤더에만 옅은 회색 배경 + 밑줄을 둬 심플하게 보인다.
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
    <div className={`w-full overflow-x-auto ${className ?? ''}`}>
      <table className="w-full border-separate border-spacing-0 text-caption">
        <thead>
          <tr className="bg-gray-50">{head}</tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  )
}

/** 공용 표 셀 클래스. 헤더는 밑줄 한 줄(gray-200), 본문 행은 옅은 구분선(gray-100). */
export const th = 'h-9 border-b border-gray-200 px-3 text-right text-caption font-semibold text-gray-500'
export const thL = 'h-9 border-b border-gray-200 px-3 text-left text-caption font-semibold text-gray-500'
export const td = 'h-10 border-b border-gray-100 px-3 text-right tabular-nums text-gray-800'
export const tdL = 'h-10 border-b border-gray-100 px-3 text-left text-gray-800'
