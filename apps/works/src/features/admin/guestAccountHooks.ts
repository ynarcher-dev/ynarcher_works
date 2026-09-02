import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { GuestUserType } from '@/lib/userTypes'

/**
 * ADMIN 게스트 계정 관리 데이터 계층.
 *
 * 게스트 계정은 `public.users`에 앉지만 조회를 원장에 직접 쏘지 않는다 — 한 계정이 여러
 * 사업에 걸리고(초대 레코드는 명부 행당 1건) 사업 원장이 셋이라, 프론트에서 합치면
 * 왕복이 다섯 번이고 그때마다 `entity_key`를 함께 거는 것을 잊을 자리가 생긴다.
 * `admin_guest_accounts` RPC 한 번이 그 조립을 소유한다(ADMIN 전용, SECURITY INVOKER).
 *
 * 근거: docs/docs_planning/3_2_workspace_admin.md §1.8
 */

/** 이 계정이 걸려 있는 사업 한 건. RPC가 접어 준 jsonb 배열의 원소. */
export interface GuestAccountProgram {
  program_id: string
  entity_key: 'program' | 'ma_program' | 'project_program'
  workspace: string
  code: string | null
  title: string | null
  role: string
  /** 그 사업에서의 로그인 개방 상태. 계정 상태와는 별개 축이다. */
  login_status: 'NOT_APPLICABLE' | 'NOT_ALLOWED' | 'INVITED' | 'ACTIVE' | 'BLOCKED'
}

export interface GuestAccount {
  user_id: string
  name: string
  email: string | null
  user_type: GuestUserType
  /** 계정 축. false면 어느 사업에서도 들어오지 못한다. */
  is_active: boolean
  company_name: string | null
  created_at: string
  /** 마지막 세션 발급 시각(guest_invitations.used_at 최대값). 한 번도 없으면 null. */
  last_login_at: string | null
  program_count: number
  /** 그중 문이 열려 있는 사업 수(INVITED·ACTIVE). */
  open_count: number
  programs: GuestAccountProgram[]
}

export interface GuestAccountPage {
  rows: GuestAccount[]
  total: number
}

/** 목록 페이지당 행 수. */
export const GUEST_PAGE_SIZE = 30

interface RawRow extends Omit<GuestAccount, 'programs'> {
  programs: GuestAccountProgram[] | null
  total_count: number | string
}

export function useGuestAccounts(keyword: string, page: number) {
  return useQuery({
    queryKey: ['admin', 'guest-accounts', keyword, page],
    placeholderData: keepPreviousData,
    queryFn: async (): Promise<GuestAccountPage> => {
      const { data, error } = await supabase.rpc('admin_guest_accounts', {
        p_search: keyword.trim() || null,
        p_limit: GUEST_PAGE_SIZE,
        p_offset: page * GUEST_PAGE_SIZE,
      })
      // 조회 실패를 삼키지 않는다 — 삼키면 "권한이 없다"와 "게스트가 없다"가 같은 빈 화면이 된다.
      if (error) throw error
      const rows = (data ?? []) as RawRow[]
      return {
        rows: rows.map((r) => ({ ...r, programs: r.programs ?? [] })),
        // 총 건수는 행마다 같은 값으로 실려 온다(윈도 카운트). 행이 없으면 0이다.
        total: rows[0] ? Number(rows[0].total_count) : 0,
      }
    },
  })
}

/**
 * 계정 정지·해제. 사업 하나를 닫는 것이 아니라 **그 계정이 걸린 모든 사업에서 동시에** 멈춘다.
 * 사업 단위로 닫는 것은 그 사업 담당자의 몫이다(참가자 명부의 로그인 차단).
 */
export function useSetGuestAccountActive() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (v: { userId: string; active: boolean; reason?: string }) => {
      const { error } = await supabase.rpc('set_guest_account_active', {
        p_user_id: v.userId,
        p_active: v.active,
        p_reason: v.reason ?? null,
      })
      if (error) throw error
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['admin', 'guest-accounts'] })
    },
  })
}
