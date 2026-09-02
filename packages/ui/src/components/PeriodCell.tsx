import { EmptyValue } from './EmptyValue'

/** `YYYY-MM-DD...` 또는 ISO 문자열을 `YYYY-MM-DD`로 절삭한다. 값이 없으면 물음표. */
function day(value: string | null | undefined): string {
  if (!value) return '?'
  const s = String(value)
  return s.length >= 10 ? s.slice(0, 10) : s
}

export interface PeriodCellProps {
  start: string | null | undefined
  end: string | null | undefined
}

/**
 * 기간(날짜 범위) 셀 — 시작일과 종료일을 **한 줄로** 적는다. `type: 'period'` 열이 쓴다.
 *
 * 2026-09-02 이전에는 날짜 한 개 폭에 값을 두 줄로 접었다. 폭은 아꼈지만 그 열만 행 높이가 두
 * 배가 되어, 한 표 안에 한 줄짜리 열과 두 줄짜리 열이 섞이고 표를 세로로 훑는 눈이 행마다
 * 걸렸다 — 폭을 아끼려다 표 전체의 리듬을 내주는 거래였다. 지금은 **표의 모든 값은 한 줄에
 * 선다**가 먼저이고, 폭이 값을 따라간다(`columnWidthScale.period`).
 *
 * 잘리지 않는 것이 이 셀의 요점이다. `2026-08-01 ~ 2026-`처럼 끝에서 잘린 기간은 값이 짧아진
 * 것이 아니라 **종료일이 정해지지 않은 기간과 구분되지 않는 틀린 값**이라, 종류가 잘릴 수 없는
 * 폭을 주고 여기서는 `whitespace-nowrap`으로 접힘까지 막는다.
 *
 * 자릿수는 `tabular-nums`로 고정한다 — 기간이 여러 행에 서면 하이픈과 물결이 세로로 맞아야
 * 시작일과 종료일이 각각 한 열로 읽힌다.
 */
export function PeriodCell({ start, end }: PeriodCellProps) {
  if (!start && !end) return <EmptyValue />
  return (
    <span className="whitespace-nowrap tabular-nums">
      {day(start)} ~ {day(end)}
    </span>
  )
}
