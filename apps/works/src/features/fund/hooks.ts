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
  /** 실 납입액(파생) = 캐피탈 콜에서 납입 체크된 요청액의 합. 20260724240000. */
  paid_amount: number
}

export function useFundLps(fundId: string | undefined) {
  return useQuery({
    queryKey: ['fund', 'lps', fundId],
    enabled: Boolean(fundId),
    queryFn: async (): Promise<FundLp[]> => {
      const { data } = await supabase
        .from('fund_lps')
        .select('id, name, commitment_amount, ownership_pct, paid_amount')
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
  /** 차수 총 요청액(파생) = 그 차수 LP별 요청액의 합. */
  amount: number
  due_date: string | null
  status: string
}

/** 캐피탈 콜 차수 생성/수정 입력값. 금액은 파생이라 입력받지 않는다. */
export interface CapitalCallInput {
  call_no: number
  due_date: string | null
  status: string
}

export function useCreateCapitalCall(fundId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (values: CapitalCallInput): Promise<string> => {
      const { data, error } = await supabase
        .from('capital_calls')
        .insert({ ...values, fund_id: fundId })
        .select('id')
        .single()
      if (error) throw error
      return (data as { id: string }).id
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['fund', 'calls', fundId] }),
  })
}

export function useUpdateCapitalCall(fundId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, values }: { id: string; values: CapitalCallInput }) => {
      const { error } = await supabase.from('capital_calls').update(values).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['fund', 'calls', fundId] }),
  })
}

/** 캐피탈 콜 차수 삭제(soft delete). */
export function useDeleteCapitalCall(fundId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('capital_calls')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['fund', 'calls', fundId] })
      qc.invalidateQueries({ queryKey: ['fund', 'lps', fundId] })
      qc.invalidateQueries({ queryKey: ['fund', 'one', fundId] })
    },
  })
}

/** 한 차수의 LP별 요청·납입 행. */
export interface CapitalCallPayment {
  lp_id: string
  requested_amount: number
  amount: number
  is_paid: boolean
  paid_at: string | null
}

/** 한 차수의 LP별 납입 그리드(원자 교체 대상). */
export function useCapitalCallPayments(callId: string | undefined) {
  return useQuery({
    queryKey: ['fund', 'call-payments', callId],
    enabled: Boolean(callId),
    queryFn: async (): Promise<CapitalCallPayment[]> => {
      const { data, error } = await supabase
        .from('capital_call_payments')
        .select('lp_id, requested_amount, amount, is_paid, paid_at')
        .eq('capital_call_id', callId)
      if (error) throw error
      return ((data ?? []) as unknown[]).map((row) => {
        const r = row as Record<string, unknown>
        return {
          lp_id: r.lp_id as string,
          requested_amount: Number(r.requested_amount ?? 0),
          amount: Number(r.amount ?? 0),
          is_paid: Boolean(r.is_paid),
          paid_at: (r.paid_at as string) ?? null,
        }
      })
    },
  })
}

/** 펀드 전체 차수의 납입행(매트릭스 뷰용) — capital_call_id로 열, lp_id로 행을 짠다. */
export interface FundCallPayment {
  capital_call_id: string
  lp_id: string
  requested_amount: number
  is_paid: boolean
}

/** 펀드의 모든 차수×LP 납입행(fund_id 비정규화로 단건 조회). 매트릭스(가로 N차·세로 LP)의 원천. */
export function useFundCapitalCallPayments(fundId: string | undefined) {
  return useQuery({
    queryKey: ['fund', 'call-payments-all', fundId],
    enabled: Boolean(fundId),
    queryFn: async (): Promise<FundCallPayment[]> => {
      const { data, error } = await supabase
        .from('capital_call_payments')
        .select('capital_call_id, lp_id, requested_amount, is_paid')
        .eq('fund_id', fundId)
      if (error) throw error
      return ((data ?? []) as unknown[]).map((row) => {
        const r = row as Record<string, unknown>
        return {
          capital_call_id: r.capital_call_id as string,
          lp_id: r.lp_id as string,
          requested_amount: Number(r.requested_amount ?? 0),
          is_paid: Boolean(r.is_paid),
        }
      })
    },
  })
}

