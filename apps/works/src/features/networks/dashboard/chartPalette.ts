/**
 * 대시보드 차트 공용 색·스타일(단일 원천).
 *
 * 범주형 팔레트는 [7_chart_visualization_rules.md](../../../../../docs/docs_design/7_chart_visualization_rules.md)의
 * `chart.1~8`을 encode 한다. Tailwind 토큰(색 유틸)은 recharts의 `fill/stroke`에 직접 쓸 수 없어
 * hex 상수로 두되, 무채색/그리드/툴팁 값은 tailwind-preset.mjs의 gray 스케일 hex와 일치시킨다.
 */

/** 범주형 다계열 팔레트(chart.1~8). 조각/계열 순서대로 순환 적용한다. */
export const CHART_CATEGORICAL = [
  '#2563EB', // chart.1 Blue — 단독 데이터·가장 중요한 1계열
  '#16A34A', // chart.2 Green
  '#D97706', // chart.3 Amber
  '#7C3AED', // chart.4 Purple
  '#0D9488', // chart.5 Teal
  '#DB2777', // chart.6 Pink
  '#4F46E5', // chart.7 Indigo
  '#515151', // chart.8 Gray (gray.600)
] as const

/** 단일 지표(1계열) 막대 색 — chart.1. */
export const CHART_PRIMARY = CHART_CATEGORICAL[0]

/** 기타·미지정 등 de-emphasize 색 — gray.400. */
export const CHART_NEUTRAL = '#A3A3A3'

/** 슬라이스 구분 스트로크 — gray.0(white). */
export const CHART_STROKE = '#FFFFFF'

/** 라벨 연결선 — gray.300. */
export const CHART_LABEL_LINE = '#D4D4D4'

/** 차트 툴팁 공용 스타일(rules doc §4.2: white bg · gray.200 border · soft shadow). */
export const CHART_TOOLTIP_STYLE = {
  borderRadius: 8,
  border: '1px solid #E5E5E5',
  boxShadow: '0 4px 12px rgba(0, 0, 0, 0.08)',
  fontSize: 12,
} as const

/** 라벨이 기타/미지정(de-emphasize 대상)인지 판정. */
export function isNeutralLabel(label: string): boolean {
  return label.startsWith('기타') || label.startsWith('미지정')
}
