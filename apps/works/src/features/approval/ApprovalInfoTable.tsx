import { cn } from '@ynarcher/ui'
import type { ReactNode } from 'react'
import { approvalText } from '@/features/approval/config'

export interface InfoPair {
  label: string
  value: ReactNode
}

/**
 * 라벨 열 폭 — 머리 격자와 결재선 격자가 함께 쓴다(두 표가 다른 폭이면 위아래 카드에서
 * 라벨 기둥이 어긋나 보인다).
 *
 * 글자 단을 14px로 올리면서(approvalText) 12px 기준의 `w-32`로는 '보존 연한 / 보안 등급'이
 * 두 줄로 접혔다. 라벨이 접히면 그 행만 키가 커져 격자의 줄 높이가 들쭉날쭉해진다.
 */
export const LABEL_COL_WIDTH = 'w-44'

interface ApprovalInfoTableProps {
  /** 라벨:값 쌍. 한 줄에 두 쌍씩 놓이며, 홀수면 마지막 값이 남은 폭을 채운다. */
  pairs: InfoPair[]
  /** 표 아래에 이어 붙일 추가 행(결재선 도장·참조자 등). `<tr>` 요소여야 한다. */
  children?: ReactNode
}

/** 라벨 칸 — 회색 면에 가운데 정렬. 값 칸과 면으로 갈려 어느 쪽이 이름인지 즉시 읽힌다. */
export function InfoLabelCell({
  children,
  className,
  rowSpan,
}: {
  children: ReactNode
  className?: string
  /** 결재선 격자처럼 여러 단(직급/도장/이름)을 한 라벨이 이끌 때 쓴다. */
  rowSpan?: number
}) {
  return (
    <th
      scope="row"
      rowSpan={rowSpan}
      className={cn(
        LABEL_COL_WIDTH,
        'border border-gray-200 bg-gray-25 px-3 py-2 text-center font-medium',
        approvalText.head,
        className,
      )}
    >
      {children}
    </th>
  )
}

/**
 * 결재 문서의 머리 격자 — 문서 종류·번호·기안 부서 같은 표준 정보를 라벨:값 표로 편다.
 *
 * 이 자리만 카드 격자(InfoGrid)를 쓰지 않는 이유는, 결재 문서는 화면이기 이전에 **양식**이고
 * 사람들이 종이와 기존 결재 시스템에서 익힌 모양이 테두리 있는 표이기 때문이다. 기안 화면과
 * 상세 화면이 같은 표를 쓰므로, 무엇을 적고 있는지와 무엇이 적혔는지가 같은 자리에서 읽힌다.
 */
export function ApprovalInfoTable({ pairs, children }: ApprovalInfoTableProps) {
  const rows: InfoPair[][] = []
  for (let i = 0; i < pairs.length; i += 2) rows.push(pairs.slice(i, i + 2))

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[36rem] border-collapse">
        <tbody>
          {rows.map((row, i) => (
            <tr key={i}>
              {row.map((pair) => (
                <InfoCellPair key={pair.label} pair={pair} span={row.length === 1 ? 3 : 1} />
              ))}
            </tr>
          ))}
          {children}
        </tbody>
      </table>
    </div>
  )
}

function InfoCellPair({ pair, span }: { pair: InfoPair; span: number }) {
  return (
    <>
      <InfoLabelCell>{pair.label}</InfoLabelCell>
      <td className={cn('border border-gray-200 px-3 py-2', approvalText.body)} colSpan={span}>
        {pair.value}
      </td>
    </>
  )
}
