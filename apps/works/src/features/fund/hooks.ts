import {
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { Contribution } from '@/features/networks/hooks'

export interface FundManagerRef {
  user_id: string
  role: string
  is_lead: boolean
  user: { id: string; name: string | null } | null
}

export interface Fund {
  id: string
  name: string
  vintage_year: number | null
  total_commitment: number
  drawn_amount: number
  status: string
  // 구분·기간·금액·인력(20260724100000/110000). 목록 최소 조회에서는 미포함이라 옵셔널.
  source_type?: string | null
  character_type?: string | null
  strategy_type?: string | null
  fund_type?: string | null
  subscription_type?: string | null
  formed_on?: string | null
  term_start?: string | null
  term_end?: string | null
  operation_start?: string | null
  operation_end?: string | null
  paid_in_amount?: number | null
  updated_at?: string | null
  manager?: { id: string; name: string | null } | null
  creator?: { id: string; name: string | null } | null
  operators?: FundManagerRef[]
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

/** 펀드 상세: 구분·기간·금액 + 대표펀드매니저·등록자·운용/관리 인력 임베드. */
export function useFund(id: string | undefined) {
  return useQuery({
    queryKey: ['fund', 'one', id],
    enabled: Boolean(id),
    queryFn: async (): Promise<Fund | null> => {
      const { data } = await supabase
        .from('funds')
        .select(
          'id, name, vintage_year, total_commitment, drawn_amount, status, source_type, character_type, strategy_type, fund_type, subscription_type, formed_on, term_start, term_end, operation_start, operation_end, paid_in_amount, updated_at, manager:users!manager_id(id, name), creator:users!created_by(id, name), operators:fund_managers(user_id, role, is_lead, user:users!user_id(id, name))',
        )
        .eq('id', id)
        .maybeSingle()
      // PostgREST 임베드(manager/creator/operators)의 배열 추론과 Fund 형태가 어긋나므로 unknown 경유.
      return (data as unknown as Fund) ?? null
    },
  })
}

/** 펀드 생성/수정 공용 입력값. 미지정 구분·기간은 null. */
export interface FundInput {
  name: string
  total_commitment: number
  status: string
  source_type?: string | null
  character_type?: string | null
  strategy_type?: string | null
  fund_type?: string | null
  subscription_type?: string | null
  formed_on?: string | null
  term_start?: string | null
  term_end?: string | null
  operation_start?: string | null
  operation_end?: string | null
  paid_in_amount?: number | null
}

export function useCreateFund() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (values: FundInput): Promise<string> => {
      const { data, error } = await supabase.from('funds').insert(values).select('id').single()
      if (error) throw error
      return (data as { id: string }).id
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['fund'] }),
  })
}

/** 펀드 수정. */
export function useUpdateFund() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, values }: { id: string; values: FundInput }) => {
      const { error } = await supabase.from('funds').update(values).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['fund'] }),
  })
}

/**
 * 펀드 변동 이력(entity_contributions, entity_table='fund', 오래된 순).
 * 기록(쓰기)은 원장 트리거 app.log_entity_contribution('fund')가 남긴다(20260724120000).
 */
export function useFundContributions(fundId: string | undefined) {
  return useQuery({
    queryKey: ['fund', 'contributions', fundId],
    enabled: Boolean(fundId),
    queryFn: async (): Promise<Contribution[]> => {
      const { data, error } = await supabase
        .from('entity_contributions')
        .select('*')
        .eq('entity_table', 'fund')
        .eq('entity_id', fundId)
        .order('created_at', { ascending: true })
      if (error) throw error
      return (data ?? []) as Contribution[]
    },
  })
}

/**
 * 펀드 인력 배정(대표펀드매니저 + 운용/관리 인력). set_fund_staffing RPC 원자 교체.
 * 근거: 20260724150000_set_fund_staffing.sql
 */
export function useSetFundStaffing() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (args: {
      fundId: string
      managerId: string | null
      operators: string[]
      admins: string[]
    }) => {
      const { error } = await supabase.rpc('set_fund_staffing', {
        p_fund_id: args.fundId,
        p_manager_id: args.managerId,
        p_operators: args.operators,
        p_admins: args.admins,
      })
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['fund'] }),
  })
}

