import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { MasterTable } from '@/features/program/participantPersona'
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
  entity_key: 'program' | 'ma_program'
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
  /** 이 줄의 자격. 같은 계정이 한 사업에 두 자격으로 걸리면 줄이 둘이다. */
  master_table: MasterTable | null
}

/** 계정이 가진 인격 하나 — 어느 원장의 누구로 참여하는가. */
export interface GuestIdentity {
  master_table: MasterTable
  master_id: string
  name: string | null
}

export interface GuestAccount {
  user_id: string
  name: string
  /** ADMIN에게만 원본이 온다. 그 외에는 서버가 마스킹한 값이다(UI에서 가리는 것은 보안이 아니다). */
  email: string | null
  phone: string | null
  user_type: GuestUserType
  /** 계정 축. false면 어느 사업에서도 들어오지 못한다. */
  is_active: boolean
  company_name: string | null
  /**
   * 이 계정이 가진 인격들. 한 사람이 참여 기업(기업 대표)이면서 참여 전문가일 수 있으므로
   * 배열이다 — 화면을 가르는 자격은 참여 줄이 답하지만, 계정이 무엇으로 참여할 수 있는지는
   * 여기가 답한다(3_9_1 §4).
   */
  identities: GuestIdentity[]
  /** 본인이 비밀번호를 정했는가. false면 아직 원장 연락처가 초기 비밀번호로 통한다. */
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

interface RawRow extends Omit<GuestAccount, 'programs' | 'identities'> {
  programs: GuestAccountProgram[] | null
  identities: GuestIdentity[] | null
  total_count: number | string
}

/**
 * 게스트 계정 목록. **두 축이 서로 다른 질문에 답한다.**
 *
 * `entityKey` — 참여 사업 칸이 볼 범위(건수·열린 건수·사업 목록). AC 창구는 `'program'`을
 * 주고, ADMIN 계정 관리는 주지 않는다.
 *
 * `masterTables` — **어느 계정이 목록에 서는가**(2026-09-08 신설). 2026-09-07에는
 * *"좁히는 것은 사업이지 계정이 아니다 — 사업 하나를 못 본다고 계정을 빼면 이미 있다는
 * 사실이 숨겨져 같은 대상에 발급을 다시 시도하게 된다"* 였는데, **M&A가 들어오면 그 근거가
 * 성립하지 않는다**: AC 창구가 발급하는 대상은 `startups`·`networks` 행이고 M&A 창구는
 * `ma_sellers`·`ma_buyers` 행이라 애초에 재시도가 일어날 수 있는 같은 대상이 아니다
 * (중복 발급은 `issue_guest_account`의 ①번 분기가 계속 막는다). 반면 계정을 전부 세우면
 * `ma_sellers` 인격이 AC 창구에 서서, 참여 사업 칸이 비어 있어도 그 사람 계정이 있다는
 * 사실이 드러난다.
 *
 * 이 값은 **권한이 아니라 자리**를 좁힌다 — 권한은 두 겹이 이미 건다(인격 매핑의 원장별
 * 정책, 그리고 `security invoker`의 사업 원장 RLS). ADMIN은 둘 다 주지 않는다.
 *
 * 근거: docs/docs_planning/3_9_2_external_portal_expansion.md §6
 */
export function useGuestAccounts(
  keyword: string,
  page: number,
  entityKey?: 'program' | 'ma_program',
  masterTables?: readonly MasterTable[],
  /**
   * 참여 사업이 0건인 계정만.
   *
   * 서버에서 거르는 이유는 이 목록이 서버 페이징이기 때문이다 — 화면에서 거르면 한 페이지
   * 안에서만 걸러져 '2쪽에는 더 있는데 1쪽에서 0건'이 된다.
   */
  onlyOrphans?: boolean,
) {
  return useQuery({
    queryKey: [
      'admin',
      'guest-accounts',
      keyword,
      page,
      entityKey ?? 'all',
      masterTables?.join(',') ?? 'all',
      onlyOrphans ? 'orphans' : 'all',
    ],
    placeholderData: keepPreviousData,
    queryFn: async (): Promise<GuestAccountPage> => {
      const { data, error } = await supabase.rpc('guest_accounts_list', {
        p_search: keyword.trim() || null,
        p_limit: GUEST_PAGE_SIZE,
        p_offset: page * GUEST_PAGE_SIZE,
        p_entity_key: entityKey ?? null,
        p_master_tables: masterTables ? [...masterTables] : null,
        p_only_orphans: Boolean(onlyOrphans),
      })
      // 조회 실패를 삼키지 않는다 — 삼키면 "권한이 없다"와 "게스트가 없다"가 같은 빈 화면이 된다.
      if (error) throw error
      const rows = (data ?? []) as RawRow[]
      return {
        rows: rows.map((r) => ({ ...r, programs: r.programs ?? [], identities: r.identities ?? [] })),
        // 총 건수는 행마다 같은 값으로 실려 온다(윈도 카운트). 행이 없으면 0이다.
        total: rows[0] ? Number(rows[0].total_count) : 0,
      }
    },
  })
}

/** 이 원장 행에 이미 선 계정 하나. 명부 추가의 사람 고르기가 중복을 눈으로 막게 한다. */
export interface LedgerAccount {
  userId: string
  name: string | null
  email: string | null
  isActive: boolean
}

/**
 * 이 원장 행에 이미 선 계정들.
 *
 * 명부 추가의 사람 고르기가 이 목록을 세우는 이유는 **중복을 눈으로 막기 위해서**다. 서버는
 * 같은 이메일이 오면 그 계정을 그대로 돌려주므로(멱등) 사고가 나지는 않지만, 담당자는
 * "이 회사에 이미 누가 들어와 있나"를 알아야 같은 사람에게 두 번 안내하지 않는다. 그 목록의
 * 첫 사람이 곧 기본값이 되므로, 두 번째 사업에 담을 때 계정이 저절로 재사용된다.
 *
 * `users` 임베드가 통하는 것은 `guest_identities.user_id`에 FK가 있고 `users`의 SELECT가
 * 내부 사용자 전원에게 열려 있기 때문이다(참가자 명부가 게스트 이름을 붙이려면 그래야 한다).
 * 인격 행 자체는 2026-09-08부터 **그 원장을 읽을 수 있는 사람에게만** 보인다.
 */
export function useLedgerAccounts(masterTable: MasterTable, masterId: string | null) {
  return useQuery({
    queryKey: ['admin', 'guest-ledger-accounts', masterTable, masterId],
    enabled: Boolean(masterId),
    queryFn: async (): Promise<LedgerAccount[]> => {
      const { data, error } = await supabase
        .from('guest_identities')
        .select('user_id, users!inner(name, email, is_active, deleted_at)')
        .eq('master_table', masterTable)
        .eq('master_id', masterId!)
      if (error) throw error
      type Row = {
        user_id: string
        users: { name: string | null; email: string | null; is_active: boolean; deleted_at: string | null }
      }
      return ((data ?? []) as unknown as Row[])
        .filter((r) => !r.users.deleted_at)
        .map((r) => ({
          userId: r.user_id,
          name: r.users.name,
          email: r.users.email,
          isActive: r.users.is_active,
        }))
    },
  })
}

/**
 * 계정 정지·해제. 사업 하나를 닫는 것이 아니라 **그 계정이 걸린 모든 사업에서 동시에** 멈춘다.
 * 사업 단위로 닫는 것은 그 사업 담당자의 몫이다(참가자 명부의 로그인 차단).
 * **ADMIN 전용**이다 — 한 계정이 여러 사업에 걸리므로 담당자가 정지하면 남의 사업까지 죽는다.
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
