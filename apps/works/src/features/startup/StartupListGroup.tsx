import { Button, cardText } from '@ynarcher/ui'
import type { ReactNode } from 'react'
import { RowBox } from '@/components/FormRowFields'

/**
 * 목록형 입력 한 벌(소제목 + 항목 상자들 + 추가 버튼).
 *
 * `StartupIpFields` 안에 있던 것을 2026-09-09에 여기로 올렸다 — 지식재산 카드를 지식재산 /
 * 인증·정부과제 둘로 가르면서 같은 틀을 두 파일이 쓰게 됐기 때문이다. 그때 복사했으면 소제목
 * 규격과 추가 버튼 모양이 두 벌이 되고, 한쪽을 고치는 날 다른 쪽은 옛 규격으로 남는다.
 */
export function StartupListGroup<T>({
  title,
  rows,
  setRows,
  empty,
  addLabel,
  children,
}: {
  title: string
  rows: T[]
  setRows: (rows: T[]) => void
  empty: T
  addLabel: string
  children: (row: T, patch: (p: Partial<T>) => void, remove: () => void) => ReactNode
}) {
  return (
    <div className="space-y-2">
      <h3 className={cardText.subhead}>{title}</h3>
      {rows.map((row, i) => (
        <RowBox key={i}>
          {children(
            row,
            (p) => setRows(rows.map((r, idx) => (idx === i ? { ...r, ...p } : r))),
            () => setRows(rows.filter((_, idx) => idx !== i)),
          )}
        </RowBox>
      ))}
      <Button type="button" variant="outline" onClick={() => setRows([...rows, { ...empty }])}>
        {addLabel}
      </Button>
    </div>
  )
}
