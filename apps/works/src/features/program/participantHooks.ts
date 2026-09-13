import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { sanitizeOrValue } from '@/features/master/ledgerPage'
import {
  PARTICIPANT_PERSONAS,
  isMasterTable,
  type LedgerFacts,
  type MasterTable,
} from '@/features/program/participantPersona'
import { useGuestHost } from '@/features/guest/host'
import { SHARED_TABLES } from '@/features/program/workspace'
import { isGuestUserType } from '@/lib/userTypes'
import { addProgramGuestAccounts } from '@/features/program/programGuestAccountService'

/**
 * 참가자 명부(참여 기업·참여 전문가) 데이터 계층.
 *
 * 명부의 값은 원장이 소유한다 — 여기서는 복제하지 않고 조회로 합성한다. master_id는 FK가 아닌
 * soft ref라 임베드가 되지 않으므로, 명부를 읽은 뒤 원장을 한 번 더 읽어 이름·연락처를 붙인다.
 *
 * **어느 원장을 어떻게 읽는지는 이 파일이 알지 않는다** — 자격 설정(`PARTICIPANT_PERSONAS`)이
 * 표 이름·컬럼·좁히는 조건·읽는 방법을 함께 갖고, 여기서는 명부 행에 적힌 자격으로 그것을
 * 꺼내 쓴다. 그래서 자격을 하나 더 여는 일에 이 파일은 손대지 않는다.
 *
 * 근거: docs/docs_planning/3_4_4_ac_participant_pool.md
 */

/** 명부 행의 게스트 로그인 개방 상태(participant_login_status). */
export type ParticipantLoginStatus =
  | 'NOT_APPLICABLE'
  | 'NOT_ALLOWED'
  | 'INVITED'
  | 'ACTIVE'
  | 'BLOCKED'

export type { MasterTable }

export interface ParticipantRow {
  id: string
  master_table: MasterTable | null
  master_id: string | null
  user_id: string | null
  login_status: ParticipantLoginStatus
  /**
   * 이 대상에게 게스트 계정이 이미 있는가. 계정의 키가 원장 행이라 명부 행만으로 판정할 수
   * 있으므로, 담당자가 계정 발급 화면을 확인하러 갈 필요가 없다.
   */
  hasAccount: boolean
  /** 그 계정의 id(재설정 안내 발송 대상). 계정이 없으면 null. */
  accountId: string | null
  /**
   * 이 줄이 **누구로** 들어와 있는가 — 그 계정의 성명·이메일.
   *
   * `loginName`과 갈린다: 저쪽은 원장이 적어 둔 명의(기업의 대표자)이고 이쪽은 실제로 문을
   * 여는 사람이다. 2026-09-08에 담을 때 사람을 직접 정하게 되면서 둘이 달라질 수 있게 됐고
   * (한 회사에 김이사·박상무), 계정을 다루는 화면은 원장이 아니라 이쪽을 세워야 한다.
   */
  accountName: string | null
  accountEmail: string | null
  /**
   * 그 계정의 유형(`users.user_type`). 계정이 붙지 않은 줄은 null이다.
   *
   * 2026-09-13에 실었다. GUEST 명부가 자격 탭을 걷고 **계정 하나로 서는 명부**가 되면서,
   * "원장이 없는 줄"이 두 갈래로 갈렸기 때문이다 — 원장을 잇지 않은 **게스트 계정**과 실제
   * **내부 임직원**. 종전에는 `master_table`이 비었다는 사실 하나로 둘을 구분하지 않고
   * 임직원이라 적었고, 그래서 원장 없는 게스트가 화면에서 임직원으로 불렸다.
   */
  userType: string | null
  /**
   * 이 줄이 **외부 게스트 계정**을 달고 있는가. 판정은 `lib/userTypes` 한 벌이 소유한다.
   *
   * 계정이 아직 없는 줄(`user_id`가 null)은 false다 — 게스트가 아니라는 뜻이 아니라
   * *아직 계정이 없다*는 뜻이며, 임직원인지 여부는 `isGuestRosterRow`가 따로 답한다.
   */
  isGuestAccount: boolean
  /** 그 계정의 마지막 접속 시각. 아직 한 번도 없으면 null. */
  lastLoginAt: string | null
  /**
   * 이 줄을 명부에 담은 사람. 어떤 권한도 주지 않는 서술 값이며 트리거가 찍는다 —
   * 관리 주체는 사업 담당자이고, 이 값은 "누가 담았나"에만 답한다.
   *
   * 컬럼은 2026-09-05에 생겼다(20260905180000). 그 전에 담긴 줄은 알 수 없어 비어 있고,
   * 지어내지 않고 그대로 비운다 — 없는 사실을 채우면 그 화면이 거짓을 말한다.
   */
  createdByName: string | null
  /** 원장에서 온 대상 이름(기업명 또는 전문가명). 원장이 없으면 계정 이름. */
  targetName: string
  /** 부제(기업은 대표자, 전문가는 소속). */
  subtitle: string
  /** 로그인 주체의 성명(기업=대표자, 전문가=본인). 원장이 없으면 null. */
  loginName: string | null
  email: string | null
  /** 계정이 있으면 계정 생성 시 확정한 전화번호, 없으면 원장의 현재 연락처. */
  phone: string | null
  /**
   * 원장이 이 대상을 무엇으로 분류하는가. 명부가 스스로 분류하지 않고 원장의 분류를 그대로
   * 비춘다 — 라벨·톤 매핑은 자격 설정의 `categoryBadge`가 갖는다.
   */
  masterCategory: string | null
}

