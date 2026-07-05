import {
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

export interface Fund {
  id: string
  name: string
  vintage_year: number | null
  total_commitment: number
  drawn_amount: number
  status: string
}

export function useFunds() {
  return useQuery({
    queryKey: ['fund', 'list'],
    queryFn: async (): Promise<Fund[]> => {
      const { data, error } = await supabase
        .from('funds')
        .select('id, name, vintage_year, total_commitment, drawn_amount, status')
        .is('deleted_at', null)
        .order('vintage_year', { ascending: false })
      if (error) throw error
      return (data ?? []) as Fund[]
    },
  })
}

export function useFund(id: string | undefined) {
  return useQuery({
    queryKey: ['fund', 'one', id],
    enabled: Boolean(id),
    queryFn: async (): Promise<Fund | null> => {
      const { data } = await supabase
        .from('funds')
        .select('id, name, vintage_year, total_commitment, drawn_amount, status')
        .eq('id', id)
        .maybeSingle()
      return (data as Fund) ?? null
    },
  })
}

export function useCreateFund() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (values: {
      name: string
      total_commitment: number
      status: string
    }) => {
      const { error } = await supabase.from('funds').insert(values)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['fund', 'list'] }),
  })
}

export interface FundLp {
  id: string
  name: string
  commitment_amount: number
  ownership_pct: number | null
}

export function useFundLps(fundId: string | undefined) {
  return useQuery({
    queryKey: ['fund', 'lps', fundId],
    enabled: Boolean(fundId),
    queryFn: async (): Promise<FundLp[]> => {
      const { data } = await supabase
        .from('fund_lps')
        .select('id, name, commitment_amount, ownership_pct')
        .eq('fund_id', fundId)
        .is('deleted_at', null)
        .order('commitment_amount', { ascending: false })
      return (data ?? []) as FundLp[]
    },
  })
}

export interface CapitalCall {
  id: string
  call_no: number
  amount: number
  due_date: string | null
  status: string
}

export function useCapitalCalls(fundId: string | undefined) {
  return useQuery({
    queryKey: ['fund', 'calls', fundId],
    enabled: Boolean(fundId),
    queryFn: async (): Promise<CapitalCall[]> => {
      const { data } = await supabase
        .from('capital_calls')
        .select('id, call_no, amount, due_date, status')
        .eq('fund_id', fundId)
        .order('call_no', { ascending: true })
      return (data ?? []) as CapitalCall[]
    },
  })
}

export interface Investment {
  id: string
  startup_id: string | null
  amount: number
  invested_at: string | null
  stage: string | null
  is_own_investment: boolean
}

export function useInvestments(fundId: string | undefined) {
  return useQuery({
    queryKey: ['fund', 'investments', fundId],
    enabled: Boolean(fundId),
    queryFn: async (): Promise<Investment[]> => {
      const { data } = await supabase
        .from('investments')
        .select('id, startup_id, amount, invested_at, stage, is_own_investment')
        .eq('fund_id', fundId)
        .is('deleted_at', null)
        .order('invested_at', { ascending: false })
      return (data ?? []) as Investment[]
    },
  })
}