/** 차수×LP 요청·납입 그리드 원자 교체. set_capital_call_payments RPC(SECURITY INVOKER). */
export interface CapitalCallPaymentInput {
  lp_id: string
  requested_amount: number
  is_paid: boolean
}

export function useSetCapitalCallPayments(fundId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ callId, rows }: { callId: string; rows: CapitalCallPaymentInput[] }) => {
      const { error } = await supabase.rpc('set_capital_call_payments', {
        p_capital_call_id: callId,
        p_rows: rows,
      })
      if (error) throw error
    },
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ['fund', 'call-payments', v.callId] })
      qc.invalidateQueries({ queryKey: ['fund', 'call-payments-all', fundId] })
      qc.invalidateQueries({ queryKey: ['fund', 'calls', fundId] })
      qc.invalidateQueries({ queryKey: ['fund', 'lps', fundId] })
      qc.invalidateQueries({ queryKey: ['fund', 'one', fundId] })
    },
  })
}

/** 목적 구분: 의무투자(MANDATORY, 단일)/주목적(MAIN)/특수목적(SPECIAL). */
export type FundPurposeKind = 'MANDATORY' | 'MAIN' | 'SPECIAL'

/** 펀드 목적(의무투자 MANDATORY / 주목적 MAIN / 특수목적 SPECIAL). target_pct는 약정총액 대비 목표비율(%). 근거: 20260724200000. */
export interface FundPurpose {
  id: string
  kind: FundPurposeKind
  label: string
  target_pct: number | null
  sort_order: number
}

/** 펀드 목적 목록(sort_order 오름차순). */
export function useFundPurposes(fundId: string | undefined) {
  return useQuery({
    queryKey: ['fund', 'purposes', fundId],
    enabled: Boolean(fundId),
    queryFn: async (): Promise<FundPurpose[]> => {
      const { data, error } = await supabase
        .from('fund_purposes')
        .select('id, kind, label, target_pct, sort_order')
        .eq('fund_id', fundId)
        .order('sort_order', { ascending: true })
      if (error) throw error
      return ((data ?? []) as unknown[]).map((row) => {
        const r = row as Record<string, unknown>
        return {
          id: r.id as string,
          kind: r.kind as FundPurposeKind,
          label: (r.label as string) ?? '',
          target_pct: r.target_pct == null ? null : Number(r.target_pct),
          sort_order: Number(r.sort_order ?? 0),
        }
      })
    },
  })
}

/** 펀드 목적 집합 원자 교체. set_fund_purposes RPC(SECURITY INVOKER). */
export interface FundPurposeInput {
  id?: string
  kind: FundPurposeKind
  label: string
  target_pct: number | null
  sort_order: number
}

export function useSetFundPurposes() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ fundId, purposes }: { fundId: string; purposes: FundPurposeInput[] }) => {
      const { error } = await supabase.rpc('set_fund_purposes', {
        p_fund_id: fundId,
        p_purposes: purposes,
      })
      if (error) throw error
    },
    onSuccess: (_d, v) => qc.invalidateQueries({ queryKey: ['fund', 'purposes', v.fundId] }),
  })
}

/** 한 투자의 부합 목적 매핑 원자 교체. set_investment_purposes RPC(SECURITY INVOKER). */
export function useSetInvestmentPurposes(fundId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ investmentId, purposeIds }: { investmentId: string; purposeIds: string[] }) => {
      const { error } = await supabase.rpc('set_investment_purposes', {
        p_investment_id: investmentId,
        p_purpose_ids: purposeIds,
      })
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['fund', 'investments', fundId] }),
  })
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
        .is('deleted_at', null)
        .order('call_no', { ascending: true })
      return (data ?? []) as CapitalCall[]
    },
  })
}