/** 원장에서 고를 수 있는 후보 1건. */
export interface MasterCandidate {
  id: string
  name: string
  /** 로그인 명의(기업=대표자, 전문가=본인 이름). 없으면 매핑 불가. */
  loginName: string | null
  email: string | null
  phone: string | null
  /** 이미 이 사업에 같은 자격으로 올라 있는가. */
  alreadyMapped: boolean
}

interface RawParticipant {
  id: string
  master_table: string | null
  master_id: string | null
  user_id: string | null
  login_status: ParticipantLoginStatus
  user: {
    name: string | null
    email: string | null
    phone: string | null
    user_type: string | null
  } | null
  creator: { name: string | null } | null
}

/**
 * 명부 select. 계정 임베드에는 FK 힌트를 반드시 단다 — 명부에서 users로 가는 길이 셋이라
 * (`user_id` = 로그인 주체, `login_opened_by` = 문을 연 담당자, `created_by` = 명부에 담은
 * 사람) 힌트가 없으면 PostgREST가 어느 쪽인지 판정하지 못하고 조회 전체를 거절한다
 * (PGRST201). 제약 이름은 원장마다 다르므로 물리 테이블명으로 조립한다(programCols가
 * 임베드를 조립하는 것과 같은 축).
 */
function participantCols(table: string): string {
  return (
    'id, master_table, master_id, user_id, login_status, ' +
    // 계정 유형을 함께 읽는다 — 원장 없는 게스트와 내부 임직원을 가르는 유일한 값이다.
    `user:users!${table}_user_id_fkey(name, email, phone, user_type), ` +
    `creator:users!${table}_created_by_fkey(name)`
  )
}

/**
 * `in()` 한 번에 싣는 id 수. 넘으면 URL 길이 한계에 걸려 조회 자체가 거절된다
 * (NETWORKS 임포터가 쓰는 값과 같다 — 같은 이유로 같은 수여야 한다).
 */
const IN_CHUNK = 200

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
  return out
}

/**
 * 명부 행이 가리키는 원장 행을 자격별로 읽어 `자격:id → 사실`로 세운다.
 *
 * 자격 수만큼 병렬 조회가 돌고, 자격이 늘어도 이 함수는 그대로다 — 어느 표를 어떤 컬럼으로
 * 읽는지는 자격 설정이 답한다.
 *
 * **조회 실패를 삼키지 않는다**(2026-09-09). 종전에는 `error`를 버려서 원장 SELECT가 RLS에
 * 막히거나 네트워크가 끊겼을 때 그 줄이 조용히 `미지정`이 됐다 — 명단 조회는 에러를 던지는데
 * 원장 조회만 삼키는 비대칭이었고, **원장 행이 지워진 것과 읽을 권한이 없는 것이 화면에서
 * 같아졌다.** M&A에서 특히 위험하다: `ma_sellers`는 인격 자체가 기밀이라, 못 읽은 이유를
 * 화면이 답하지 못하면 담당자가 "이 셀러는 삭제됐다"로 읽는다.
 *
 * **id는 나눠 싣는다.** 명단은 수백 건이 될 수 있고, `in()` 한 번에 전부 실으면 URL 길이
 * 한계에 걸려 목록 전체가 빈 화면이 된다.
 */
