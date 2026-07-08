import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { ApprovalStatus, AssetStatus } from '@/features/management/config'

export interface ApprovalDoc {
  id: string
  title: string
  form_type: string
  drafter_id: string | null
  amount: number | null
  status: ApprovalStatus
  created_at: string
  approval_lines: {
    id: string
    approver_id: string | null
    step_order: number
    decision: 'PENDING' | 'APPROVED' | 'REJECTED'
  }[]
}

export function useApprovalDocs() {
  return useQuery({
    queryKey: ['management', 'approvals'],
    queryFn: async (): Promise<ApprovalDoc[]> => {
      const { data, error } = await supabase
        .from('approval_documents')
        .select(
          'id, title, form_type, drafter_id, amount, status, created_at, approval_lines(id, approver_id, step_order, decision)',
        )
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
      if (error) throw error
      return (data ?? []) as ApprovalDoc[]
    },
  })
}

export function useCreateApproval() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (v: {
      title: string
      form_type: string
      amount: number | null
      body: string | null
      approver_ids: string[]
    }) => {
      const { data: doc, error } = await supabase
        .from('approval_documents')
        .insert({
          title: v.title,
          form_type: v.form_type,
          amount: v.amount,
          body: v.body,
          status: 'PENDING',
        })
        .select('id')
        .single()
      if (error) throw error
      if (v.approver_ids.length > 0) {
        const lines = v.approver_ids.map((approver_id, i) => ({
          document_id: doc.id,
          approver_id,
          step_order: i + 1,
        }))
        const { error: le } = await supabase.from('approval_lines').insert(lines)
        if (le) throw le
      }
    },
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ['management', 'approvals'] }),
  })
}

/** 결재 처리(승인/반려). 최종 단계 승인 시 문서 상태를 확정한다. */
export function useDecideApproval() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (v: {
      line_id: string
      document_id: string
      decision: 'APPROVED' | 'REJECTED'
      is_final: boolean
    }) => {
      const { error } = await supabase
        .from('approval_lines')
        .update({ decision: v.decision, decided_at: new Date().toISOString() })
        .eq('id', v.line_id)
      if (error) throw error
      const nextStatus: ApprovalStatus =
        v.decision === 'REJECTED' ? 'REJECTED' : v.is_final ? 'APPROVED' : 'IN_REVIEW'
      const { error: de } = await supabase
        .from('approval_documents')
        .update({ status: nextStatus })
        .eq('id', v.document_id)
      if (de) throw de
    },
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ['management', 'approvals'] }),
  })
}

export interface Employee {
  id: string
  name: string
  email: string | null
  user_type: string
  department_id: string | null
  updated_at: string | null
  phone: string | null
  /** 자유 프로필(jsonb): company / position / bio / note 등. */
  profile: Record<string, unknown> | null
}

/** 목록/상세 공용 select 컬럼(프로필 필드 포함). */
const EMPLOYEE_COLUMNS = 'id, name, email, user_type, department_id, updated_at, phone, profile'

export function useEmployees() {
  return useQuery({
    queryKey: ['management', 'employees'],
    queryFn: async (): Promise<Employee[]> => {
      const { data } = await supabase
        .from('users')
        .select(EMPLOYEE_COLUMNS)
        .is('deleted_at', null)
        .order('name', { ascending: true })
      return (data ?? []) as Employee[]
    },
  })
}

/** 임직원 단건 조회(상세페이지). id 미지정 시 비활성. */
export function useEmployee(id: string | undefined) {
  return useQuery({
    queryKey: ['management', 'employee', id],
    enabled: Boolean(id),
    queryFn: async (): Promise<Employee | null> => {
      const { data, error } = await supabase
        .from('users')
        .select(EMPLOYEE_COLUMNS)
        .eq('id', id)
        .is('deleted_at', null)
        .maybeSingle()
      if (error) throw error
      return (data ?? null) as Employee | null
    },
  })
}

export interface EmployeePage {
  rows: Employee[]
  /** 검색어(필터) 반영 건수 — 페이지 수·No. 넘버링 기준. */
  total: number
  /** 필터 미적용 전체 임직원 수. 검색어가 없으면 total과 같다. */
  totalAll: number
}

/**
 * 임직원 목록 서버 사이드 페이지네이션(검색/미삭제). NETWORKS `useEntityPage`와 동일 패턴.
 * 이름 부분 검색(ilike) + `.range()` 페이지 조회 + `count: 'exact'` 필터 반영 건수.
 * 검색어가 있을 때만 전체 건수(totalAll)를 head 카운트로 추가 조회한다. page는 0-base.
 */
export function useEmployeesPage(keyword: string, page: number, pageSize: number) {
  return useQuery({
    queryKey: ['management', 'employees-page', keyword, page, pageSize],
    placeholderData: keepPreviousData,
    queryFn: async (): Promise<EmployeePage> => {
      const from = page * pageSize
      const to = from + pageSize - 1
      let q = supabase
        .from('users')
        .select(EMPLOYEE_COLUMNS, { count: 'exact' })
        .is('deleted_at', null)
        .order('name', { ascending: true })
        .range(from, to)
      const trimmed = keyword.trim()
      if (trimmed) q = q.ilike('name', `%${trimmed}%`)
      const { data, error, count } = await q
      if (error) throw error
      const total = count ?? 0

      let totalAll = total
      if (trimmed) {
        const { count: allCount } = await supabase
          .from('users')
          .select('id', { count: 'exact', head: true })
          .is('deleted_at', null)
        totalAll = allCount ?? total
      }
      return { rows: (data ?? []) as Employee[], total, totalAll }
    },
  })
}

