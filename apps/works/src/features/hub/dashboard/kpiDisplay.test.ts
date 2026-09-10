import { describe, expect, it } from 'vitest'
import type { KpiDashboardRow } from '@/features/management/kpi/kpiTypes'
import { calculationLabel, scoreRows } from './kpiDisplay'

const row = (values: Partial<KpiDashboardRow>): KpiDashboardRow => ({
  scope_type: 'PERSON', assignment_id: 'a', template_name: '개인 KPI', subject_name: '홍길동',
  item_id: 'i', metric_code: 'M1', metric_name: '매출', description: null, criteria_text: null,
  unit: '%', target_mode: 'TARGET_RATE', rule_type: 'BAND', rule_params: {}, target_value: 100,
  actual_value: null, qualitative_value: null, actual_payload: null, computed_score: null,
  evidence_ref: null, max_score: 10, total_score: 0, completed_items: 0, total_items: 1,
  rank: null, grade: null, payout_rate: null, kpi_version_label: '2026 KPI', org_version_label: '2026 조직',
  effective_from: '2026-01-01', effective_to: null, membership_from: null, ...values,
})

describe('KPI 상세 표시', () => {
  it('목표 대비 실적의 산정 근거를 설명한다', () => {
    expect(calculationLabel(row({ actual_value: 120, computed_score: 10 })))
      .toContain('달성률 120%')
  })

  it('건별 합산 규칙의 상한을 점수표에 포함한다', () => {
    const rows = scoreRows(row({
      rule_type: 'PER_UNIT_CAP', target_mode: 'NONE',
      rule_params: { per_unit: [{ key: '계약', score: 2 }], cap: 10 },
    }))
    expect(rows).toEqual([
      { condition: '계약 1건', score: '2점' },
      { condition: '합계 상한', score: '10점' },
    ])
  })

  it('상단이 열린 점수 구간을 읽기 쉬운 문장으로 만든다', () => {
    expect(scoreRows(row({
      target_mode: 'ABSOLUTE', unit: '건',
      rule_params: { bands: [{ min: 5, max: null, score: 8 }] },
    }))[0]).toEqual({ condition: '건 5 이상', score: '8점' })
  })
})