export async function loadLedgerFacts(
  rows: { master_table: string | null; master_id: string | null }[],
): Promise<Map<string, LedgerFacts>> {
  const byPersona = new Map<MasterTable, string[]>()
  for (const row of rows) {
    if (!isMasterTable(row.master_table) || !row.master_id) continue
    const ids = byPersona.get(row.master_table) ?? []
    ids.push(row.master_id)
    byPersona.set(row.master_table, ids)
  }

  const facts = new Map<string, LedgerFacts>()
  await Promise.all(
    [...byPersona].flatMap(([key, ids]) => {
      const { ledger } = PARTICIPANT_PERSONAS[key]
      return chunk([...new Set(ids)], IN_CHUNK).map(async (batch) => {
        const { data, error } = await supabase
          .from(ledger.table)
          .select(ledger.columns)
          .in('id', batch)
        if (error) throw error
        for (const raw of (data ?? []) as unknown as Record<string, unknown>[]) {
          facts.set(`${key}:${String(raw.id)}`, ledger.map(raw))
        }
      })
    }),
  )
  return facts
}

/** 명부 전체(자격 탭은 화면이 거른다). 원장 값은 조회로 합성한다. */
export function useProgramParticipants(programId: string | undefined) {
  const config = useGuestHost()
  return useQuery({
    queryKey: [config.key, 'participants', programId],
    enabled: Boolean(programId),
    queryFn: async (): Promise<ParticipantRow[]> => {
      const { data, error } = await supabase
        .from(SHARED_TABLES.participants)
        .select(participantCols(SHARED_TABLES.participants))
        // 통합 원장이므로 소속을 함께 건다. 사업 id로 좁히면 실제로는 한 원장의 행만 오지만,
        // 그 사실에 기대는 조회는 원장이 하나 더 열리는 날 조용히 남의 행을 집는다.
        .eq('entity_key', config.entityKey)
        .eq('program_id', programId)
        .order('created_at', { ascending: true })
      // 조회 실패를 삼키지 않는다 — 삼키면 "권한이 없다"와 "명부가 비었다"가 같은 화면이 되고,
      // 실제로 임베드가 깨졌을 때 빈 목록만 남아 원인을 짚을 수 없다.
      if (error) throw error
      const rows = (data ?? []) as unknown as RawParticipant[]

      const facts = await loadLedgerFacts(rows)

      // 계정 유무는 명부 행이 아니라 **원장 행**이 답한다(인격 매핑이 그것을 들고 있다).
      // 그래서 아직 이 사업에 문을 열지 않은 대상도 "계정 있음"으로 뜬다 — 담당자가
      // 신규인지 기존인지 구분할 필요 없이 `연결` 하나만 누르면 되는 근거가 여기다.
      // 한 계정이 여러 인격을 가질 수 있으므로(참여 기업 + 참여 전문가) 계정이 아니라
      // 매핑표를 읽는다.
      const masterIds = rows.map((r) => r.master_id).filter(Boolean) as string[]
      const accountsRes = masterIds.length
        ? await supabase
            .from('guest_identities')
            .select('master_table, master_id, user_id')
            .in('master_id', masterIds)
        : { data: [] }
      // **원장 행에 계정이 있는가**만 답하는 집합이다(2026-09-08). 종전에는
      // `원장행 → 계정id` 지도였는데, 한 원장 행이 계정 여럿을 가질 수 있게 되면서
      // (3_9_2 §5) 그 지도는 임의의 한 명을 답하게 됐다. "이 참여자의 계정"은 지도가
      // 아니라 명부 행의 `user_id`가 답한다 — 문을 열 때 그 사람으로 박히기 때문이다.
      const ledgerHasAccount = new Set(
        ((accountsRes.data ?? []) as {
          master_table: string
          master_id: string
          user_id: string
        }[]).map((g) => `${g.master_table}:${g.master_id}`),
      )

      const accountIds = [...new Set(rows.map((r) => r.user_id).filter(Boolean) as string[])]
      // 마지막 접속은 초대 레코드가 갖는다(사업마다 한 건). 계정 단위로 최댓값을 취한다.
      const usedRes = accountIds.length
        ? await supabase
            .from('guest_invitations')
            .select('app_user_id, used_at')
            .in('app_user_id', accountIds)
        : { data: [] }
      const lastLogin = new Map<string, string>()
      for (const row of (usedRes.data ?? []) as { app_user_id: string; used_at: string | null }[]) {
        if (!row.used_at) continue
        const prev = lastLogin.get(row.app_user_id)
        if (!prev || prev < row.used_at) lastLogin.set(row.app_user_id, row.used_at)
      }

      return rows.map((r) => {
        const persona = isMasterTable(r.master_table) ? r.master_table : null
        const key = persona && r.master_id ? `${persona}:${r.master_id}` : null
        const master = key ? facts.get(key) : undefined
        // 이 참여자의 계정은 명부 행이 답한다. 원장 행에 다른 사람의 계정이 있어도
        // 그것은 이 줄의 계정이 아니다(1:N 전환 이후 갈리는 자리다).
        const accountId = r.user_id ?? null
        // 반면 "계정 있음" 표시는 원장 행 기준이다 — 아직 문을 열지 않은 대상도 그렇게
        // 떠야 담당자가 신규인지 기존인지 구분하지 않고 `로그인 열기` 하나만 누르면 된다.
        const hasAccount = Boolean(accountId) || Boolean(key && ledgerHasAccount.has(key))
        return {
          id: r.id,
          master_table: persona,
          master_id: r.master_id,
          user_id: r.user_id,
          login_status: r.login_status,
          hasAccount,
          accountId,
          accountName: r.user?.name ?? null,
          accountEmail: r.user?.email ?? null,
          userType: r.user?.user_type ?? null,
          isGuestAccount: Boolean(accountId) && isGuestUserType(r.user?.user_type),
          lastLoginAt: accountId ? (lastLogin.get(accountId) ?? null) : null,
          createdByName: r.creator?.name ?? null,
          targetName: master?.name || r.user?.name || '미지정',
          subtitle: master?.subtitle ?? '',
          loginName: master?.loginName ?? null,
          email: master?.email ?? r.user?.email ?? null,
          // 계정이 선 뒤에는 계정 생성 때 확정한 전화번호를 보여 준다. 원장 연락처가 바뀌어도
          // 로그인 초기값은 바뀌지 않으며, 계정이 아직 없는 옛 명부 행만 원장값을 미리 본다.
          phone: r.user?.phone ?? master?.phone ?? null,
          masterCategory: master?.category ?? null,
        }
      })
    },
  })
}

