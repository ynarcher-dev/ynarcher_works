import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { KpiActualRevision, KpiAssignment, KpiBlueprint, KpiBlueprintItem, KpiDashboardRow, KpiPerson, KpiTemplate, KpiTemplateItem, KpiVersion } from './kpiTypes'

export const KPI_KEY = ['management', 'performance-kpi'] as const
const rowsOf = (value: unknown): Record<string, unknown>[] => Array.isArray(value) ? value as Record<string, unknown>[] : []

export function useKpiVersions() {
  return useQuery({ queryKey: [...KPI_KEY, 'versions'], queryFn: async (): Promise<KpiVersion[]> => {
    const { data, error } = await supabase.from('kpi_versions')
      .select('id, org_version_id, source_version_id, label, status, published_at, org_versions!inner(id, label, effective_from, effective_to, status)')
      .is('deleted_at', null).order('created_at', { ascending: false })
    if (error) throw error
    return (data ?? []).map((row) => ({
      id: row.id as string, org_version_id: row.org_version_id as string,
      source_version_id: row.source_version_id as string | null, label: row.label as string,
      status: row.status as KpiVersion['status'], published_at: row.published_at as string | null,
      org: row.org_versions as unknown as KpiVersion['org'],
    }))
  } })
}

export function useKpiTemplates(versionId?: string) {
  return useQuery({ queryKey: [...KPI_KEY, 'templates', versionId ?? null], enabled: Boolean(versionId), queryFn: async (): Promise<KpiTemplate[]> => {
    const { data, error } = await supabase.from('kpi_templates')
      .select('id, kpi_version_id, source_blueprint_id, name, scope_type, role_hint')
      .eq('kpi_version_id', versionId as string).is('deleted_at', null).order('created_at')
    if (error) throw error
    return (data ?? []) as KpiTemplate[]
  } })
}

export function useKpiTemplateItems(templateId?: string) {
  return useQuery({ queryKey: [...KPI_KEY, 'items', templateId ?? null], enabled: Boolean(templateId), queryFn: async (): Promise<KpiTemplateItem[]> => {
    const { data, error } = await supabase.from('kpi_template_items')
      .select('id, template_id, section_label, metric_code, metric_name, description, criteria_text, unit, input_type, target_mode, rule_type, rule_params, default_target, max_score, evidence_required, sort_order')
      .eq('template_id', templateId as string).is('deleted_at', null).order('sort_order')
    if (error) throw error
    return (data ?? []) as KpiTemplateItem[]
  } })
}

export function useKpiAssignments(versionId?: string) {
  return useQuery({ queryKey: [...KPI_KEY, 'assignments', versionId ?? null], enabled: Boolean(versionId), queryFn: async (): Promise<KpiAssignment[]> => {
    const { data, error } = await supabase.from('kpi_assignments')
      .select('id, kpi_version_id, template_id, subject_type, department_id, user_id, assignment_kind, target_overrides')
      .eq('kpi_version_id', versionId as string).is('deleted_at', null)
    if (error) throw error
    return (data ?? []) as KpiAssignment[]
  } })
}

export function useKpiActuals(assignmentId?: string) {
  return useQuery({ queryKey: [...KPI_KEY, 'actuals', assignmentId ?? null], enabled: Boolean(assignmentId), queryFn: async (): Promise<KpiActualRevision[]> => {
    const { data, error } = await supabase.from('kpi_actual_revisions')
      .select('id, assignment_id, template_item_id, actual_value, qualitative_value, actual_payload, evidence_ref, computed_score, revision_no, entered_at')
      .eq('assignment_id', assignmentId as string).order('revision_no', { ascending: false })
    if (error) throw error
    const latest = new Map<string, KpiActualRevision>()
    for (const row of (data ?? []) as KpiActualRevision[]) if (!latest.has(row.template_item_id)) latest.set(row.template_item_id, row)
    return [...latest.values()]
  } })
}

export function useKpiPeople(orgVersionId?: string) {
  return useQuery({ queryKey: [...KPI_KEY, 'people', orgVersionId ?? null], enabled: Boolean(orgVersionId), queryFn: async (): Promise<KpiPerson[]> => {
    const [{ data: members, error: memberError }, { data: users, error: userError }] = await Promise.all([
      supabase.from('dept_members').select('user_id, department_id, effective_from').eq('version_id', orgVersionId as string).is('deleted_at', null).order('effective_from', { ascending: false }),
      supabase.from('users').select('id, name, profile').is('deleted_at', null).not('user_type', 'in', '(external_startup,external_expert,temporary_guest)').order('name'),
    ])
    if (memberError) throw memberError
    if (userError) throw userError
    const placement = new Map<string, string>()
    for (const row of rowsOf(members)) if (!placement.has(String(row.user_id))) placement.set(String(row.user_id), String(row.department_id))
    return rowsOf(users).filter((row) => placement.has(String(row.id))).map((row) => ({
      id: String(row.id), name: String(row.name),
      position: typeof row.profile === 'object' && row.profile && 'position' in row.profile ? String((row.profile as Record<string, unknown>).position ?? '') || null : null,
      department_id: placement.get(String(row.id)) ?? null,
    }))
  } })
}

export function useKpiBlueprints() {
  return useQuery({ queryKey: [...KPI_KEY, 'blueprints'], queryFn: async (): Promise<KpiBlueprint[]> => {
    const { data, error } = await supabase.from('kpi_blueprints').select('id, name, scope_type, description, is_active').is('deleted_at', null).eq('is_active', true).order('name')
    if (error) throw error
    return (data ?? []) as KpiBlueprint[]
  } })
}

export function useKpiBlueprintItems(blueprintId?: string) {
  return useQuery({ queryKey: [...KPI_KEY, 'blueprint-items', blueprintId ?? null], enabled: Boolean(blueprintId), queryFn: async (): Promise<KpiBlueprintItem[]> => {
    const { data, error } = await supabase.from('kpi_blueprint_items').select('id, blueprint_id, section_key, slot_key, input_type, target_mode, rule_type, sort_order').eq('blueprint_id', blueprintId as string).is('deleted_at', null).order('sort_order')
    if (error) throw error
    return (data ?? []) as KpiBlueprintItem[]
  } })
}

export function useMyKpiDashboard(asOf?: string) {
  return useQuery({ queryKey: ['office', 'my-kpi-dashboard', asOf ?? 'today'], queryFn: async (): Promise<KpiDashboardRow[]> => {
    const { data, error } = await supabase.rpc('my_kpi_dashboard', { p_as_of: asOf ?? new Date().toISOString().slice(0, 10) })
    if (error) throw error
    return (data ?? []) as KpiDashboardRow[]
  } })
}
