import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { GuestEntityKey } from '@/features/guest/host'
import { supabase } from '@/lib/supabase'
import type { GuestUserType } from '@/lib/userTypes'
import { createGuestAccount, type CreateGuestAccountInput } from '@/features/guest/guestAccountService'

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
  entity_key: GuestEntityKey
  workspace: string
  code: string | null
  title: string | null
  /** 그 사업에서의 로그인 개방 상태. 계정 상태와는 별개 축이다. */
  login_status: 'NOT_APPLICABLE' | 'NOT_ALLOWED' | 'INVITED' | 'ACTIVE' | 'BLOCKED'
  /** 그 사업 게스트의 접근 종료. 계정이 아니라 **사업**이 기간을 갖는다(3_9_1 §8). */
  access_ends_at: string | null
  /**
   * 그 사업의 진행 상태. 끝난 사업(FINISHED·CANCELLED)은 문이 열려 있어도 게스트가 들어오지
   * 못하므로, 문의 결론을 내려면 이 값이 함께 있어야 한다(`guestDoorBadge`).
   */
  program_status: string | null
}

export interface GuestAccount {
  user_id: string
  name: string
  /** ADMIN에게만 원본이 온다. 그 외에는 서버가 마스킹한 값이다(UI에서 가리는 것은 보안이 아니다). */
  email: string | null
  /** 소속(`users.affiliation`). 이전 계정에는 값이 없을 수 있어 nullable이다. */
  affiliation: string | null
  user_type: GuestUserType
  /** 계정 축. false면 어느 사업에서도 들어오지 못한다. */
  is_active: boolean
  /** 본인이 비밀번호를 정했는가. false면 아직 고정 최초 비밀번호(`ynarcher`)로 들어온다. */
  has_password: boolean
  created_at: string
  /** 마지막 세션 발급 시각(guest_invitations.used_at 최대값). 한 번도 없으면 null. */
  last_login_at: string | null
  program_count: number
  /**
   * 그중 개방 상태인 사업 수(INVITED·ACTIVE). **화면의 '로그인 가능'은 이 값이 아니다** —
   * 실제 게이트는 개방 상태·사업 상태·기간의 AND라, 그 결론은 참여 줄마다 `guestDoorBadge`가
   * 낸다. 이 값은 사업 상태·기간을 보지 않는 원장 그대로의 수다.
   */
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

/** 게스트 계정 목록. 계정 프로필과 참여 사업을 서버 페이징으로 함께 읽는다. */
export function useGuestAccounts(keyword: string, page: number) {
  return useQuery({
    queryKey: ['admin', 'guest-accounts', keyword, page],
    placeholderData: keepPreviousData,
    queryFn: async (): Promise<GuestAccountPage> => {
      const { data, error } = await supabase.rpc('guest_accounts_list', {
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
 * **ADMIN 전용**이다 — 한 계정이 여러 사업에 걸리므로 담당자가 정지하면 남의 사업까지 죽는다.
 */
export function useSetGuestAccountsActive() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (v: { userIds: string[]; active: boolean; reason?: string }) => {
      const { data, error } = await supabase.rpc('set_guest_accounts_active', {
        p_user_ids: v.userIds,
        p_active: v.active,
        p_reason: v.reason ?? null,
      })
      if (error) throw error
      return Number(data ?? 0)
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['admin', 'guest-accounts'] })
    },
  })
}

/** 이름·이메일·소속으로 독립 GUEST 계정을 만드는 mutation. */
export function useCreateGuestAccount() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: CreateGuestAccountInput) => createGuestAccount(input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['admin', 'guest-accounts'] })
    },
  })
}

/** 관리자 전용 물리 삭제. 계정 접근자료를 지우고 보존할 업무 기록에서는 사용자 참조만 익명화한다. */
export function useHardDeleteGuestAccounts() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (v: { userIds: string[]; reason: string }) => {
      const { data, error } = await supabase.rpc('hard_delete_guest_accounts', {
        p_user_ids: v.userIds,
        p_reason: v.reason.trim(),
      })
      if (error) throw error
      return Number(data ?? 0)
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['admin', 'guest-accounts'] })
    },
  })
}