/**
 * 원장 후보 검색 — **원장만 읽고 '이미 담김' 판정은 하지 않는다.**
 *
 * 담긴 여부를 여기서 묻지 않는 이유는 그 답을 가진 표가 화면마다 다르기 때문이다(GUEST
 * 명부는 `program_participants`, 참가자 목록은 `program_participant_entries`). 원장을 어떻게
 * 읽는가는 하나이고 무엇과 대조하는가는 둘이므로, 하나인 쪽만 여기 두고 대조는 부르는 쪽이 한다.
 *
 * 성명·연락처가 없는 대상도 함께 돌려주고 화면이 사유를 표시한다 — 목록에서 빼 버리면
 * "왜 안 보이지"가 되고, 보이되 사유가 붙어야 "무엇을 보완해야 하는지"가 남는다.
 */
export async function fetchLedgerCandidates(
  master: MasterTable,
  search: string,
): Promise<Omit<MasterCandidate, 'alreadyMapped'>[]> {
  const { ledger } = PARTICIPANT_PERSONAS[master]
  let query = supabase
    .from(ledger.table)
    .select(ledger.columns)
    .is('deleted_at', null)
    .order('name', { ascending: true })
    .limit(50)
  if (ledger.narrow) query = query.eq(ledger.narrow.column, ledger.narrow.value)
  // 이미 정본으로 흡수된 행은 고를 수 없다 — 담으면 그 줄이 정본이 아닌 곳을 가리키고,
  // 정본을 고쳐도 명단은 옛 값을 계속 든다. 컬럼이 없는 원장에는 이 조건이 서지 않는다.
  if (ledger.mergedColumn) query = query.is(ledger.mergedColumn, null)
  const kw = sanitizeOrValue(search.trim())
  if (kw) query = query.or(ledger.searchColumns.map((c) => `${c}.ilike.%${kw}%`).join(','))

  const { data, error } = await query
  if (error) throw error

  return ((data ?? []) as unknown as Record<string, unknown>[]).map((raw) => {
    const facts = ledger.map(raw)
    return {
      id: String(raw.id),
      name: facts.name,
      loginName: facts.loginName,
      email: facts.email,
      phone: facts.phone,
    }
  })
}

