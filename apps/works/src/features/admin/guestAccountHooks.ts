import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import {
  PARTICIPANT_PERSONAS,
  type MasterTable,
} from '@/features/program/participantPersona'
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
) {
  return useQuery({
    queryKey: [
      'admin',
      'guest-accounts',
      keyword,
      page,
      entityKey ?? 'all',
      masterTables?.join(',') ?? 'all',
    ],
    placeholderData: keepPreviousData,
    queryFn: async (): Promise<GuestAccountPage> => {
      const { data, error } = await supabase.rpc('guest_accounts_list', {
        p_search: keyword.trim() || null,
        p_limit: GUEST_PAGE_SIZE,
        p_offset: page * GUEST_PAGE_SIZE,
        p_entity_key: entityKey ?? null,
        p_master_tables: masterTables ? [...masterTables] : null,
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
  /** 원장이 든 담당자 이름(기업=대표자, 전문가=본인). 발급 폼의 **기본값**이다. */
  loginName: string | null
  email: string | null
  phone: string | null
  /**
   * 이 원장 행에 이미 선 계정 수(2026-09-08 `hasAccount` 대체).
   *
   * 참·거짓으로는 부족해졌다 — 한 회사에 담당자가 여럿일 수 있게 되면서, 발급하려는
   * 사람에게 계정이 있는지는 이 값이 답하지 못한다. 목록에서는 "몇 명이 이미 들어와
   * 있는가"만 말하고, 누가 있는지는 고른 뒤 폼이 보여 준다(`useLedgerAccounts`).
   */
  accountCount: number
}

/** 이 원장 행에 이미 선 계정 하나. 발급 폼이 중복을 눈으로 막게 한다. */
export interface LedgerAccount {
  userId: string
  name: string | null
  email: string | null
  isActive: boolean
}

/**
 * 발급 대상 검색. 원장에 **이미 있는 행**만 고를 수 있다 — 이 화면에서 신규 등록을 하지
 * 않는 것은 명부 매핑과 같은 이유다(급히 받아적은 값이 마스터를 덮어쓰면 어느 쪽이 정본인지
 * 판정할 근거가 사라진다).
 *
 * 값이 모자란 대상도 목록에서 빼지 않고 고를 수 없는 채로 남긴다 — 빼면 "왜 안 보이지"가
 * 되고, 남기면 "무엇을 보완해야 하는지"가 남는다.
 */
export function useIssueCandidates(masterTable: MasterTable, search: string) {
  const kw = search.trim()
  return useQuery({
    queryKey: ['admin', 'guest-issue-candidates', masterTable, kw],
    enabled: kw.length > 0,
    queryFn: async (): Promise<IssueCandidate[]> => {
      // 어느 표를 어떤 컬럼으로 읽고 그 행에서 무엇을 꺼내는지는 자격 설정이 답한다 —
      // 원장이 넷이 된 뒤로 이 자리의 삼항은 "이것이 아니면 저것"밖에 말하지 못한다.
      const { ledger } = PARTICIPANT_PERSONAS[masterTable]
      let query = supabase
        .from(ledger.table)
        .select(ledger.columns)
        .ilike('name', `%${sanitizeLike(kw)}%`)
        .is('deleted_at', null)
        .limit(20)
      if (ledger.narrow) query = query.eq(ledger.narrow.column, ledger.narrow.value)
      const { data, error } = await query
      if (error) throw error
      const rows = ((data ?? []) as unknown as Record<string, unknown>[]).map((raw) => ({
        id: String(raw.id),
        ...ledger.map(raw),
      }))
      if (rows.length === 0) return []

      // 원장 행마다 이미 선 계정 수. 한 행에 여러 줄이 올 수 있으므로 세어서 담는다
      // (2026-09-08 1:N 전환 — 종전에는 있음/없음 하나였다).
      const { data: accounts } = await supabase
        .from('guest_identities')
        .select('master_id')
        .eq('master_table', masterTable)
        .in('master_id', rows.map((r) => r.id))
      const counts = new Map<string, number>()
      for (const a of (accounts ?? []) as { master_id: string }[]) {
        counts.set(a.master_id, (counts.get(a.master_id) ?? 0) + 1)
      }

      return rows.map((r) => ({
        id: r.id,
        name: r.name,
        loginName: r.loginName,
        email: r.email,
        phone: r.phone,
        accountCount: counts.get(r.id) ?? 0,
      }))
    },
  })
}

/**
 * 이 원장 행에 이미 선 계정들.
 *
 * 발급 폼이 이 목록을 세우는 이유는 **중복을 눈으로 막기 위해서**다. 서버는 같은 이메일이
 * 오면 그 계정을 그대로 돌려주므로(멱등) 사고가 나지는 않지만, 담당자는 "이 회사에 이미
 * 누가 들어와 있나"를 발급 전에 알아야 같은 사람에게 두 번 안내하지 않는다.
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
 * 계정 발급 — **원장 행 × 사람**에 계정 하나(멱등).
 *
 * 내부 사용자 전원이 부를 수 있다. 발급만으로는 아무것도 보이지 않기 때문이다 — 사업에
 * 매핑되기 전까지 그 계정으로 로그인해도 "접근 가능한 사업이 없습니다"만 뜬다. 권한이 걸릴
 * 자리는 발급이 아니라 **매핑**이며, 그것은 그 사업 담당자만 할 수 있다.
 *
 * 2026-09-08부터 사람을 함께 넘긴다. 넘기지 않으면 서버가 종전대로 원장 연락처를 쓰므로
 * 명부에서 여는 경로(`open_program_guest_access`)는 바뀌지 않는다.
 */
export function useIssueGuestAccount() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (v: {
      masterTable: MasterTable
      masterId: string
      name?: string | null
      email?: string | null
      phone?: string | null
    }): Promise<string> => {
      const { data, error } = await supabase.rpc('issue_guest_account', {
        p_master_table: v.masterTable,
        p_master_id: v.masterId,
        p_name: v.name?.trim() || null,
        p_email: v.email?.trim() || null,
        p_phone: v.phone?.trim() || null,
      })
      if (error) throw error
      return data as string
    },
    onSuccess: (_data, v) => {
      void qc.invalidateQueries({ queryKey: ['admin', 'guest-accounts'] })
      void qc.invalidateQueries({ queryKey: ['admin', 'guest-issue-candidates'] })
      void qc.invalidateQueries({
        queryKey: ['admin', 'guest-ledger-accounts', v.masterTable, v.masterId],
      })
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
