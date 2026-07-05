import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { DealStage, DocType } from '@/features/mna/config'

export interface Deal {
  id: string
  deal_name: string
  target_company_id: string | null
  target_name: string | null
  stage: DealStage
  lead_manager_id: string | null
  estimated_value: number | null
  on_hold: boolean
  note: string | null
  updated_at: string
}

const DEAL_COLS =
  'id, deal_name, target_company_id, target_name, stage, lead_manager_id, estimated_value, on_hold, note, updated_at'

export function useDeals() {
  return useQuery({
    queryKey: ['mna', 'deals'],
    queryFn: async (): Promise<Deal[]> => {
      const { data, error } = await supabase
        .from('ma_deals')
        .select(DEAL_COLS)
        .is('deleted_at', null)
        .order('updated_at', { ascending: false })
      if (error) throw error
      return (data ?? []) as Deal[]
    },
  })
}

export function useDeal(id: string | undefined) {
  return useQuery({
    queryKey: ['mna', 'deal', id],
    enabled: Boolean(id),
    queryFn: async (): Promise<Deal | null> => {
      const { data } = await supabase
        .from('ma_deals')
        .select(DEAL_COLS)
        .eq('id', id)
        .maybeSingle()
      return (data as Deal) ?? null
    },
  })
}

export function useCreateDeal() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (values: {
      deal_name: string
      target_name: string | null
      estimated_value: number | null
      stage?: DealStage
    }) => {
      const { error } = await supabase.from('ma_deals').insert(values)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['mna', 'deals'] }),
  })
}

/** 단계 전환(칸반 이동). 타임라인 로그는 DB 트리거가 자동 기록한다. */
export function useUpdateDealStage() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, stage }: { id: string; stage: DealStage }) => {
      const { error } = await supabase
        .from('ma_deals')
        .update({ stage })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ['mna', 'deals'] })
      qc.invalidateQueries({ queryKey: ['mna', 'deal', v.id] })
      qc.invalidateQueries({ queryKey: ['mna', 'stage-logs', v.id] })
    },
  })
}

export interface StageLog {
  id: string
  from_stage: DealStage | null
  to_stage: DealStage
  created_at: string
}

export function useStageLogs(dealId: string | undefined) {
  return useQuery({
    queryKey: ['mna', 'stage-logs', dealId],
    enabled: Boolean(dealId),
    queryFn: async (): Promise<StageLog[]> => {
      const { data } = await supabase
        .from('ma_deal_stage_logs')
        .select('id, from_stage, to_stage, created_at')
        .eq('deal_id', dealId)
        .order('created_at', { ascending: false })
      return (data ?? []) as StageLog[]
    },
  })
}

export interface DealDocument {
  id: string
  doc_type: DocType
  title: string
  is_reviewed: boolean
  reviewed_at: string | null
}

export function useDealDocuments(dealId: string | undefined) {
  return useQuery({
    queryKey: ['mna', 'docs', dealId],
    enabled: Boolean(dealId),
    queryFn: async (): Promise<DealDocument[]> => {
      const { data } = await supabase
        .from('ma_deal_documents')
        .select('id, doc_type, title, is_reviewed, reviewed_at')
        .eq('deal_id', dealId)
        .order('created_at', { ascending: true })
      return (data ?? []) as DealDocument[]
    },
  })
}

export function useAddDocument(dealId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (values: { doc_type: DocType; title: string }) => {
      const { error } = await supabase
        .from('ma_deal_documents')
        .insert({ ...values, deal_id: dealId })
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['mna', 'docs', dealId] }),
  })
}

/** 문서 [검토 완료] 잠금 처리(NDA 체크리스트). */
export function useReviewDocument(dealId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (docId: string) => {
      const { error } = await supabase
        .from('ma_deal_documents')
        .update({ is_reviewed: true, reviewed_at: new Date().toISOString() })
        .eq('id', docId)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['mna', 'docs', dealId] }),
  })
}

/** 매칭 매트릭스 후보 대상: NETWORKS 스타트업 마스터. */
export interface StartupRef {
  id: string
  name: string
  industry: string | null
}

export function useStartupRefs() {
  return useQuery({
    queryKey: ['mna', 'startup-refs'],
    queryFn: async (): Promise<StartupRef[]> => {
      const { data } = await supabase
        .from('startups')
        .select('id, name, industry')
        .is('deleted_at', null)
        .order('name', { ascending: true })
      return (data ?? []) as StartupRef[]
    },
  })
}