/**
 * 후보 목록 한 페이지에 서는 계정 수.
 *
 * 서버 페이징이다(ADMIN 창구의 30보다 작다) — 이 목록은 모달 안 왼쪽 기둥이라 한 화면에
 * 서는 줄이 그만큼 적고, 페이지가 길면 아래쪽 줄은 스크롤해야만 보인다.
 */
export const GUEST_CANDIDATE_PAGE_SIZE = 20

/** 계정이 가진 인격 하나 — 어느 원장의 누구인가. */
export interface GuestAccountIdentity {
  masterTable: MasterTable
  masterId: string
  name: string | null
}

/** GUEST 명부에 이을 수 있는 **이미 있는 계정** 한 건. */
export interface GuestAccountCandidate {
  userId: string
  name: string
  /**
   * 연락처. **서버가 정책대로 마스킹해 보낸 값**이라 화면에서 다시 가리지 않는다
   * (ADMIN에게만 원본이 온다 — `guest_accounts_list`).
   */
  email: string | null
  phone: string | null
  /** 계정 축의 정지 여부. 정지된 계정도 명부에는 이을 수 있고, 문은 따로 답한다. */
  isActive: boolean
  /**
   * 이 계정이 가진 인격 **전부**. 하나를 골라 대표로 적지 않는다 — 한 사람이 스타트업
   * 대표이면서 전문가일 수 있고, 화면이 조용히 하나를 고르면 담당자가 본 자격과 실제로
   * 이어지는 자격이 어긋난다. 인격이 없는 계정(원장 미연결)은 빈 배열이다.
   */
  identities: GuestAccountIdentity[]
}

export interface GuestAccountCandidatePage {
  rows: GuestAccountCandidate[]
  /** 검색어를 반영한 전체 건수(서버 윈도 카운트). 페이저가 몇 장인지 답한다. */
  total: number
}

interface RawGuestAccountRow {
  user_id: string
  name: string | null
  email: string | null
  phone: string | null
  is_active: boolean
  identities: { master_table: string; master_id: string; name: string | null }[] | null
  total_count: number | string
}

/**
 * GUEST 명부에 이을 **계정 후보** — 전사 GUEST 계정 원장에서 고른다(2026-09-13 사용자 확정).
 *
 * 종전 이 자리는 *원장 후보*였다(`useMasterCandidates`, 2026-09-09~2026-09-13). 그때는 이
 * 창이 계정을 **세우는** 자리였으므로 "누구를 들일지 정한 목록에서만 고른다"가 옳았다.
 * 지금은 세우지 않는다 — 생성 창구는 `/guest-accounts` 하나뿐이고 이 창은 **이미 있는
 * 계정을 잇기만 한다.** 그래서 고르는 대상이 원장 행이 아니라 계정이 되었고, 원장 연결은
 * 계정의 선택적 속성이라 연결이 없는 계정도 후보에 선다.
 *
 * **서버가 걸러 서버가 페이징한다.** 계정은 전사 규모라 한 번에 받아 화면에서 거르면 첫
 * 페이지 안에서만 검색이 걸린다 — '2쪽에는 있는데 1쪽에서 0건'이 되는 그 오작동이다.
 *
 * **보이지 않아야 할 계정은 애초에 오지 않는다.** `guest_accounts_list`는 SECURITY INVOKER로
 * 호출자가 실제로 읽을 수 있는 인격·참여만 세우므로, M&A 전용 계정은 그 원장을 읽을 수 없는
 * 담당자에게 **존재 자체가 보이지 않는다.** 화면에서 숨기는 것이 아니라 서버가 답하지 않는다.
 *
 * **자격으로 좁히지 않는다**(`p_master_tables`를 보내지 않는다). 그 인자는 "이 원장의 인격을
 * 가진 계정만"이라는 뜻이라, 보내는 순간 **원장 연결이 없는 계정이 전부 사라진다** — 이번
 * 개편이 세우려는 바로 그 계정들이다.
 */
