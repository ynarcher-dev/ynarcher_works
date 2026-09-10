import type { KpiDashboardRow } from '@/features/management/kpi/kpiTypes'

const number = (value: unknown) => typeof value === 'number' && Number.isFinite(value) ? value : null
const formatNumber = (value: number | null) => value == null ? '-' : value.toLocaleString('ko-KR', { maximumFractionDigits: 2 })

export function targetLabel(row: KpiDashboardRow): string {
  if (row.rule_type === 'GRADE_MAP') return '등급 평가'
  if (row.rule_type === 'PER_UNIT_CAP') return '항목별 건수 합산'
  return row.target_value == null ? '목표 없음' : `${formatNumber(row.target_value)}${row.unit ?? ''}`
}

export function actualLabel(row: KpiDashboardRow): string {
  if (row.rule_type === 'GRADE_MAP') return row.qualitative_value ?? '미입력'
  if (row.rule_type === 'PER_UNIT_CAP') {
    const entries = Object.entries(row.actual_payload ?? {})
    return entries.length ? entries.map(([key, value]) => `${key} ${value}건`).join(' · ') : '미입력'
  }
  return row.actual_value == null ? '미입력' : `${formatNumber(row.actual_value)}${row.unit ?? ''}`
}

export function scoreRows(row: KpiDashboardRow): { condition: string; score: string }[] {
  if (row.rule_type === 'GRADE_MAP') {
    const grades = Array.isArray(row.rule_params.grades) ? row.rule_params.grades : []
    return grades.map((entry) => {
      const value = entry as { grade?: unknown; score?: unknown }
      return { condition: String(value.grade ?? '-'), score: `${formatNumber(number(value.score))}점` }
    })
  }
  if (row.rule_type === 'PER_UNIT_CAP') {
    const perUnit = Array.isArray(row.rule_params.per_unit) ? row.rule_params.per_unit : []
    const rows = perUnit.map((entry) => {
      const value = entry as { key?: unknown; score?: unknown }
      return { condition: `${String(value.key ?? '-')} 1건`, score: `${formatNumber(number(value.score))}점` }
    })
    const cap = number(row.rule_params.cap)
    if (cap != null) rows.push({ condition: '합계 상한', score: `${formatNumber(cap)}점` })
    return rows
  }
  const bands = Array.isArray(row.rule_params.bands) ? row.rule_params.bands : []
  return bands.map((entry) => {
    const value = entry as { min?: unknown; max?: unknown; score?: unknown }
    const min = number(value.min)
    const max = number(value.max)
    const basis = row.target_mode === 'TARGET_RATE' ? '달성률' : row.unit ?? '값'
    const condition = min == null ? `${basis} ${formatNumber(max)} 미만`
      : max == null ? `${basis} ${formatNumber(min)} 이상`
        : `${basis} ${formatNumber(min)} 이상 ~ ${formatNumber(max)} 미만`
    return { condition, score: `${formatNumber(number(value.score))}점` }
  })
}

export function calculationLabel(row: KpiDashboardRow): string {
  if (row.computed_score == null) return '아직 실적이 입력되지 않았습니다.'
  if (row.rule_type === 'GRADE_MAP') return `${actualLabel(row)} 등급 기준으로 ${formatNumber(row.computed_score)}점이 반영되었습니다.`
  if (row.rule_type === 'PER_UNIT_CAP') return `${actualLabel(row)}을 합산해 ${formatNumber(row.computed_score)}점이 반영되었습니다.`
  if (row.target_mode === 'TARGET_RATE' && row.target_value && row.actual_value != null) {
    const rate = row.actual_value / row.target_value * 100
    return `${actualLabel(row)} ÷ ${targetLabel(row)} = 달성률 ${formatNumber(rate)}%, ${formatNumber(row.computed_score)}점이 반영되었습니다.`
  }
  return `실적 ${actualLabel(row)}에 해당하는 구간 점수 ${formatNumber(row.computed_score)}점이 반영되었습니다.`
}
