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
  /** 이 참여 줄의 접근 종료. 계정이 아니라 줄이 기간을 갖는다(3_9_1 §8). */
  access_ends_at: string | null
  /** 이 줄의 자격. 같은 계정이 한 사업에 두 자격으로 걸리면 줄이 둘이다. */
  master_table: 'startups' | 'networks' | null
}

/** 계정이 가진 인격 하나 — 어느 원장의 누구로 참여하는가. */
export interface GuestIdentity {
  master_table: 'startups' | 'networks'
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
   * 이 계정이 가진 인격들. 한 사람이 참가기업(기업 대표)이면서 참가전문가일 수 있으므로
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

interface RawRow extends Omit<GuestAccount, 'programs' | 'identities'> {
  programs: GuestAccountProgram[] | null
  identities: GuestIdentity[] | null
  total_count: number | string
}

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
        rows: rows.map((r) => ({ ...r, programs: r.programs ?? [], identities: r.identities ?? [] })),
        // 총 건수는 행마다 같은 값으로 실려 온다(윈도 카운트). 행이 없으면 0이다.
        total: rows[0] ? Number(rows[0].total_count) : 0,
      }
    },
  })
}

/**
 * `.ilike()` 패턴에서 와일드카드(`%`·`_`)와 필터 제어문자를 뺀다. PostgREST는 ESCAPE 절을
 * 받지 않으므로, 남겨 두면 입력이 필터의 뜻을 바꾼다(`%`만 넣으면 원장 전체가 걸린다).
 * 원장의 이름은 사실상 이 문자들을 담지 않아 유실 영향이 없다.
 */
function sanitizeLike(v: string): string {
  return v.replace(/[%_(),]/g, ' ').trim()
}

/** 발급 대상 후보 1건. 계정을 세우려면 이름·이메일·연락처가 원장에 모두 있어야 한다. */
export interface IssueCandidate {
  id: string
  name: string
  /** 로그인 명의(기업=대표자, 전문가=본인). 없으면 발급 불가. */
  loginName: string | null
  email: string | null
  phone: string | null
  /** 이미 계정이 있는가. 있으면 발급이 아니라 그대로 돌려받는다(멱등). */
  hasAccount: boolean
}

/**
 * 발급 대상 검색. 원장에 **이미 있는 행**만 고를 수 있다 — 이 화면에서 신규 등록을 하지
 * 않는 것은 명부 매핑과 같은 이유다(급히 받아적은 값이 마스터를 덮어쓰면 어느 쪽이 정본인지
 * 판정할 근거가 사라진다).
 *
 * 값이 모자란 대상도 목록에서 빼지 않고 고를 수 없는 채로 남긴다 — 빼면 "왜 안 보이지"가
 * 되고, 남기면 "무엇을 보완해야 하는지"가 남는다.
 */
export function useIssueCandidates(masterTable: 'startups' | 'networks', search: string) {
  const kw = search.trim()
  return useQuery({
    queryKey: ['admin', 'guest-issue-candidates', masterTable, kw],
    enabled: kw.length > 0,
    queryFn: async (): Promise<IssueCandidate[]> => {
      const nameCol = masterTable === 'startups' ? 'name' : 'name'
      const cols =
        masterTable === 'startups'
          ? 'id, name, representative, email, phone'
          : 'id, name, email, phone'
      const { data, error } = await supabase
        .from(masterTable)
        .select(cols)
        .ilike(nameCol, `%${sanitizeLike(kw)}%`)
        .is('deleted_at', null)
        .limit(20)
      if (error) throw error
      const rows = (data ?? []) as unknown as {
        id: string
        name: string
        representative?: string | null
        email: string | null
        phone: string | null
      }[]
      if (rows.length === 0) return []

      const { data: accounts } = await supabase
        .from('guest_identities')
        .select('master_id')
        .eq('master_table', masterTable)
        .in('master_id', rows.map((r) => r.id))
      const has = new Set(((accounts ?? []) as { master_id: string }[]).map((a) => a.master_id))

      return rows.map((r) => ({
        id: r.id,
        name: r.name,
        loginName: masterTable === 'startups' ? (r.representative ?? null) : r.name,
        email: r.email?.trim() || null,
        phone: r.phone?.trim() || null,
        hasAccount: has.has(r.id),
      }))
    },
  })
}

/** 계정을 세울 수 있는 조건 — 이메일은 로그인 ID이고 연락처는 초기 비밀번호다. */
export function canIssue(c: IssueCandidate): boolean {
  return c.hasAccount || Boolean(c.loginName && c.email && c.phone)
}

export function issueBlockReason(c: IssueCandidate): string | null {
  if (canIssue(c)) return null
  const missing = [
    !c.loginName ? '성명' : null,
    !c.email ? '이메일' : null,
    !c.phone ? '연락처' : null,
  ].filter(Boolean)
  return `${missing.join('·')} 없음 · 원장에서 먼저 보완`
}

/**
 * 계정 발급 — 원장 행 하나에 계정 하나(멱등).
 *
 * 내부 사용자 전원이 부를 수 있다. 발급만으로는 아무것도 보이지 않기 때문이다 — 사업에
 * 매핑되기 전까지 그 계정으로 로그인해도 "접근 가능한 사업이 없습니다"만 뜬다. 권한이 걸릴
 * 자리는 발급이 아니라 **매핑**이며, 그것은 그 사업 담당자만 할 수 있다.
 */
export function useIssueGuestAccount() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (v: {
      masterTable: 'startups' | 'networks'
      masterId: string
    }): Promise<string> => {
      const { data, error } = await supabase.rpc('issue_guest_account', {
        p_master_table: v.masterTable,
        p_master_id: v.masterId,
      })
      if (error) throw error
      return data as string
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['admin', 'guest-accounts'] })
    },
  })
}

/**
 * 비밀번호 재설정 **안내 발송**. 호출자에게는 아무 값도 오지 않는다 — 링크는 게스트 본인
 * 연락처로만 나간다. 담당자가 값을 쥘 수 있으면 계정을 합친 순간 그 게스트가 참여 중인
 * 다른 팀 사업까지 열린다(3_9_1 §3).
 */
export function useSendGuestPasswordReset() {
  return useMutation({
    mutationFn: async (userId: string): Promise<{ notified: boolean }> => {
      const { data, error } = await supabase.functions.invoke<{
        ok?: boolean
        notified?: boolean
        message?: string
      }>('guest-password-reset', { body: { userId } })
      if (error) throw new Error(data?.message ?? error.message)
      return { notified: Boolean(data?.notified) }
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
