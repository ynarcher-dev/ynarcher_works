import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { KpiTemplate, KpiTemplateItem } from './kpiTypes'
import { KPI_KEY } from './kpiQueries'

const invalidate = (qc: ReturnType<typeof useQueryClient>) => qc.invalidateQueries({ queryKey: KPI_KEY })

export function useCreateKpiTemplate() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (values: { versionId: string; name: string; scope: KpiTemplate['scope_type']; roleHint: string | null; blueprintId: string | null }) => {
      const { data, error } = await supabase.from('kpi_templates').insert({
        kpi_version_id: values.versionId, name: values.name, scope_type: values.scope,
        role_hint: values.roleHint, source_blueprint_id: values.blueprintId,
      }).select('id').single()
      if (error) throw error
      if (values.blueprintId) {
        const { data: slots, error: slotError } = await supabase.from('kpi_blueprint_items')
          .select('section_key, slot_key, input_type, target_mode, rule_type, sort_order')
          .eq('blueprint_id', values.blueprintId).is('deleted_at', null).order('sort_order')
        if (slotError) throw slotError
        if (slots?.length) {
          const { error: itemError } = await supabase.from('kpi_template_items').insert(slots.map((slot, index) => ({
            template_id: data.id, section_label: slot.section_key, metric_code: `KPI_${Date.now()}_${index}`,
            metric_name: slot.slot_key, input_type: slot.input_type, target_mode: slot.target_mode,
            rule_type: slot.rule_type, rule_params: slot.rule_type === 'BAND' ? { bands: [] } : slot.rule_type === 'GRADE_MAP' ? { grades: [] } : { per_unit: [], cap: null },
            default_target: slot.target_mode === 'TARGET_RATE' ? 1 : null, evidence_required: true, sort_order: slot.sort_order,
          })))
          if (itemError) throw itemError
        }
      }
      return data.id as string
    }, onSuccess: () => invalidate(qc),
  })
}

export function useSaveKpiBlueprint() {
  const qc = useQueryClient()
  return useMutation({ mutationFn: async ({ template, items }: { template: KpiTemplate; items: KpiTemplateItem[] }) => {
    const { data, error } = await supabase.from('kpi_blueprints').insert({ name: `${template.name} 구성`, scope_type: template.scope_type, description: `${template.name}에서 저장한 재사용 구성`, is_active: true }).select('id').single()
    if (error) throw error
    if (items.length) {
      const { error: itemError } = await supabase.from('kpi_blueprint_items').insert(items.map((item) => ({
        blueprint_id: data.id, section_key: item.section_label, slot_key: item.metric_name,
        input_type: item.input_type, target_mode: item.target_mode, rule_type: item.rule_type, sort_order: item.sort_order,
      })))
      if (itemError) throw itemError
    }
    return data.id as string
  }, onSuccess: () => invalidate(qc) })
}

export function useSaveKpiItem() {
  const qc = useQueryClient()
  return useMutation({ mutationFn: async ({ id, values }: { id?: string; values: Omit<KpiTemplateItem, 'id'> }) => {
    const query = id ? supabase.from('kpi_template_items').update(values).eq('id', id) : supabase.from('kpi_template_items').insert(values)
    const { error } = await query
    if (error) throw error
  }, onSuccess: () => invalidate(qc) })
}

export function useArchiveKpiRow(table: 'kpi_templates' | 'kpi_template_items') {
  const qc = useQueryClient()
  return useMutation({ mutationFn: async (id: string) => {
    const { error } = await supabase.from(table).update({ deleted_at: new Date().toISOString() }).eq('id', id)
    if (error) throw error
  }, onSuccess: () => invalidate(qc) })
}

export function useSetKpiAssignment() {
  const qc = useQueryClient()
  return useMutation({ mutationFn: async (values: { versionId: string; templateId: string | null; scope: 'DEPARTMENT' | 'PERSON'; subjectId: string }) => {
    const { error } = await supabase.rpc('set_kpi_primary_assignment', { p_kpi_version_id: values.versionId, p_template_id: values.templateId, p_subject_type: values.scope, p_subject_id: values.subjectId, p_target_overrides: {} })
    if (error) throw error
  }, onSuccess: () => invalidate(qc) })
}

export function useSaveKpiActual() {
  const qc = useQueryClient()
  return useMutation({ mutationFn: async (values: { assignmentId: string; itemId: string; actual: number | null; qualitative: string | null; payload: Record<string, number> | null; evidence: string | null }) => {
    const { error } = await supabase.rpc('save_kpi_actual', { p_assignment_id: values.assignmentId, p_template_item_id: values.itemId, p_actual_value: values.actual, p_qualitative_value: values.qualitative, p_actual_payload: values.payload, p_evidence_ref: values.evidence })
    if (error) throw error
  }, onSuccess: () => invalidate(qc) })
}

export function usePublishKpiVersion() {
  const qc = useQueryClient()
  return useMutation({ mutationFn: async (orgVersionId: string) => {
    const { error } = await supabase.rpc('publish_org_and_kpi_version', { p_org_version_id: orgVersionId })
    if (error) throw error
  }, onSuccess: () => {
    void invalidate(qc)
    void qc.invalidateQueries({ queryKey: ['management', 'org-versions'] })
    void qc.invalidateQueries({ queryKey: ['management', 'departments'] })
    void qc.invalidateQueries({ queryKey: ['management', 'dept-members'] })
  } })
}
