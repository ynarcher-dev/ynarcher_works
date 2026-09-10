/**
 * 결재 문서의 수치 해석·표기 — 필드(fields.ts)와 예산표(budget.ts)가 함께 쓴다.
 *
 * 두 모듈이 서로를 import하지 않도록 여기에 따로 둔다. 같은 규칙을 양쪽에 한 벌씩 적으면
 * 쉼표를 어떻게 읽을지가 표와 예산표에서 갈리고, 어긋난 날 어느 쪽이 사실인지 판정할
 * 근거가 없다.
 */

/** 숫자 해석 — 천단위 쉼표·공백을 걷어낸다. 해석 불가는 null(합계에서 제외). */
export function toNumber(raw: string): number | null {
  const cleaned = raw.replace(/[,\s]/g, '')
  if (!cleaned) return null
  const n = Number(cleaned)
  return Number.isFinite(n) ? n : null
}

/** 금액 표기(원). 값이 없으면 '-'. */
export function formatMoney(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return '-'
  return `${n.toLocaleString('ko-KR')}원`
}

/**
 * 비율 표기(%). 분모가 0이거나 값이 없으면 '-'.
 * 소수 한 자리까지만 적는다 — 이익률은 판단의 근거이지 정산 값이 아니다.
 */
export function formatRate(numerator: number | null, denominator: number | null): string {
  if (numerator === null || denominator === null || !denominator) return '-'
  return `${((numerator / denominator) * 100).toFixed(1)}%`
}