export interface Investment {
  id: string
  startup_id: string | null
  startup_name: string | null
  /** 로고 = startups.logo_url. 없으면 null(플레이스홀더). */
  startup_logo_url: string | null
  /** 아이템 = startups.business_profile.oneLiner(한줄소개). */
  startup_one_liner: string | null
  /** 회사개요(startups 마스터 호출값 — investments에 중복 저장하지 않음). */
  startup_representative: string | null
  startup_founded_on: string | null
  startup_location: string | null
  startup_industries: string[]
  /** 구분 = startups.management_status(발굴/보육/투자/기타). 포트폴리오는 항상 invested. */
  startup_management_status: string | null
  /** 관리현황 = startups.pool_status(진행중/보류/종료/제외) — 사용자 확정: startups 그대로 호출. */
  startup_pool_status: string | null
  /** 폐업일자 = startups.closed_on. 관리현황이 폐업일 때만 유효. 20260724230000. */
  startup_closed_on: string | null
  /** 딜메이커(전권 담당자) = startup_managers 리드(is_lead). networks 읽기 권한 없으면 RLS로 null. */
  dealmaker_name: string | null
  amount: number
  invested_at: string | null
  stage: string | null
  /** 투자방식(보통주/CPS/RCPS/CB/BW 등). 라운드(stage)와 별개 축. 20260724170000. */
  investment_method: string | null
  /** PRE 밸류(투자 시점). */
  valuation: number | null
  /** POST 밸류(투자 후). 20260724160000. */
  post_valuation: number | null
  is_own_investment: boolean
  /** 이 투자가 부합하는 목적(fund_purposes.id 목록). 20260724200000. */
  purpose_ids: string[]
}

/** startups.business_profile(jsonb) → oneLiner. 없으면 null. */
function readOneLiner(profile: unknown): string | null {
  if (!profile || typeof profile !== 'object') return null
  const v = (profile as Record<string, unknown>).oneLiner
  return typeof v === 'string' && v.trim() ? v.trim() : null
}

/** startups.industries(jsonb 배열) → 업종 태그 목록. 비면 레거시 단일 industry 흡수. */
function readIndustryList(industries: unknown, legacy: unknown): string[] {
  const list = Array.isArray(industries)
    ? industries.map((v) => String(v).trim()).filter(Boolean)
    : []
  if (list.length > 0) return list
  const one = typeof legacy === 'string' ? legacy.trim() : ''
  return one ? [one] : []
}

/** 딜메이커 = startup_managers 리드(is_lead)의 이름. 리드가 없으면 null. */
function readLeadManager(managers: unknown): string | null {
  if (!Array.isArray(managers)) return null
  const lead = managers.find(
    (m) => m && typeof m === 'object' && (m as Record<string, unknown>).is_lead === true,
  ) as { user?: { name?: string | null } | null } | undefined
  return lead?.user?.name ?? null
}

/**
 * 투자 목록(피투자사 + 회사개요 조인). 투자일 내림차순.
 * 아이템(한줄소개)·회사개요(대표자·설립일·소재지·업종)는 startups 마스터에서 호출하며
 * investments에 중복 저장하지 않는다(기획 §2.3).
 */
