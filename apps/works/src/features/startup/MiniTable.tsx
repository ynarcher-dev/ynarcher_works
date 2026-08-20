import { tableGrid, tableText } from '@ynarcher/ui'
import type { ReactNode } from 'react'

/**
 * 상세페이지 카드 안에서 쓰는 소형 표. 카드가 이미 표면(테두리)을 이루므로 표는 외곽선·모서리
 * 없이 행 구분선만 둔다.
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
        {/*
          머리글에 회색 면을 깔지 않는다(2026-08-20 데이터 테이블 규격과 동일).
          배경과 밑줄은 둘 다 "여기부터 머리글이다"라는 같은 말이라, 겹치면 머리글이 정작
          읽어야 할 데이터보다 무거워진다. 머리글임은 굵기와 색(semibold + gray-600)이 이미
          말하고 있고, 데이터와의 경계는 밑줄 하나가 긋는다.
          근거: 5_component_spec_rules.md §3.1
        */}
        <thead>
          <tr>{head}</tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  )
}

/**
 * 공용 표 셀 클래스.
 *
 * 격자(행 높이·셀 좌우 여백)와 글자 위계는 손으로 정하지 않고 `tableGrid`·`tableText`에서
 * 그대로 가져온다 — 값을 옮겨 적으면 그 사본이 곧 어긋난다. 실제로 한때 이 표는 행 높이 40px,
 * 셀 여백 `px-3`, 머리글 회색 띠를 자체 값으로 갖고 있어 같은 화면의 `DataTable`과 행 높이도
 * 여백도 머리글 처리도 전부 달랐고, 글자 위계 역시 옮겨 적는 사이 한 칸씩 밀려 머리글이 배경으로
 * 물러나지 못했다.
 *
 * 테두리 색도 규격을 따른다 — 머리글 밑줄은 컨테이너 경계에 준하는 `gray-300`, 행 사이는 한
 * 단계 연한 `gray-200`이다. 근거: 5_component_spec_rules.md §3.1
 */
const cell = `${tableGrid.row} border-b ${tableGrid.cellX}`

export const th = `${cell} border-gray-300 text-right ${tableText.head}`
export const thL = `${cell} border-gray-300 text-left ${tableText.head}`
export const td = `${cell} border-gray-200 text-right tabular-nums ${tableText.body}`
/** 좌측 정렬 일반 값. 그 행이 무엇인지 알려주는 열에는 `tdP`를 쓴다. */
export const tdL = `${cell} border-gray-200 text-left ${tableText.body}`
/** 식별 열(연도·기준월·주주명 등) — 행마다 하나만. 없으면 모든 열이 같은 무게로 읽힌다. */
export const tdP = `${cell} border-gray-200 text-left ${tableText.primary}`
