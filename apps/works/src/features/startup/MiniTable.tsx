import { tableText } from '@ynarcher/ui'
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

/**
 * 공용 표 셀 클래스. 헤더는 밑줄 한 줄(gray-200), 본문 행은 옅은 구분선(gray-100).
 *
 * 글자 위계는 손으로 쓰지 않고 `tableText`에서 그대로 가져온다. 한때 이 표가 같은 위계를
 * 자체 문자열로 재선언했는데, 옮겨 적는 사이 머리글이 gray-500에서 gray-700으로, 값이
 * gray-700에서 gray-800으로 한 칸씩 밀렸다. 머리글과 값이 한 단계 차이가 되면서 머리글이
 * 배경으로 물러나지 못했고, `primary`(식별 열)와 `empty`(빈 값) 두 단계는 통째로 사라졌다.
 */
export const th = `h-9 border-b border-gray-200 px-3 text-right ${tableText.head}`
export const thL = `h-9 border-b border-gray-200 px-3 text-left ${tableText.head}`
export const td = `h-10 border-b border-gray-100 px-3 text-right tabular-nums ${tableText.body}`
/** 좌측 정렬 일반 값. 그 행이 무엇인지 알려주는 열에는 `tdP`를 쓴다. */
export const tdL = `h-10 border-b border-gray-100 px-3 text-left ${tableText.body}`
/** 식별 열(연도·기준월·주주명 등) — 행마다 하나만. 없으면 모든 열이 같은 무게로 읽힌다. */
export const tdP = `h-10 border-b border-gray-100 px-3 text-left ${tableText.primary}`
/** 빈 값('-') 자리. 실제 값과 구분되도록 한 단계 더 흐리게 둔다. */
export const tdEmpty = tableText.empty