export function useInvestments(fundId: string | undefined) {
  return useQuery({
    queryKey: ['fund', 'investments', fundId],
    enabled: Boolean(fundId),
    queryFn: async (): Promise<Investment[]> => {
      const { data } = await supabase
        .from('investments')
        .select(
          'id, startup_id, amount, invested_at, stage, investment_method, valuation, post_valuation, is_own_investment, ' +
            'purposes:investment_purposes(purpose_id), ' +
            'startup:startups!investments_startup_id_fkey(name, logo_url, business_profile, representative, founded_on, location, industries, industry, management_status, pool_status, closed_on, ' +
            'managers:startup_managers(is_lead, user:users!startup_managers_user_id_fkey(name)))',
        )
        .eq('fund_id', fundId)
        .is('deleted_at', null)
        .order('invested_at', { ascending: false })
      return ((data ?? []) as unknown[]).map((row) => {
        const r = row as Record<string, unknown> & { startup?: Record<string, unknown> | null }
        const s = r.startup ?? null
        return {
          id: r.id as string,
          startup_id: (r.startup_id as string) ?? null,
          startup_name: (s?.name as string) ?? null,
          startup_logo_url: (s?.logo_url as string) ?? null,
          startup_one_liner: readOneLiner(s?.business_profile),
          startup_representative: (s?.representative as string) ?? null,
          startup_founded_on: (s?.founded_on as string) ?? null,
          startup_location: (s?.location as string) ?? null,
          startup_industries: readIndustryList(s?.industries, s?.industry),
          startup_management_status: (s?.management_status as string) ?? null,
          startup_pool_status: (s?.pool_status as string) ?? null,
          startup_closed_on: (s?.closed_on as string) ?? null,
          dealmaker_name: readLeadManager(s?.managers),
          amount: Number(r.amount),
          invested_at: (r.invested_at as string) ?? null,
          stage: (r.stage as string) ?? null,
          investment_method: (r.investment_method as string) ?? null,
          valuation: r.valuation == null ? null : Number(r.valuation),
          post_valuation: r.post_valuation == null ? null : Number(r.post_valuation),
          is_own_investment: Boolean(r.is_own_investment),
          purpose_ids: Array.isArray(r.purposes)
            ? (r.purposes as { purpose_id: string }[]).map((p) => p.purpose_id)
            : [],
        }
      })
    },
  })
}

/** 투자 등록/수정 입력값. 라운드는 stage, 투자방식은 investment_method, PRE/POST는 valuation/post_valuation. */
export interface InvestmentInput {
  startup_id: string
  invested_at: string | null
  stage: string | null
  investment_method: string | null
  valuation: number | null
  post_valuation: number | null
  amount: number
}

/** 자사 펀드 투자 집행 등록. drawn_amount(집행액)는 DB 트리거가 자동 재계산한다. 생성된 투자 id를 반환. */
export function useCreateInvestment(fundId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (values: InvestmentInput): Promise<string> => {
      const { data, error } = await supabase
        .from('investments')
        .insert({ ...values, fund_id: fundId, is_own_investment: true })
        .select('id')
        .single()
      if (error) throw error
      return (data as { id: string }).id
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

/**
 * 피투자사 선택용 스타트업 옵션. 이름으로 검색해 고르면 회사개요가 함께 딸려 오도록
 * startups 마스터의 조회값(한줄소개·대표자·설립일·소재지·업종·구분·관리현황·딜메이커)을
 * 함께 싣는다 — 투자 등록 화면에서 읽기 전용으로 상속 표시하는 데 쓴다(investments에 중복 저장하지 않음).
 */
export interface StartupOption {
  id: string
  name: string
  logo_url: string | null
  one_liner: string | null
  representative: string | null
  founded_on: string | null
  location: string | null
  industries: string[]
  management_status: string | null
  pool_status: string | null
  dealmaker_name: string | null
}

/** 피투자사 선택용 스타트업 목록(활성·미병합, 회사개요 조인). 이름 오름차순. */
export function useStartupOptions() {
  return useQuery({
    queryKey: ['fund', 'startup-options'],
    queryFn: async (): Promise<StartupOption[]> => {
      const { data } = await supabase
        .from('startups')
        .select(
          'id, name, logo_url, business_profile, representative, founded_on, location, industries, industry, management_status, pool_status, ' +
            'managers:startup_managers(is_lead, user:users!startup_managers_user_id_fkey(name))',
        )
        .is('deleted_at', null)
        .is('merged_into_id', null)
        .order('name', { ascending: true })
      return ((data ?? []) as unknown[]).map((row) => {
        const s = row as Record<string, unknown>
        return {
          id: s.id as string,
          name: (s.name as string) ?? '',
          logo_url: (s.logo_url as string) ?? null,
          one_liner: readOneLiner(s.business_profile),
          representative: (s.representative as string) ?? null,
          founded_on: (s.founded_on as string) ?? null,
          location: (s.location as string) ?? null,
          industries: readIndustryList(s.industries, s.industry),
          management_status: (s.management_status as string) ?? null,
          pool_status: (s.pool_status as string) ?? null,
          dealmaker_name: readLeadManager(s.managers),
        }
      })
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
