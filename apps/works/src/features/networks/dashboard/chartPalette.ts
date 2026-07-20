/**
 * 대시보드 차트 공용 색·스타일(단일 원천).
 *
 * 주 색(1번)은 브랜드 액센트 네이비(`brand` 토큰 `#1F3A5F`)를 사용한다 — STARTUP 차트와 동일한 톤.
 * 2번 이후는 [7_chart_visualization_rules.md](../../../../../docs/docs_design/7_chart_visualization_rules.md)의
 * 범주형 팔레트를 잇는다. Tailwind 토큰(색 유틸)은 recharts의 `fill/stroke`에 직접 쓸 수 없어
 * hex 상수로 두되, 무채색/그리드/툴팁 값은 tailwind-preset.mjs의 gray 스케일 hex와 일치시킨다.
 */

/**
 * 범주형 다계열 팔레트. 1번=브랜드 네이비(주 색), 이후 chart.2~8. 순서대로 순환 적용한다.
 * 브랜드가 네이비가 되면서 기존 chart.1 Blue(`#2563EB`)와 계열이 겹치므로, 6번 슬롯은
 * 적색(`#DC2626`)으로 교체해 인접 색상 간 판별을 유지한다.
 */
export const CHART_CATEGORICAL = [
  '#1F3A5F', // brand — 단독 데이터·가장 중요한 1계열(브랜드 네이비)
  '#16A34A', // chart.2 Green
  '#D97706', // chart.3 Amber
  '#7C3AED', // chart.4 Purple
  '#0D9488', // chart.5 Teal
  '#DC2626', // chart.7 Red (구 chart.1 Blue 자리 — 브랜드 네이비와의 계열 중복 회피)
  '#DB2777', // chart.6 Pink
  '#4A5361', // chart.8 Gray (gray.600)
] as const

/** 단일 지표(1계열) 막대 색 — chart.1. */
export const CHART_PRIMARY = CHART_CATEGORICAL[0]

/** 기타·미지정 등 de-emphasize 색 — gray.400. */
export const CHART_NEUTRAL = '#6E7683'

/** 슬라이스 구분 스트로크 — gray.0(white). */
export const CHART_STROKE = '#FFFFFF'

/** 라벨 연결선 — gray.300. */
export const CHART_LABEL_LINE = '#CBD0D8'

/** 차트 툴팁 공용 스타일(rules doc §4.2: white bg · gray.200 border · soft shadow). */
export const CHART_TOOLTIP_STYLE = {
  borderRadius: 8,
  border: '1px solid #DFE2E7',
  boxShadow: '0 4px 12px rgba(0, 0, 0, 0.08)',
  fontSize: 12,
} as const

/** 라벨이 기타/미지정(de-emphasize 대상)인지 판정. */
export function isNeutralLabel(label: string): boolean {
  return label.startsWith('기타') || label.startsWith('미지정')
}

/**
 * 범주별 채움색(단일 지표 분포를 다채롭게). 기타·미지정은 무채색, 그 외는 범주형 팔레트를
 * 순서대로(index) 순환 적용한다(0번=브랜드 레드). 세로·가로 막대 공용 — 같은 정렬 배열이면
 * 카드·모달에서 같은 범주가 같은 색을 갖는다.
 */
export function categoricalFill(label: string, index: number): string {
  if (isNeutralLabel(label)) return CHART_NEUTRAL
  return CHART_CATEGORICAL[index % CHART_CATEGORICAL.length] ?? CHART_PRIMARY
}
