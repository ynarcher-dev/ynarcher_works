import { DataTable, EmptyValue, type Column } from '@ynarcher/ui'
import { QrBlock, million, percent } from '@/features/mna/parties/MaQuickReviewParts'
import {
  fiscalYearLabel,
  metricRowHasValue,
  metricValue,
  type MetricRowSpec,
} from '@/features/mna/parties/quickReviewMetrics'

/**
 * 재무 표 한 장(조회) — **항목이 행, 연도가 열**. 원본 문서의 배치 그대로다.
 *
 * 행 정의는 이 파일이 갖지 않는다(`quickReviewMetrics.ts`) — 같은 목록을 편집 격자가 함께 쓰고,
 * 두 화면이 각자 목록을 들면 한쪽에만 있는 행이 생긴다.
 *
 * 근거: docs/docs_planning/3_6_1_ma_seller_quick_review.md
 */

/** 표시용 한 행 — 연도별 표시 문자열을 미리 만들어 둔다(열 render는 인덱스만 꺼낸다). */
interface MetricLine {
  key: string
  label: string
  /** 계산된 행(입력값이 아님). 굵기와 색이 함께 한 단 물러난다. */
  derived?: boolean
  /** 바로 위 행에 딸린 비율 행. 들여쓰기가 그 소속을 말한다. */
  sub?: boolean
  cells: (string | null)[]
}

function buildLines<T extends { fiscalYear: number }>(
  years: T[],
  specs: MetricRowSpec<T>[],
): MetricLine[] {
  return specs
    .filter((spec) => metricRowHasValue(spec, years))
    .map((spec) => ({
      key: spec.key,
      label: spec.label,
      derived: Boolean(spec.derive),
      sub: spec.sub,
      cells: years.map((row, i) => {
        const v = metricValue(spec, row, years[i - 1] ?? null)
        if (v == null) return null
        return spec.format === 'percent' ? percent(v) : million(v)
      }),
    }))
}

/**
 * 입력값과 계산값을 가르는 톤(2026-09-08).
 *
 * 가르는 수단은 크기가 아니라 **굵기와 색**이다 — 한 표 안에서 크기는 하나라는 것이 이 앱의
 * 규칙이고, 그 규칙이 남겨 둔 두 축이 정확히 이 둘이다.
 *
 * 갈라야 하는 이유는 장식이 아니다. 이 표에서 `순매출 200`은 담당자가 자료를 보고 옮겨 적은
 * **사실**이고 `margin % 100.0%`는 그 사실에서 나온 **결과**인데, 둘이 같은 무게로 서면 계산값도
 * 누군가 확인한 숫자처럼 읽힌다. 그러면 원본이 틀렸을 때 틀린 것이 몇 칸인지 화면이 답하지
 * 못한다.
 *
 * 들여쓰기(`sub`)는 이것과 다른 축이다 — 그쪽은 '위 행에 딸렸다'를 말하고, 이쪽은 '적은 값이
 * 아니다'를 말한다. `Net debt`가 들여쓰기 없이도 물러나 서는 자리가 그 차이를 보여 준다.
 */
const line = (derived: boolean | undefined) =>
  derived ? 'font-normal text-gray-600' : 'font-medium text-gray-900'

export function MaQuickReviewMetricTable<T extends { fiscalYear: number }>({
  title,
  years,
  specs,
}: {
  title: string
  years: T[]
  specs: MetricRowSpec<T>[]
}) {
  const lines = buildLines(years, specs)
  if (years.length === 0 || lines.length === 0) return null

  const columns: Column<MetricLine>[] = [
    {
      key: 'label',
      header: '항목',
      primary: true,
      /*
        항목 이름 열만 폭을 손으로 준다. 이 열에 들어오는 것은 데이터가 아니라 **표의 행 이름**이라
        `ColumnType`(담기는 데이터의 종류)이 답할 수 있는 값이 아니고, 종류를 하나만 붙이면 그
        열이 남는 폭을 100% 가져가 연도 열이 0으로 접힌다(가변폭 계산이 비율로 도는 탓이다).
        값은 가장 긴 라벨 `현금 및 현금성자산`(14px에서 126px)에 셀 여백을 더해 재어 정했다.
      */
      className: 'w-40',
      render: (r) => (
        <span className={`block ${r.sub ? 'pl-3' : ''} ${line(r.derived)}`}>{r.label}</span>
      ),
    },
    ...years.map((y, i) => ({
      key: `fy-${y.fiscalYear}`,
      header: fiscalYearLabel(y.fiscalYear),
      align: 'right' as const,
      numeric: true,
      render: (r: MetricLine) =>
        r.cells[i] == null ? (
          <EmptyValue />
        ) : (
          <span className={`block truncate ${line(r.derived)}`}>{r.cells[i]}</span>
        ),
    })),
  ]

  return (
    <QrBlock title={title}>
      <DataTable
        columns={columns}
        rows={lines}
        rowKey={(r) => r.key}
        numbered={false}
        standardColumns={false}
        layout="fixed"
      />
    </QrBlock>
  )
}