/** 펀드 삭제(soft delete). */
export function useDeactivateFund() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('funds')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['fund'] }),
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
  startup_name: string | null
  amount: number
  invested_at: string | null
  stage: string | null
  valuation: number | null
  is_own_investment: boolean
}

/** 투자 목록(피투자사명 조인). 투자일 내림차순. */
export function useInvestments(fundId: string | undefined) {
  return useQuery({
    queryKey: ['fund', 'investments', fundId],
    enabled: Boolean(fundId),
    queryFn: async (): Promise<Investment[]> => {
      const { data } = await supabase
        .from('investments')
        .select(
          'id, startup_id, amount, invested_at, stage, valuation, is_own_investment, startup:startups!investments_startup_id_fkey(name)',
        )
        .eq('fund_id', fundId)
        .is('deleted_at', null)
        .order('invested_at', { ascending: false })
      return ((data ?? []) as unknown[]).map((row) => {
        const r = row as Record<string, unknown> & { startup?: { name?: string } | null }
        return {
          id: r.id as string,
          startup_id: (r.startup_id as string) ?? null,
          startup_name: r.startup?.name ?? null,
          amount: Number(r.amount),
          invested_at: (r.invested_at as string) ?? null,
          stage: (r.stage as string) ?? null,
          valuation: r.valuation == null ? null : Number(r.valuation),
          is_own_investment: Boolean(r.is_own_investment),
        }
      })
    },
  })
}

/** 투자 등록/수정 입력값. 라운드는 stage 컬럼에, 기업 가치(Pre)는 valuation에 저장한다. */
export interface InvestmentInput {
  startup_id: string
  invested_at: string | null
  stage: string | null
  valuation: number | null
  amount: number
}

/** 자사 펀드 투자 집행 등록. drawn_amount(집행액)는 DB 트리거가 자동 재계산한다. */
export function useCreateInvestment(fundId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (values: InvestmentInput) => {
      const { error } = await supabase
        .from('investments')
        .insert({ ...values, fund_id: fundId, is_own_investment: true })
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['fund', 'investments', fundId] })
      qc.invalidateQueries({ queryKey: ['fund', 'one', fundId] })
      qc.invalidateQueries({ queryKey: ['fund', 'list'] })
    },
  })
}

/** 자사 펀드 투자 수정. */
export function useUpdateInvestment(fundId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, values }: { id: string; values: InvestmentInput }) => {
      const { error } = await supabase.from('investments').update(values).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['fund', 'investments', fundId] })
      qc.invalidateQueries({ queryKey: ['fund', 'one', fundId] })
      qc.invalidateQueries({ queryKey: ['fund', 'list'] })
    },
  })
}

/** 자사 펀드 투자 삭제(soft delete). */
export function useDeleteInvestment(fundId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('investments')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['fund', 'investments', fundId] })
      qc.invalidateQueries({ queryKey: ['fund', 'one', fundId] })
      qc.invalidateQueries({ queryKey: ['fund', 'list'] })
    },
  })
}

export interface StartupOption {
  id: string
  name: string
}

/** 피투자사 선택용 스타트업 목록(활성·미병합). 이름 오름차순. */
export function useStartupOptions() {
  return useQuery({
    queryKey: ['fund', 'startup-options'],
    queryFn: async (): Promise<StartupOption[]> => {
      const { data } = await supabase
        .from('startups')
        .select('id, name')
        .is('deleted_at', null)
        .is('merged_into_id', null)
        .order('name', { ascending: true })
      return (data ?? []) as StartupOption[]
    },
  })
}

/** 스타트업 상세용: 그 스타트업에 집행된 자사 펀드 투자(브리지 RPC 경유, 읽기 전용). */
export interface FundInvestmentRow {
  investment_id: string
  fund_id: string
  fund_name: string
  invested_at: string | null
  round: string | null
  valuation: number | null
  amount: number
}

export function useStartupFundInvestments(startupId: string | undefined) {
  return useQuery({
    queryKey: ['startup', 'fund-investments', startupId],
    enabled: Boolean(startupId),
    queryFn: async (): Promise<FundInvestmentRow[]> => {
      const { data, error } = await supabase.rpc('startup_fund_investments', {
        p_startup_id: startupId,
      })
      if (error) throw error
      return (data ?? []) as FundInvestmentRow[]
    },
  })
}