/** 임직원 정보 수정. RLS(users_update: admin/management write/self)로 권한이 강제된다. */
export function useUpdateEmployee() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (v: { id: string; values: Record<string, unknown> }) => {
      const { error } = await supabase.from('users').update(v.values).eq('id', v.id)
      if (error) throw error
    },
    onSuccess: (_data, v) => {
      void qc.invalidateQueries({ queryKey: ['management', 'employees-page'] })
      void qc.invalidateQueries({ queryKey: ['management', 'employees'] })
      void qc.invalidateQueries({ queryKey: ['management', 'employee', v.id] })
    },
  })
}

export interface CreateEmployeeInput {
  email: string
  name: string
  password: string
  user_type: string
  department_id?: string | null
  phone?: string | null
  position?: string | null
  rank?: string | null
  pay_step?: string | null
}

/**
 * 임직원 계정 생성. 로그인 가능한 auth 계정 생성은 service_role이 필요하므로
 * `employee-create` Edge Function을 경유한다(클라이언트 직접 생성 불가).
 * 세션 Authorization 헤더는 functions.invoke가 자동 첨부한다.
 */
export function useCreateEmployee() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: CreateEmployeeInput): Promise<{ id: string }> => {
      const { data, error } = await supabase.functions.invoke('employee-create', {
        body: input,
      })
      if (error) {
        // Edge Function이 4xx로 반환한 사유 메시지를 우선 노출한다.
        const ctx = (error as { context?: Response }).context
        const detail = ctx ? await ctx.json().catch(() => null) : null
        throw new Error(detail?.message ?? '계정 생성에 실패했습니다.')
      }
      return data as { id: string }
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['management', 'employees-page'] })
      void qc.invalidateQueries({ queryKey: ['management', 'employees'] })
    },
  })
}

/**
 * 본인 프로필(약력·노트) 수정. 본인 직접 UPDATE는 RLS로 차단되며, 컬럼을 화이트리스트하는
 * `update_my_profile` RPC(SECURITY DEFINER)만 profile.bio / profile.note 를 갱신한다.
 */
export function useUpdateMyProfile() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (v: { bio: string; note: string }) => {
      const { error } = await supabase.rpc('update_my_profile', {
        p_bio: v.bio,
        p_note: v.note,
      })
      if (error) throw error
    },
    onSuccess: (_data, _v) => {
      void qc.invalidateQueries({ queryKey: ['management', 'employee'] })
      void qc.invalidateQueries({ queryKey: ['management', 'employees-page'] })
    },
  })
}

/** 임직원 비활성화(소프트 삭제): `deleted_at`을 기록한다. 물리 삭제 금지 원칙. */
export function useDeactivateEmployee() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('users')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['management', 'employees-page'] })
      void qc.invalidateQueries({ queryKey: ['management', 'employees'] })
    },
  })
}

// 조직 관리(조직도 트리 + 조직 레벨) 훅은 파일 길이 상한(500줄) 분리를 위해 orgHooks.ts로 이관했다.
// 임포트 경로 호환을 위해 그대로 재노출한다.
export {
  activeOrgVersionId,
  useCloneOrgVersion,
  useCreateDepartment,
  useCreateOrgLevel,
  useDeleteOrgLevel,
  useDepartments,
  useMoveDepartments,
  useOrgLevels,
  useOrgVersions,
  useSetDepartmentsDeleted,
  useUpdateDepartment,
  useUpdateOrgLevel,
} from '@/features/management/orgHooks'
export type { Department, OrgLevel, OrgVersion } from '@/features/management/orgHooks'

export interface Budget {
  department_id: string | null
  fiscal_year: number
  budget_amount: number
}

export function useBudgets(fiscalYear: number) {
  return useQuery({
    queryKey: ['management', 'budgets', fiscalYear],
    queryFn: async (): Promise<Budget[]> => {
      const { data } = await supabase
        .from('dept_budgets')
        .select('department_id, fiscal_year, budget_amount')
        .eq('fiscal_year', fiscalYear)
      return (data ?? []) as Budget[]
    },
  })
}

export interface Kpi {
  id: string
  workspace_key: string | null
  metric_name: string
  target_value: number | null
  actual_value: number | null
  period: string | null
}

export function useKpis() {
  return useQuery({
    queryKey: ['management', 'kpis'],
    queryFn: async (): Promise<Kpi[]> => {
      const { data } = await supabase
        .from('kpi_records')
        .select('id, workspace_key, metric_name, target_value, actual_value, period')
        .order('created_at', { ascending: false })
      return (data ?? []) as Kpi[]
    },
  })
}

export interface Asset {
  id: string
  name: string
  category: string | null
  status: AssetStatus
  assigned_to: string | null
  return_due: string | null
}

export function useAssets() {
  return useQuery({
    queryKey: ['management', 'assets'],
    queryFn: async (): Promise<Asset[]> => {
      const { data } = await supabase
        .from('assets')
        .select('id, name, category, status, assigned_to, return_due')
        .is('deleted_at', null)
        .order('name', { ascending: true })
      return (data ?? []) as Asset[]
    },
  })
}
