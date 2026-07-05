import {
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

const EVAL_MODULE_TYPES = ['DOC_REVIEW', 'ONSITE_EVAL', 'DEMO_DAY']

export interface EvalModule {
  id: string
  module_type: string
}

export function useEvalModules(programId: string | undefined) {
  return useQuery({
    queryKey: ['ac', 'eval-modules', programId],
    enabled: Boolean(programId),
    queryFn: async (): Promise<EvalModule[]> => {
      const { data } = await supabase
        .from('program_modules')
        .select('id, module_type')
        .eq('program_id', programId)
        .in('module_type', EVAL_MODULE_TYPES)
      return (data ?? []) as EvalModule[]
    },
  })
}

export interface EvaluationForm {
  id: string
  form_type: string
  title: string
  status: string
}

export function useEvaluationForms(programId: string | undefined) {
  return useQuery({
    queryKey: ['ac', 'eval-forms', programId],
    enabled: Boolean(programId),
    queryFn: async (): Promise<EvaluationForm[]> => {
      const { data: mods } = await supabase
        .from('program_modules')
        .select('id')
        .eq('program_id', programId)
        .in('module_type', EVAL_MODULE_TYPES)
      const ids = (mods ?? []).map((m) => (m as { id: string }).id)
      if (ids.length === 0) return []
      const { data } = await supabase
        .from('evaluation_forms')
        .select('id, form_type, title, status')
        .in('program_module_id', ids)
        .order('created_at', { ascending: false })
      return (data ?? []) as EvaluationForm[]
    },
  })
}

export function useCreateEvaluationForm(programId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: {
      programModuleId: string
      formType: string
      title: string
    }) => {
      const { error } = await supabase.from('evaluation_forms').insert({
        program_module_id: input.programModuleId,
        form_type: input.formType,
        title: input.title,
      })
      if (error) throw error
    },
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ['ac', 'eval-forms', programId] }),
  })
}

export interface Criterion {
  id: string
  label: string
  max_score: number
  weight: number
}

export function useCriteria(formId: string | undefined) {
  return useQuery({
    queryKey: ['ac', 'criteria', formId],
    enabled: Boolean(formId),
    queryFn: async (): Promise<Criterion[]> => {
      const { data } = await supabase
        .from('evaluation_criteria')
        .select('id, label, max_score, weight')
        .eq('form_id', formId)
        .order('sort_order', { ascending: true })
      return (data ?? []) as Criterion[]
    },
  })
}

export function useAddCriterion(formId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: {
      label: string
      maxScore: number
      weight: number
    }) => {
      const { error } = await supabase.from('evaluation_criteria').insert({
        form_id: formId,
        label: input.label,
        max_score: input.maxScore,
        weight: input.weight,
      })
      if (error) throw error
    },
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ['ac', 'criteria', formId] }),
  })
}

export interface FormResult {
  target_id: string
  target_type: string
  target_ref: string
  weighted_total: number
  evaluator_count: number
}

export function useFormResults(formId: string | undefined) {
  return useQuery({
    queryKey: ['ac', 'results', formId],
    enabled: Boolean(formId),
    queryFn: async (): Promise<FormResult[]> => {
      const { data, error } = await supabase.rpc('evaluation_form_results', {
        p_form_id: formId,
      })
      if (error) throw error
      return (data ?? []) as FormResult[]
    },
  })
}
