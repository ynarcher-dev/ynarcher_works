import {
  growthPct,
  marginPct,
  netDebt,
  type QrBsYear,
  type QrPnlYear,
} from '@/features/mna/parties/quickReview'

/**
 * 재무 표의 **행 정의** — 손익계산서·재무상태표가 어떤 항목을 어떤 순서로 세우는가.
 *
 * ## 왜 항목이 행이고 연도가 열인가(2026-09-08 전환)
 *
 * 처음에는 연도를 행으로 눕혔다. 이 앱의 열 폭 규칙(`ColumnType`)이 행 단위 표를 전제한다는
 * 것이 근거였는데, 실제로 세워 보니 그 배치가 만든 것은 **여덟 열짜리 표**였고 상세의 좌측
 * 2/3 칸에서 머리글과 숫자가 함께 잘렸다. 원본 문서의 배치(항목 행 · 연도 열)로 되돌리면
 * 열 수가 `항목 + 연도 수`로 줄어 네 개년 문서에서 다섯 열이 된다 — 배치를 바꾸는 것만으로
 * 폭 문제가 사라진다.
 *
 * 얻는 것이 더 있다. 비율(`% growth`·`margin %`)이 값 칸에 얹힌 둘째 줄이 아니라 **자기 행**을
 * 갖게 되어, 한 해의 이익률을 옆 해와 가로로 견줄 수 있다. 재무제표를 읽는 방식이 원래 그것이다.
 *
 * ## 이 파일이 지키는 규칙 — 파생값은 정의만 두고 저장하지 않는다
 *
 * `% growth`·`margin %`·`Net debt`는 `derive`를 갖고 `field`를 갖지 않는다. 그 구분 하나가
 * 조회에서는 '계산해 세울 행', 편집에서는 '적을 수 없고 계산되어 보이는 칸'을 함께 정한다 —
 * 두 화면이 각자 목록을 들면 한쪽에만 칸이 생기는 날이 온다.
 */
export interface MetricRowSpec<T> {
  key: string
  label: string
  /** 저장 칸. 없으면 파생 행이다. */
  field?: keyof T & string
  /** 파생값 — 그 해의 행과 **바로 앞 해**를 받는다(성장률은 앞 해가 있어야 선다). */
  derive?: (row: T, prev: T | null) => number | null
  format: 'amount' | 'percent'
  /**
   * 바로 위 행에 딸린 보조 행. 라벨을 들여쓰고 값이 한 단 물러난다.
   *
   * `Net debt`는 파생이지만 보조가 아니다 — 이자부채에 딸린 비율이 아니라 그 자체가 협상에서
   * 읽히는 숫자라, 물러나게 두면 문서가 말하려는 것이 흐려진다.
   */
  sub?: boolean
}

/** 손익계산서. 원본 문서의 행 순서를 그대로 따른다(값 행 아래 비율 행). */
export const PNL_ROWS: MetricRowSpec<QrPnlYear>[] = [
  { key: 'netRevenue', label: '순매출', field: 'netRevenue', format: 'amount' },
  {
    key: 'growth',
    label: '% growth',
    derive: (r, prev) => growthPct(r.netRevenue, prev?.netRevenue ?? null),
    format: 'percent',
    sub: true,
  },
  { key: 'grossProfit', label: '매출총이익', field: 'grossProfit', format: 'amount' },
  {
    key: 'grossMargin',
    label: 'margin %',
    derive: (r) => marginPct(r.grossProfit, r.netRevenue),
    format: 'percent',
    sub: true,
  },
  { key: 'ebitda', label: 'EBITDA', field: 'ebitda', format: 'amount' },
  {
    key: 'ebitdaMargin',
    label: 'margin %',
    derive: (r) => marginPct(r.ebitda, r.netRevenue),
    format: 'percent',
    sub: true,
  },
  { key: 'ebit', label: 'EBIT', field: 'ebit', format: 'amount' },
  {
    key: 'ebitMargin',
    label: 'margin %',
    derive: (r) => marginPct(r.ebit, r.netRevenue),
    format: 'percent',
    sub: true,
  },
  { key: 'adjustedEbitda', label: '조정 EBITDA', field: 'adjustedEbitda', format: 'amount' },
  {
    key: 'adjustedEbitdaMargin',
    label: 'margin %',
    derive: (r) => marginPct(r.adjustedEbitda, r.netRevenue),
    format: 'percent',
    sub: true,
  },
]

/** 재무상태표. `Net debt`는 이자부채 − 현금이며 문서 자신이 그 정의를 각주로 적어 둔다. */
export const BS_ROWS: MetricRowSpec<QrBsYear>[] = [
  { key: 'cash', label: '현금 및 현금성자산', field: 'cash', format: 'amount' },
  { key: 'interestBearingDebt', label: '이자부채', field: 'interestBearingDebt', format: 'amount' },
  { key: 'netDebt', label: 'Net debt', derive: (r) => netDebt(r), format: 'amount' },
  { key: 'unpaidTax', label: '미지급세금', field: 'unpaidTax', format: 'amount' },
  { key: 'totalAssets', label: '자산총계', field: 'totalAssets', format: 'amount' },
  { key: 'totalLiabilities', label: '부채총계', field: 'totalLiabilities', format: 'amount' },
  { key: 'totalEquity', label: '자본총계', field: 'totalEquity', format: 'amount' },
]

/*
  부채비율(부채총계 ÷ 자본총계)은 넣지 않았다. 두 총계에서 바로 나오는 값이지만 이 원장의
  자본총계는 실제로 음수가 되고(자본잠식) 그때 비율은 뜻을 잃는다 — 계산할 수 있다는 것과
  세워도 된다는 것은 다르다.
*/

/** 한 칸의 값 — 저장된 값이면 그대로, 파생 행이면 계산해서. */
export function metricValue<T>(
  spec: MetricRowSpec<T>,
  row: T,
  prev: T | null,
): number | null {
  if (spec.derive) return spec.derive(row, prev)
  const v = spec.field ? (row[spec.field] as unknown) : null
  return v == null || !Number.isFinite(Number(v)) ? null : Number(v)
}

/** 그 행에 값이 한 해라도 있는가. 통째로 빈 행은 세우지 않는다. */
export function metricRowHasValue<T>(spec: MetricRowSpec<T>, years: T[]): boolean {
  return years.some((row, i) => metricValue(spec, row, years[i - 1] ?? null) != null)
}

/** 머리글 표기 — 원본 문서의 `FY25` 꼴. 실적/추정 구분(`A`/`E`)은 원장이 모르므로 붙이지 않는다. */
export function fiscalYearLabel(year: number): string {
  const yy = String(year).slice(-2)
  return `FY${yy}`
}
