export type KpiScope = 'DEPARTMENT' | 'PERSON'
export type KpiVersionStatus = 'DRAFT' | 'PUBLISHED' | 'CLOSED'
export type KpiInputType = 'NUMBER' | 'GRADE' | 'MULTI_COUNT'
export type KpiTargetMode = 'TARGET_RATE' | 'ABSOLUTE' | 'NONE'
export type KpiRuleType = 'BAND' | 'PER_UNIT_CAP' | 'GRADE_MAP'

export interface KpiOrgVersion {
  id: string
  label: string
  effective_from: string
  effective_to: string | null
  status: 'DRAFT' | 'PUBLISHED'
}

export interface KpiVersion {
  id: string
  org_version_id: string
  source_version_id: string | null
  label: string
  status: KpiVersionStatus
  published_at: string | null
  org: KpiOrgVersion
}

export interface KpiBlueprint {
  id: string
  name: string
  scope_type: KpiScope
  description: string | null
  is_active: boolean
}

export interface KpiBlueprintItem {
  id: string
  blueprint_id: string
  section_key: string
  slot_key: string
  input_type: KpiInputType
  target_mode: KpiTargetMode
  rule_type: KpiRuleType
  sort_order: number
}

export interface KpiTemplate {
  id: string
  kpi_version_id: string
  source_blueprint_id: string | null
  name: string
  scope_type: KpiScope
  role_hint: string | null
}

export interface KpiTemplateItem {
  id: string
  template_id: string
  section_label: string
  metric_code: string
  metric_name: string
  description: string | null
  criteria_text: string | null
  unit: string | null
  input_type: KpiInputType
  target_mode: KpiTargetMode
  rule_type: KpiRuleType
  rule_params: Record<string, unknown>
  default_target: number | null
  max_score: number | null
  evidence_required: boolean
  sort_order: number
}

export interface KpiAssignment {
  id: string
  kpi_version_id: string
  template_id: string
  subject_type: KpiScope
  department_id: string | null
  user_id: string | null
  assignment_kind: 'PRIMARY' | 'SUPPLEMENTAL'
  target_overrides: Record<string, number>
}

export interface KpiActualRevision {
  id: string
  assignment_id: string
  template_item_id: string
  actual_value: number | null
  qualitative_value: string | null
  actual_payload: Record<string, number> | null
  evidence_ref: string | null
  computed_score: number | null
  revision_no: number
  entered_at: string
}

export interface KpiPerson {
  id: string
  name: string
  position: string | null
  department_id: string | null
}

export interface KpiDashboardRow {
  scope_type: KpiScope
  assignment_id: string
  template_name: string
  subject_name: string
  item_id: string
  metric_code: string
  metric_name: string
  description: string | null
  criteria_text: string | null
  unit: string | null
  target_mode: KpiTargetMode
  rule_type: KpiRuleType
  rule_params: Record<string, unknown>
  target_value: number | null
  actual_value: number | null
  qualitative_value: string | null
  actual_payload: Record<string, number> | null
  computed_score: number | null
  evidence_ref: string | null
  max_score: number | null
  total_score: number | null
  completed_items: number | null
  total_items: number | null
  rank: number | null
  grade: string | null
  payout_rate: number | null
  kpi_version_label: string
  org_version_label: string
  effective_from: string
  effective_to: string | null
  membership_from: string | null
}

export interface BandRule {
  min: number | null
  max: number | null
  score: number
}

export interface UnitRule {
  key: string
  score: number
}

export interface GradeRule {
  grade: string
  score: number
}

export const emptyRuleParams = (type: KpiRuleType): Record<string, unknown> => {
  if (type === 'PER_UNIT_CAP') return { per_unit: [{ key: '항목', score: 0 }], cap: null }
  if (type === 'GRADE_MAP') return { grades: [{ grade: 'S', score: 0 }] }
  return { bands: [{ min: null, max: null, score: 0 }] }
}