export function useGuestAccountCandidates(search: string, page: number) {
  const term = search.trim()
  return useQuery({
    queryKey: ['guest-account-candidates', term, page],
    // 페이지·검색어를 바꿀 때 목록이 빈 화면으로 깜빡이면 방금 무엇을 보고 있었는지 잃는다.
    placeholderData: keepPreviousData,
    queryFn: async (): Promise<GuestAccountCandidatePage> => {
      const { data, error } = await supabase.rpc('guest_accounts_list', {
        p_search: term || null,
        p_limit: GUEST_CANDIDATE_PAGE_SIZE,
        p_offset: page * GUEST_CANDIDATE_PAGE_SIZE,
        p_entity_key: null,
        p_master_tables: null,
        p_only_orphans: false,
      })
      // 조회 실패를 삼키지 않는다 — 삼키면 "권한이 없다"와 "계정이 없다"가 같은 빈 화면이 된다.
      if (error) throw error
      const rows = (data ?? []) as RawGuestAccountRow[]
      return {
        rows: rows.map((r) => ({
          userId: r.user_id,
          // 이름 없는 계정은 있을 수 없지만, 없다면 지어내지 않고 없다고 적는다.
          name: r.name?.trim() || '(이름 없음)',
          email: r.email,
          phone: r.phone,
          isActive: r.is_active,
          identities: (r.identities ?? [])
            .filter((i) => isMasterTable(i.master_table))
            .map((i) => ({
              masterTable: i.master_table as MasterTable,
              masterId: i.master_id,
              name: i.name,
            })),
        })),
        // 총 건수는 행마다 같은 값으로 실려 온다(윈도 카운트). 행이 없으면 0이다.
        total: rows[0] ? Number(rows[0].total_count) : 0,
      }
    },
  })
}

/**
 * 고른 계정을 이 사업·조합의 GUEST 명부에 **잇는다**. 계정을 만들지 않는다.
 *
 * 쓰기는 서버 창구 하나가 진다(`programGuestAccountService`) — 화면에서 `program_participants`에
 * 직접 INSERT하면 `entity_key`·중복·인가를 화면이 저마다 판정하게 되고, 그중 하나를 빠뜨린
 * 화면이 남의 사업에 줄을 만든다. 응답 계약이 아직 미확정이라 그 미확정도 그 파일이 가둔다.
 *
 * 명부에 담는 일과 **문을 여는 일은 여전히 갈려 있다** — 이어도 로그인은 열리지 않으며,
 * 여는 것은 그 사업 담당자(PM·MEMBER)의 별도 동작이다(`participantAccessHooks`).
 */
export function useAddGuestAccounts(programId: string) {
  const config = useGuestHost()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (userIds: string[]) =>
      addProgramGuestAccounts({ entityKey: config.entityKey, programId, userIds }),
    // 응답이 끊겨도 서버에서는 반영됐을 수 있다. 성공 때만 새로고침하면 같은 계정을 다시
    // 보낼 수 있으므로, 어느 결말이든 정본인 명부와 후보 목록을 다시 읽는다.
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: [config.key, 'participants', programId] })
      // 후보 목록은 '이미 담긴 계정'을 화면에서 걸러 세우므로 함께 상한다.
      void qc.invalidateQueries({ queryKey: ['guest-account-candidates'] })
      // 계정의 참여 사업 수가 달라졌으므로 ADMIN 창구의 목록도 함께 상한다.
      void qc.invalidateQueries({ queryKey: ['admin', 'guest-accounts'] })
    },
  })
}
