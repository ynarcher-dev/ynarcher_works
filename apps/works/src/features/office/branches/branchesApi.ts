import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

/**
 * 지사 원장(branches) + 배정인력(branch_members) 서버 훅.
 * ADMIN('지사 관리')이 세팅하고 OFFICE('지사 정보')·회의실 예약이 소비하는 단일 원천.
 * RLS: 조회는 내부 사용자, 쓰기는 admin 전용. 배정인력 쓰기는 app.set_branch_members RPC 전용
 * (supabase/migrations/20260728150000_branches.sql).
 */

export interface Branch {
  id: string
  name: string
  address: string | null
  phone: string | null
  sortOrder: number
  isActive: boolean
}

/** 지사 저장 입력(생성·수정 공용). 배정인력은 RPC로 함께 반영한다. */
export interface BranchInput {
  name: string
  address: string | null
  phone: string | null
  memberIds: string[]
}

interface BranchRow {
  id: string
  name: string
  address: string | null
  phone: string | null
  sort_order: number
  is_active: boolean
}

const toBranch = (r: BranchRow): Branch => ({
  id: r.id,
  name: r.name,
  address: r.address,
  phone: r.phone,
  sortOrder: r.sort_order,
  isActive: r.is_active,
})

const BRANCHES_KEY = ['office', 'branches']
const MEMBERS_KEY = ['office', 'branch-members']

/** 지사 목록. includeInactive=true(ADMIN)면 비활성 포함, 기본(OFFICE)은 활성만. */
export function useBranches(includeInactive = false) {
  return useQuery({
    queryKey: [...BRANCHES_KEY, includeInactive],
    queryFn: async (): Promise<Branch[]> => {
      let q = supabase
        .from('branches')
        .select('id, name, address, phone, sort_order, is_active')
        .is('deleted_at', null)
        .order('sort_order', { ascending: true })
        .order('name', { ascending: true })
      if (!includeInactive) q = q.eq('is_active', true)
      const { data, error } = await q
      if (error) throw error
      return ((data ?? []) as BranchRow[]).map(toBranch)
    },
  })
}

/** 지사별 배정인력 id 목록(표기 순서 보존). 이름은 임직원 원장에서 붙인다. */
export function useBranchMembers() {
  return useQuery({
    queryKey: MEMBERS_KEY,
    queryFn: async (): Promise<Map<string, string[]>> => {
      const { data, error } = await supabase
        .from('branch_members')
        .select('branch_id, user_id, sort_order')
        .order('sort_order', { ascending: true })
      if (error) throw error
      const map = new Map<string, string[]>()
      for (const row of (data ?? []) as { branch_id: string; user_id: string }[]) {
        const arr = map.get(row.branch_id) ?? []
        arr.push(row.user_id)
        map.set(row.branch_id, arr)
      }
      return map
    },
  })
}

/** 배정인력 명단 교체(RPC 전용 쓰기 경로). */
async function saveMembers(branchId: string, memberIds: string[]) {
  const { error } = await supabase.rpc('set_branch_members', {
    p_branch_id: branchId,
    p_user_ids: memberIds,
  })
  if (error) throw error
}

export function useCreateBranch() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (v: BranchInput) => {
      const name = v.name.trim()
      if (!name) throw new Error('지사명을 입력하세요.')
      // 새 지사는 목록 맨 뒤에 붙인다(sort_order는 화면에 노출하지 않는 정렬 전용 값).
      const { data: last, error: readErr } = await supabase
        .from('branches')
        .select('sort_order')
        .order('sort_order', { ascending: false })
        .limit(1)
      if (readErr) throw readErr
      const { data, error } = await supabase
        .from('branches')
        .insert({
          name,
          address: v.address?.trim() || null,
          phone: v.phone?.trim() || null,
          sort_order: (last?.[0]?.sort_order ?? 0) + 10,
        })
        .select('id')
        .single()
      if (error) throw error
      await saveMembers((data as { id: string }).id, v.memberIds)
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: BRANCHES_KEY })
      void qc.invalidateQueries({ queryKey: MEMBERS_KEY })
    },
  })
}

export function useUpdateBranch() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (v: BranchInput & { id: string }) => {
      const name = v.name.trim()
      if (!name) throw new Error('지사명을 입력하세요.')
      const { error } = await supabase
        .from('branches')
        .update({ name, address: v.address?.trim() || null, phone: v.phone?.trim() || null })
        .eq('id', v.id)
      if (error) throw error
      await saveMembers(v.id, v.memberIds)
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: BRANCHES_KEY })
      void qc.invalidateQueries({ queryKey: MEMBERS_KEY })
    },
  })
}

/**
 * 반대 방향 쓰기 — 임직원 한 명의 지사 배정 교체(인사 관리 임직원 수정 폼).
 * 지사 원장은 그대로 두고 branch_members만 바꾸므로 admin 아닌 management write도 호출한다
 * (권한 판정은 RPC 내부). 활성 지사만 대상이며 비활성 지사의 기존 배정은 보존된다.
 */
export function useSetUserBranches() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (v: { userId: string; branchIds: string[] }) => {
      const { error } = await supabase.rpc('set_user_branches', {
        p_user_id: v.userId,
        p_branch_ids: v.branchIds,
      })
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: MEMBERS_KEY }),
  })
}

export function useSetBranchActive() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (v: { id: string; isActive: boolean }) => {
      const { error } = await supabase
        .from('branches')
        .update({ is_active: v.isActive })
        .eq('id', v.id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: BRANCHES_KEY }),
  })
}
